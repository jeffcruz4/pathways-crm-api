/**
 * GoHighLevel (LeadConnector) SMS channel adapter — Phase 1.
 *
 * Implements the same provider-neutral CommunicationProviderAdapter contract as
 * the Twilio adapter (./adapter.ts). The communications core (commsService.ts),
 * consent, inbox, scheduler, and routes are unchanged — this is "register a new
 * adapter in the ChannelRouter."
 *
 * ──────────────────────────────────────────────────────────────────────────
 * ⚠️ FENCED: some GHL wire details are NOT yet live-verified (no sandbox on the
 * current GHL plan — see OPEN-6/OPEN-12 and docs/design/gohighlevel-migration.md).
 * Those spots are marked `VERIFY-ON-SANDBOX`. To avoid shipping unverified
 * behavior that *looks* done, this adapter is deliberately conservative:
 *   - sendMessage() refuses to send unless GHL_SEND_ENABLED is explicitly on,
 *     so an unverified request body can never silently hit the provider.
 *   - validateWebhook() FAILS CLOSED (rejects) until the signature scheme is
 *     verified — never accept a webhook we can't authenticate. (The dev-only
 *     skipWebhookSignatureValidation flag in commsService still applies for
 *     local testing.)
 * The structure, capabilities, status mapping, and event normalization ARE
 * complete and unit-tested; only the guarded live calls await the sandbox.
 * ──────────────────────────────────────────────────────────────────────────
 */
import crypto from "node:crypto";
import type {
  CommunicationProviderAdapter,
  ChannelCapabilities,
  ResolvedConnection,
  OutboundMessageCommand,
  ProviderSendResult,
  ConnectionValidationResult,
  ProviderWebhookRequest,
  NormalizedCommunicationEvent,
} from "./adapter.js";

const GHL_API_BASE = "https://services.leadconnectorhq.com";

/** Map a GHL message status string onto our provider-neutral MessageStatus. */
export function mapGhlStatus(status: string): string {
  switch ((status || "").toLowerCase()) {
    case "queued":
    case "pending":
      return "queued";
    case "sending":
      return "sending";
    case "sent":
      return "sent";
    case "delivered":
      return "delivered";
    case "undelivered":
      return "undelivered";
    case "failed":
    case "error":
      return "failed";
    case "received":
    case "inbound":
      return "received";
    default:
      return "queued";
  }
}

/** Recognized inbound opt-out / opt-in / help keywords (case-insensitive). */
export function classifyKeyword(body: string): "stop" | "start" | "help" | null {
  const normalized = (body || "").trim().toUpperCase();
  const STOP = ["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"];
  const START = ["START", "YES", "UNSTOP"];
  const HELP = ["HELP", "INFO"];
  if (STOP.includes(normalized)) return "stop";
  if (START.includes(normalized)) return "start";
  if (HELP.includes(normalized)) return "help";
  return null;
}

/**
 * Verify a GHL webhook signature.
 *
 * VERIFY-ON-SANDBOX: GHL's documented webhook-security scheme is not yet
 * confirmed against a live account. This implements an HMAC-SHA256 over the raw
 * body against a shared secret (a common scheme) BUT returns false whenever the
 * secret or signature is absent — i.e. it FAILS CLOSED. Do not relax this until
 * the real scheme is verified; accepting an unauthenticated webhook would let a
 * spoofed inbound message drive suppression/consent changes.
 */
export function validateWebhookSignature(
  secret: string | undefined,
  signatureHeader: string | undefined,
  rawBody: string,
): boolean {
  if (!secret || !signatureHeader) return false; // fail closed
  // VERIFY-ON-SANDBOX: confirm algorithm (sha256?), encoding (hex/base64), and
  // exactly what is signed (raw body? body+timestamp?). Placeholder below is a
  // reasonable default, intentionally strict.
  const expected = crypto.createHmac("sha256", secret).update(rawBody, "utf-8").digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
  } catch {
    return false;
  }
}

/** Is the live send path explicitly enabled? Gated so unverified bodies can't send. */
function sendEnabled(): boolean {
  return process.env.GHL_SEND_ENABLED === "true";
}

export class GoHighLevelAdapter implements CommunicationProviderAdapter {
  readonly provider = "gohighlevel" as const;
  readonly channel = "sms" as const;

  getCapabilities(): ChannelCapabilities {
    // SMS over GHL: two-way, no reply window, delivery callbacks via webhook.
    // VERIFY-ON-SANDBOX: media (MMS) support varies by number; left false.
    return {
      supportsInbound: true,
      supportsOutbound: true,
      supportsText: true,
      supportsMedia: false,
      supportsDeliveryCallbacks: true,
      supportsReadReceipts: false,
      requiresCustomerInitiatedConversation: false,
      messagingWindowHours: null,
      maximumMessageSize: null,
    };
  }

  async validateConnection(connection: ResolvedConnection): Promise<ConnectionValidationResult> {
    // Cheap read-only probe: fetch the location resource. accountId carries the
    // GHL locationId; credential carries the token.
    const url = `${GHL_API_BASE}/locations/${encodeURIComponent(connection.accountId)}`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${connection.credential}`,
          // Version header required by GHL; value comes from config at the
          // router/caller level in a later pass. VERIFY-ON-SANDBOX.
          Version: "2021-07-28",
          Accept: "application/json",
        },
      });
    } catch (err) {
      return { ok: false, message: `Network error contacting GoHighLevel: ${(err as Error).message}` };
    }
    if (res.status === 401) return { ok: false, message: "Invalid GoHighLevel credentials (401)." };
    if (res.status === 403) return { ok: false, message: "GoHighLevel token lacks required scopes (403)." };
    if (!res.ok) return { ok: false, message: `GoHighLevel returned ${res.status}.` };
    return { ok: true, message: "GoHighLevel connection validated." };
  }

  async sendMessage(command: OutboundMessageCommand): Promise<ProviderSendResult> {
    const { connection: c } = command;

    // FENCE: refuse to send unless explicitly enabled. Until the send body is
    // verified on a sandbox, a live send could submit a malformed request. This
    // returns a normalized failure (the core will mark the message failed +
    // audit), rather than silently sending something wrong.
    if (!sendEnabled()) {
      return {
        ok: false,
        providerErrorCode: "ghl_send_disabled",
        message:
          "GoHighLevel send is not enabled (set GHL_SEND_ENABLED=true after verifying the send body on a sandbox — OPEN-6/OPEN-12).",
      };
    }

    // GHL threads by contactId, not raw phone. For Phase 1 (customers still
    // local) the resolved connection temporarily carries the contactId in
    // senderResourceId; post-Phase-2 the id is known from the data layer.
    // VERIFY-ON-SANDBOX: endpoint, body shape, and auth.
    const contactId = c.senderResourceId;
    if (!contactId) {
      return {
        ok: false,
        providerErrorCode: "ghl_no_contact",
        message: "GoHighLevel requires a contactId to send (resolve phone→contact first).",
      };
    }

    const url = `${GHL_API_BASE}/conversations/messages`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${c.credential}`,
          Version: "2021-07-28", // VERIFY-ON-SANDBOX: thread version via config
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          type: "SMS",
          contactId,
          message: command.body,
        }),
      });
    } catch (err) {
      return { ok: false, providerErrorCode: null, message: `Network error contacting GoHighLevel: ${(err as Error).message}` };
    }

    const payload = (await res.json().catch(() => ({}))) as {
      messageId?: string;
      msgId?: string;
      status?: string;
      message?: string;
      code?: string | number;
    };
    if (!res.ok) {
      return {
        ok: false,
        providerErrorCode: payload.code != null ? String(payload.code) : String(res.status),
        message: payload.message ?? `GoHighLevel returned ${res.status}`,
      };
    }
    return {
      ok: true,
      providerMessageId: payload.messageId ?? payload.msgId ?? "",
      providerStatus: mapGhlStatus(payload.status ?? "queued"),
    };
  }

  validateWebhook(request: ProviderWebhookRequest): boolean {
    // request.credential carries the webhook secret (resolved by the router).
    // VERIFY-ON-SANDBOX: confirm the header name below.
    const signature = request.headers["x-ghl-signature"] ?? request.headers["x-wh-signature"];
    const rawBody = typeof request.params["__rawBody"] === "string"
      ? request.params["__rawBody"]
      : JSON.stringify(request.params);
    return validateWebhookSignature(request.credential, signature, rawBody);
  }

  normalizeInboundWebhook(request: ProviderWebhookRequest): NormalizedCommunicationEvent[] {
    const p = request.params;
    // VERIFY-ON-SANDBOX: GHL inbound/status payload field names below are
    // documented-but-not-live-confirmed.
    const providerMessageId = (p.messageId as string) || (p.id as string) || null;

    // Delivery status callback (status present, no body).
    const statusValue = (p.status as string) || (p.messageStatus as string);
    if (statusValue && providerMessageId && !p.body) {
      return [
        {
          kind: "status_update",
          providerMessageId,
          providerStatus: mapGhlStatus(statusValue),
          errorCode: (p.errorCode as string) || null,
        },
      ];
    }

    const events: NormalizedCommunicationEvent[] = [];
    const body = (p.body as string) ?? (p.message as string) ?? "";

    // NOTE (OPEN-2): GHL may own STOP/START suppression (DND) natively. We still
    // classify keywords here so the core can keep a consistent suppression view;
    // revisit once we confirm whether GHL reports opt-outs via webhook or API.
    const keyword = classifyKeyword(body);
    if (keyword) {
      events.push({ kind: "opt_keyword", keyword, from: (p.from as string) ?? null, providerMessageId });
    }

    events.push({
      kind: "inbound_message",
      providerMessageId,
      from: (p.from as string) ?? null,
      to: (p.to as string) ?? null,
      body,
      providerConversationId: (p.conversationId as string) ?? null,
      occurredAt: new Date(),
    });
    return events;
  }
}
