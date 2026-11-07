/**
 * CommsService — the provider-neutral orchestration layer for messaging.
 *
 * Responsibilities:
 *  - Resolve the active channel connection via the ChannelRouter (never a
 *    provider SDK directly).
 *  - Enforce consent/suppression, purpose enablement, and channel capabilities
 *    at dispatch time (single enforcement point).
 *  - Ensure a Pathways conversation exists and persist one message row per send
 *    (with idempotency).
 *  - Call the selected adapter and reconcile the provider status.
 *  - Normalize inbound webhooks (persist + associate + STOP/START/HELP) through
 *    the adapter's event model.
 *
 * Twilio no longer appears in this file; adding a channel is "register an
 * adapter in the router" (ADR-002/003).
 */
import type { AppConfig } from "../config.js";
import type { Repository } from "../data/repository.js";
import type { CommChannel, CommPurpose, MessageStatus } from "../domain/comms.js";
import { toE164 } from "./phone.js";
import { renderTemplate, type TemplateContext } from "./template.js";
import { ChannelRouter } from "./channelRouter.js";
import type { ProviderWebhookRequest, ResolvedConnection } from "./adapter.js";

export type DispatchRequest = {
  customerId: string;
  jobId?: string | null;
  purpose: CommPurpose;
  to: string;
  context: TemplateContext;
  idempotencyKey?: string | null;
  /** Channel to send on; defaults to SMS for the current feature set. */
  channel?: CommChannel;
};

export type DispatchOutcome = {
  ok: boolean;
  status: MessageStatus;
  messageId: string | null;
  message: string;
};

export class CommsService {
  private readonly router: ChannelRouter;

  constructor(
    private readonly repo: Repository,
    private readonly config: AppConfig,
    router?: ChannelRouter,
  ) {
    this.router = router ?? new ChannelRouter(config);
  }

  /** Resolve the active connection + adapter, or a reason it isn't usable. */
  private async resolveActive() {
    const connection = await this.repo.comms.getConnection();
    const resolution = this.router.resolve(connection);
    return { connection, resolution };
  }

  /** Validate the stored connection against the provider and persist result. */
  async validateConnection(): Promise<{ ok: boolean; message: string }> {
    const { resolution } = await this.resolveActive();
    if (!resolution.ok) {
      await this.repo.comms.markConnectionValidated(false, resolution.reason);
      return { ok: false, message: resolution.reason };
    }
    const result = await resolution.adapter.validateConnection(resolution.resolved);
    await this.repo.comms.markConnectionValidated(result.ok, result.message);
    await this.repo.comms.recordAudit({
      action: "integration.validate",
      detail: { ok: result.ok, message: result.message },
    });
    return result;
  }

  /**
   * Dispatch a single outbound message with full dispatch-time checks. Always
   * persists a message row (including when suppressed) so history is complete,
   * and attaches it to the customer's conversation for that channel.
   */
  async dispatch(req: DispatchRequest): Promise<DispatchOutcome> {
    const channel: CommChannel = req.channel ?? "sms";
    const to = toE164(req.to);

    // Ensure a conversation exists up-front so even suppressed sends thread.
    const ensureConvo = async (preview: string): Promise<string | null> => {
      if (!to) return null;
      const { id } = await this.repo.comms.ensureConversation({
        channel,
        conversationKey: to,
        customerId: req.customerId,
        lastMessagePreview: preview,
        lastMessageAt: new Date(),
      });
      return id;
    };

    const suppress = async (reason: string): Promise<DispatchOutcome> => {
      const conversationId = await ensureConvo(`[suppressed] ${reason}`);
      const { id } = await this.repo.comms.createMessage({
        conversationId,
        customerId: req.customerId,
        jobId: req.jobId ?? null,
        direction: "outbound",
        purpose: req.purpose,
        status: "suppressed",
        toNumber: to,
        body: "",
        idempotencyKey: req.idempotencyKey ?? null,
        errorDetail: reason,
      });
      await this.repo.comms.recordAudit({
        action: "message.suppressed",
        customerId: req.customerId,
        messageId: id,
        detail: { purpose: req.purpose, reason },
      });
      return { ok: false, status: "suppressed", messageId: id, message: reason };
    };

    if (!to) return suppress("Invalid or missing phone number.");

    // Connection + adapter readiness.
    const { connection, resolution } = await this.resolveActive();
    if (!resolution.ok) return suppress(resolution.reason);
    const { adapter, resolved } = resolution;

    // Channel capability gate (e.g. a channel that requires a customer-initiated
    // conversation / open reply window would be enforced here).
    const caps = adapter.getCapabilities();
    if (!caps.supportsOutbound) return suppress(`Channel ${channel} does not support outbound messages.`);

    // Purpose must be enabled for the tenant.
    const settings = await this.repo.comms.listNotificationSettings();
    const setting = settings.find((s) => s.purpose === req.purpose);
    // staff_conversation has no notification setting; treat as always enabled.
    if (setting && !setting.enabled) return suppress(`Notification "${req.purpose}" is disabled.`);

    // Consent + provider suppression.
    const consent = await this.repo.comms.getEffectiveConsent(req.customerId, req.purpose);
    if (consent === "opted_out") return suppress("Customer has opted out of this message type.");
    if (consent === "provider_blocked") return suppress("Recipient is suppressed at the carrier/provider level.");

    // Render the body (prefer the configured template; fall back to context.body).
    let body = typeof req.context.body === "string" ? (req.context.body as string) : "";
    if (!body && setting) {
      const rendered = renderTemplate(setting.templateBody, req.context);
      body = rendered.body;
      if (req.purpose === "job_completed_review" && rendered.missing.includes("review.url")) {
        return suppress("Review URL is not configured.");
      }
    }
    if (!body) return suppress("Message body is empty.");

    // Persist as queued (with idempotency) before contacting the provider.
    const conversationId = await ensureConvo(body);
    const created = await this.repo.comms.createMessage({
      conversationId,
      customerId: req.customerId,
      jobId: req.jobId ?? null,
      direction: "outbound",
      purpose: req.purpose,
      status: "queued",
      fromNumber: resolved.senderAddress,
      toNumber: to,
      body,
      idempotencyKey: req.idempotencyKey ?? null,
    });
    if (created.deduped) {
      return { ok: true, status: "queued", messageId: created.id, message: "Duplicate send prevented (idempotent)." };
    }

    const result = await adapter.sendMessage({ connection: resolved, to, body });

    if (!result.ok) {
      await this.repo.comms.updateMessageStatus(created.id, "failed", {
        errorCode: result.providerErrorCode,
        errorDetail: result.message,
      });
      await this.repo.comms.recordAudit({
        action: "message.failed",
        customerId: req.customerId,
        messageId: created.id,
        detail: { purpose: req.purpose, error: result.message },
      });
      return { ok: false, status: "failed", messageId: created.id, message: result.message };
    }

    const status = result.providerStatus as MessageStatus;
    await this.repo.comms.updateMessageStatus(created.id, status, { providerSid: result.providerMessageId });
    await this.repo.comms.recordAudit({
      action: "message.sent",
      customerId: req.customerId,
      messageId: created.id,
      detail: { purpose: req.purpose, providerMessageId: result.providerMessageId, connectionName: connection?.businessName ?? null },
    });
    return { ok: true, status, messageId: created.id, message: "Message submitted to provider." };
  }

  /**
   * Staff reply from the unified inbox (Phase 2 / SMS-FR-022). Sends an
   * outbound message on the conversation's channel to its counterparty, with
   * the staff_conversation purpose. Goes through the same dispatch-time consent
   * and suppression checks as any other outbound message.
   */
  async sendReply(conversationId: string, body: string): Promise<DispatchOutcome> {
    const info = await this.repo.comms.getConversationDispatchInfo(conversationId);
    if (!info) {
      return { ok: false, status: "failed", messageId: null, message: "Conversation not found." };
    }
    if (!info.customerId) {
      // A reply must target a known customer so consent can be evaluated.
      return {
        ok: false,
        status: "suppressed",
        messageId: null,
        message: "Associate this conversation with a customer before replying.",
      };
    }
    return this.dispatch({
      customerId: info.customerId,
      purpose: "staff_conversation",
      to: info.counterparty,
      channel: info.channel,
      context: { body },
    });
  }

  /** Admin test send to a verified number. Not tied to a customer/purpose. */
  async sendTest(to: string, body?: string): Promise<DispatchOutcome> {
    const e164 = toE164(to);
    if (!e164) return { ok: false, status: "failed", messageId: null, message: "Invalid phone number." };
    const { connection, resolution } = await this.resolveActive();
    if (!resolution.ok) return { ok: false, status: "failed", messageId: null, message: resolution.reason };
    const { adapter, resolved } = resolution;
    const text = body?.trim() || `Test message from ${connection?.businessName ?? "Pathways"}.`;
    const created = await this.repo.comms.createMessage({
      direction: "outbound",
      status: "queued",
      fromNumber: resolved.senderAddress,
      toNumber: e164,
      body: text,
    });
    const result = await adapter.sendMessage({ connection: resolved, to: e164, body: text });
    if (!result.ok) {
      await this.repo.comms.updateMessageStatus(created.id, "failed", {
        errorCode: result.providerErrorCode,
        errorDetail: result.message,
      });
      return { ok: false, status: "failed", messageId: created.id, message: result.message };
    }
    const status = result.providerStatus as MessageStatus;
    await this.repo.comms.updateMessageStatus(created.id, status, { providerSid: result.providerMessageId });
    return { ok: true, status, messageId: created.id, message: "Test message submitted to provider." };
  }

  /**
   * Build a provider-neutral webhook request from raw HTTP inputs so the route
   * layer stays thin and the adapter owns validation + normalization.
   */
  private async toWebhookRequest(
    url: string,
    headers: Record<string, string | undefined>,
    params: Record<string, string>,
  ): Promise<{ request: ProviderWebhookRequest; resolved: ResolvedConnection | null }> {
    const { resolution } = await this.resolveActive();
    const resolved = resolution.ok ? resolution.resolved : null;
    return {
      request: { url, headers, params, credential: resolved?.credential },
      resolved,
    };
  }

  /**
   * The adapter for the active connection, independent of credential resolution.
   * Inbound normalization and persistence must work even when sending isn't
   * configured — a valid inbound message is never discarded (ADR-001 / §6).
   */
  private async inboundAdapter() {
    const connection = await this.repo.comms.getConnection();
    const provider = connection?.provider ?? "twilio";
    const channel = connection?.channel ?? "sms";
    return this.router.adapterFor(provider, channel);
  }

  /** Whether an inbound/status webhook is authentic for the active connection. */
  async verifyWebhook(
    url: string,
    headers: Record<string, string | undefined>,
    params: Record<string, string>,
  ): Promise<boolean> {
    if (this.config.twilioSkipSignatureValidation) return true;
    const { resolution } = await this.resolveActive();
    if (!resolution.ok) return false;
    const { request } = await this.toWebhookRequest(url, headers, params);
    return resolution.adapter.validateWebhook(request);
  }

  /** Handle a delivery status callback (idempotent, non-regressing). */
  async handleStatusCallback(params: Record<string, string>): Promise<void> {
    const adapter = await this.inboundAdapter();
    if (!adapter) return;
    const events = adapter.normalizeInboundWebhook({ url: "", headers: {}, params });
    for (const ev of events) {
      if (ev.kind === "status_update") {
        await this.repo.comms.updateMessageStatusBySid(ev.providerMessageId, ev.providerStatus, ev.errorCode);
      }
    }
    await this.repo.comms.touchConnection("callback");
  }

  /** Handle an inbound webhook: persist, associate, thread, process keywords. */
  async handleInbound(params: Record<string, string>): Promise<void> {
    await this.repo.comms.touchConnection("inbound");
    const adapter = await this.inboundAdapter();
    if (!adapter) return;
    const channel = adapter.channel;
    const events = adapter.normalizeInboundWebhook({ url: "", headers: {}, params });

    for (const ev of events) {
      if (ev.kind === "opt_keyword" && ev.from && (ev.keyword === "stop" || ev.keyword === "start")) {
        const normalizedFrom = toE164(ev.from);
        if (normalizedFrom) {
          await this.repo.comms.applyProviderSuppression(normalizedFrom, ev.keyword === "stop");
          await this.repo.comms.recordAudit({
            action: `inbound.keyword.${ev.keyword}`,
            detail: { from: normalizedFrom },
          });
        }
      }

      if (ev.kind === "inbound_message") {
        const from = toE164(ev.from);
        // Associate to a customer when unambiguous; otherwise leave unmatched.
        let customerId: string | null = null;
        if (from) {
          const match = await this.repo.comms.findCustomerByPhone(from);
          if (match && match !== "ambiguous") customerId = match.id;
        }
        // Thread into a conversation keyed by the customer's address.
        let conversationId: string | null = null;
        if (from) {
          const convo = await this.repo.comms.ensureConversation({
            channel,
            conversationKey: from,
            customerId,
            providerConversationId: ev.providerConversationId ?? null,
            lastMessagePreview: ev.body.slice(0, 160),
            lastMessageAt: ev.occurredAt,
            incrementUnread: true,
          });
          conversationId = convo.id;
        }
        await this.repo.comms.createMessage({
          conversationId,
          customerId,
          direction: "inbound",
          status: "received",
          fromNumber: from,
          toNumber: ev.to,
          body: ev.body,
          providerSid: ev.providerMessageId,
          receivedAt: ev.occurredAt,
        });
      }
    }
  }
}
