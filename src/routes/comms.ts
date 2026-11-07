import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Repository } from "../data/index.js";
import type { AppConfig } from "../config.js";
import type { CommsService } from "../comms/commsService.js";
import { parseBody } from "./validate.js";
import {
  IntegrationConnectionUpsert,
  NotificationSettingUpdate,
  CommPreferenceUpdate,
  TestMessageSend,
  CommPurpose,
  InboxFilter,
  ReplyCreate,
  AssociateCustomer,
} from "../domain/comms.js";

/**
 * Unified Communications (Twilio SMS) routes.
 *
 *  - Admin → Integrations: connection config, validate, disconnect, test send,
 *    and notification settings.
 *  - Customer record: SMS history + purpose-specific preferences.
 *  - Twilio webhooks: inbound SMS + delivery status callbacks.
 *
 * Auth/role enforcement is deferred along with the rest of the API (no auth
 * middleware yet); the `actor` on audited actions is a placeholder until then.
 */
export function commsRoutes(repo: Repository, config: AppConfig, comms: CommsService) {
  return async function (app: FastifyInstance) {
    const notFound = (reply: import("fastify").FastifyReply, what = "Not found") =>
      reply.code(404).send({ error: "not_found", message: what });

    // ── Admin → Integrations ──
    app.get("/integrations/twilio", async () => {
      const connection = await repo.comms.getConnection();
      const settings = await repo.comms.listNotificationSettings();
      const webhookBase = (config.publicBaseUrl ?? "").replace(/\/$/, "");
      return {
        connection: connection ?? null,
        settings,
        webhooks: {
          inboundUrl: webhookBase ? `${webhookBase}/api/v1/webhooks/twilio/inbound` : null,
          statusUrl: webhookBase ? `${webhookBase}/api/v1/webhooks/twilio/status` : null,
        },
      };
    });

    app.put("/integrations/twilio", async (req, reply) => {
      const input = parseBody(IntegrationConnectionUpsert, req.body, reply);
      if (!input) return;
      const connection = await repo.comms.upsertConnection(input);
      await repo.comms.recordAudit({
        action: "integration.configured",
        detail: { hasCredential: connection.hasCredential },
      });
      return connection;
    });

    app.post("/integrations/twilio/validate", async () => {
      const result = await comms.validateConnection();
      const connection = await repo.comms.getConnection();
      return { ok: result.ok, message: result.message, connection: connection ?? null };
    });

    app.post("/integrations/twilio/disconnect", async (_req, reply) => {
      const connection = await repo.comms.disconnectConnection();
      if (!connection) return notFound(reply, "No Twilio connection to disconnect");
      await repo.comms.recordAudit({ action: "integration.disconnected" });
      return connection;
    });

    app.post("/integrations/twilio/test", async (req, reply) => {
      const input = parseBody(TestMessageSend, req.body, reply);
      if (!input) return;
      const result = await comms.sendTest(input.to, input.body);
      return reply.code(result.ok ? 200 : 422).send(result);
    });

    // ── Notification settings ──
    app.patch<{ Params: { purpose: string } }>(
      "/integrations/twilio/settings/:purpose",
      async (req, reply) => {
        const purpose = CommPurpose.safeParse(req.params.purpose);
        if (!purpose.success) return notFound(reply, "Unknown notification purpose");
        const input = parseBody(NotificationSettingUpdate, req.body, reply);
        if (!input) return;
        const updated = await repo.comms.updateNotificationSetting(purpose.data, input);
        return updated ?? notFound(reply);
      },
    );

    // ── Customer SMS history ──
    app.get<{ Params: { id: string } }>("/customers/:id/messages", async (req, reply) => {
      const items = await repo.comms.listCustomerMessages(req.params.id);
      if (items === undefined) return notFound(reply, "Customer not found");
      return { items };
    });

    // ── Customer conversations (channel-agnostic; feeds the inbox) ──
    app.get<{ Params: { id: string } }>("/customers/:id/conversations", async (req, reply) => {
      const items = await repo.comms.listCustomerConversations(req.params.id);
      if (items === undefined) return notFound(reply, "Customer not found");
      return { items };
    });

    // ── Unified inbox (tenant-wide, cross-customer) ──
    app.get("/inbox/conversations", async (req) => {
      const filter = InboxFilter.safeParse(req.query ?? {});
      const items = await repo.comms.listInboxConversations(filter.success ? filter.data : {});
      return { items };
    });

    app.get<{ Params: { id: string } }>("/inbox/conversations/:id", async (req, reply) => {
      const view = await repo.comms.getConversationView(req.params.id);
      if (!view) return notFound(reply, "Conversation not found");
      return view;
    });

    // Mark a conversation read (clears the unread badge on open).
    app.post<{ Params: { id: string } }>("/inbox/conversations/:id/read", async (req, reply) => {
      const view = await repo.comms.getConversationView(req.params.id);
      if (!view) return notFound(reply, "Conversation not found");
      await repo.comms.markConversationRead(req.params.id);
      return { ok: true };
    });

    // Staff reply (Phase 2). Sends through the shared dispatch/consent path.
    app.post<{ Params: { id: string } }>("/inbox/conversations/:id/messages", async (req, reply) => {
      const input = parseBody(ReplyCreate, req.body, reply);
      if (!input) return;
      const result = await comms.sendReply(req.params.id, input.body);
      return reply.code(result.ok ? 201 : 422).send(result);
    });

    // Associate an unmatched conversation with a customer.
    app.post<{ Params: { id: string } }>(
      "/inbox/conversations/:id/associate-customer",
      async (req, reply) => {
        const input = parseBody(AssociateCustomer, req.body, reply);
        if (!input) return;
        const updated = await repo.comms.associateConversationCustomer(req.params.id, input.customerId);
        if (!updated) return notFound(reply, "Conversation or customer not found");
        await repo.comms.recordAudit({
          action: "conversation.associated",
          customerId: input.customerId,
          detail: { conversationId: req.params.id },
        });
        return updated;
      },
    );

    // ── Customer preferences ──
    app.get<{ Params: { id: string } }>("/customers/:id/comm-preferences", async (req, reply) => {
      const items = await repo.comms.listCustomerPreferences(req.params.id);
      if (items === undefined) return notFound(reply, "Customer not found");
      return { items };
    });

    app.put<{ Params: { id: string } }>("/customers/:id/comm-preferences", async (req, reply) => {
      const input = parseBody(CommPreferenceUpdate, req.body, reply);
      if (!input) return;
      const updated = await repo.comms.setCustomerPreference(req.params.id, input, "staff");
      if (!updated) return notFound(reply, "Customer not found");
      await repo.comms.recordAudit({
        action: "preference.changed",
        customerId: req.params.id,
        detail: { purpose: input.purpose, status: input.status },
      });
      return updated;
    });

    // ── Webhooks (providers post application/x-www-form-urlencoded) ──
    // The externally visible URL the provider signed against; account for a
    // reverse proxy via x-forwarded-proto. PUBLIC_BASE_URL wins when set.
    const reconstructUrl = (req: FastifyRequest): string => {
      const base = (config.publicBaseUrl ?? "").replace(/\/$/, "");
      if (base) return `${base}${req.url}`;
      const proto = (req.headers["x-forwarded-proto"] as string) ?? req.protocol;
      return `${proto}://${req.headers.host}${req.url}`;
    };

    const headersOf = (req: FastifyRequest): Record<string, string | undefined> => {
      const h: Record<string, string | undefined> = {};
      for (const [k, v] of Object.entries(req.headers)) h[k] = Array.isArray(v) ? v[0] : v;
      return h;
    };

    app.post("/webhooks/twilio/inbound", async (req, reply) => {
      const params = (req.body as Record<string, string>) ?? {};
      const ok = await comms.verifyWebhook(reconstructUrl(req), headersOf(req), params);
      if (!ok) return reply.code(403).send({ error: "invalid_signature" });
      await comms.handleInbound(params);
      // Respond with empty TwiML so the provider doesn't auto-reply.
      return reply.header("Content-Type", "text/xml").send("<Response></Response>");
    });

    app.post("/webhooks/twilio/status", async (req, reply) => {
      const params = (req.body as Record<string, string>) ?? {};
      const ok = await comms.verifyWebhook(reconstructUrl(req), headersOf(req), params);
      if (!ok) return reply.code(403).send({ error: "invalid_signature" });
      await comms.handleStatusCallback(params);
      return reply.code(204).send();
    });
  };
}
