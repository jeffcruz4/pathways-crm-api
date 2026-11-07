/**
 * GoHighLevel (LeadConnector) SMS channel adapter — DESIGN SKETCH.
 *
 * ⚠️ This is a reference sketch for Phase 1 of the GHL migration
 * (docs/design/gohighlevel-migration.md), NOT wired into the app. It lives in
 * docs/ on purpose: it documents how little the Twilio→GHL swap touches, and
 * gives a concrete starting point. Move it to src/comms/gohighlevelAdapter.ts
 * and register it in the ChannelRouter when Phase 1 begins.
 *
 * It implements the SAME provider-neutral contract as the Twilio adapter
 * (src/comms/adapter.ts → CommunicationProviderAdapter). The communications
 * core (commsService.ts), consent, inbox, scheduler, and routes do NOT change.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * VERIFY BEFORE IMPLEMENTING (marked `VERIFY:` inline). These are the GHL
 * specifics that must be confirmed against the live GHL API / MCP
 * (describe_operation) before this is production code. They are documented
 * assumptions from the LeadConnector v2 API, not confirmed against a live
 * account — see OPEN-1 in the migration doc.
 *   - exact send-message endpoint, request body, and auth header shape
 *   - inbound + delivery-status webhook payload field names
 *   - webhook authenticity scheme (signature header vs shared secret)
 *   - how STOP/START/HELP is surfaced (GHL may own suppression natively, in
 *     which case we may NOT emit opt_keyword events and instead let GHL DND be
 *     the source of truth — see OPEN-2)
 * ──────────────────────────────────────────────────────────────────────────
 *
 * Refs (to confirm): LeadConnector v2 Conversations / Messages API; GHL
 * inbound-message & message-status webhooks.
 */

// NOTE: when promoted to src/, these import paths become "./adapter.js".
import type {
  CommunicationProviderAdapter,
  ChannelCapabilities,
  ResolvedConnection,
  OutboundMessageCommand,
  ProviderSendResult,
  ConnectionValidationResult,
  ProviderWebhookRequest,
  NormalizedCommunicationEvent,
} from "../../src/comms/adapter.js";

// VERIFY: base host for the LeadConnector v2 API.
const GHL_API_BASE = "https://services.leadconnectorhq.com";
// VERIFY: GHL versions its API via a date header; confirm the current value.
const GHL_API_VERSION = "2021-04-15";

// ─────────────────────────── Low-level primitives ───────────────────────────
// Mirrors twilioAdapter.ts's "plain functions + a thin class" structure so the
// two adapters read the same way.

export type GhlCreds = {
  /**
   * The resolved GHL access credential. With a Private Integration Token this
   * is the PIT; with OAuth it is the current access token. The ChannelRouter's
   * resolveCredential() produces this (see migration doc §3 / resolveCredential
   * GHL branch).
   */
  accessToken: string;
  /** GHL sub-account (location) id — every GHL request is location-scoped. */
  locationId: string;
};

export type GhlSendInput = {
  to: string;
  body: string;
  /**
   * GHL threads by contactId, not by raw phone like Twilio. The adapter does
   * not know contactIds; the resolved connection must carry it, OR we resolve
   * phone→contact first. See VERIFY note in sendMessage().
   */
  contactId?: string | null;
  fromNumber?: string | null;
};

export type GhlSendResult =
  | { ok: true; messageId: string; status: string }
  | { ok: false; errorCode: string | null; message: string };

/**
 * Map a GHL message status string onto our provider-neutral MessageStatus
 * vocabulary (same target set as mapTwilioStatus()).
 * VERIFY: GHL's actual status strings — align these to the real values.
 */
export function mapGhlStatus(status: string): string {
  switch (status.toLowerCase()) {
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

function authHeaders(creds: GhlCreds): Record<string, string> {
  // GHL uses a Bearer token (PIT or OAuth access token) + a version header.
  return {
    Authorization: `Bearer ${creds.accessToken}`,
    Version: GHL_API_VERSION,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

/** Send an SMS via GHL. Returns a normalized result; never throws for provider errors. */
export async function sendSms(creds: GhlCreds, input: GhlSendInput): Promise<GhlSendResult> {
  // VERIFY: endpoint + body. Documented shape is POST /conversations/messages
  // with { type: "SMS", contactId, message }. GHL keys the send on contactId,
  // not the raw phone number — this is the main structural difference from
  // Twilio and the reason the resolved connection / dispatch may need a
  // phone→contact resolution step (see the class note below).
  if (!input.contactId) {
    return {
      ok: false,
      errorCode: null,
      message: "GHL requires a contactId to send (resolve phone→contact first).",
    };
  }
  const url = `${GHL_API_BASE}/conversations/messages`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: authHeaders(creds),
      body: JSON.stringify({
        type: "SMS",
        contactId: input.contactId,
        message: input.body,
        // VERIFY: whether a fromNumber / phone override is supported here.
        ...(input.fromNumber ? { fromNumber: input.fromNumber } : {}),
      }),
    });
  } catch (err) {
    return { ok: false, errorCode: null, message: `Network error contacting GHL: ${(err as Error).message}` };
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
      errorCode: payload.code != null ? String(payload.code) : String(res.status),
      message: payload.message ?? `GHL returned ${res.status}`,
    };
  }
  // VERIFY: the success payload's id + status field names.
  return { ok: true, messageId: payload.messageId ?? payload.msgId ?? "", status: payload.status ?? "queued" };
}

/** Validate the connection by reading the location (sub-account) resource. */
export async function validateCredentials(creds: GhlCreds): Promise<{ ok: boolean; message: string }> {
  // VERIFY: a cheap, read-only endpoint usable as a credential probe, e.g.
  // GET /locations/{locationId}.
  const url = `${GHL_API_BASE}/locations/${encodeURIComponent(creds.locationId)}`;
  let res: Response;
  try {
    res = await fetch(url, { method: "GET", headers: authHeaders(creds) });
  } catch (err) {
    return { ok: false, message: `Network error contacting GHL: ${(err as Error).message}` };
  }
  if (res.status === 401) return { ok: false, message: "Invalid GHL credentials (401)." };
  if (res.status === 403) return { ok: false, message: "GHL token lacks the required scopes (403)." };
  if (!res.ok) return { ok: false, message: `GHL returned ${res.status}.` };
  return { ok: true, message: "GoHighLevel connection validated." };
}

/**
 * Validate a GHL webhook's authenticity.
 * VERIFY: GHL's scheme differs from Twilio's HMAC-SHA1-over-URL+params. Confirm
 * whether GHL signs with a shared secret / signature header, and implement the
 * documented verification. Returning false by default is the safe placeholder.
 */
export function validateWebhookSignature(
  _secret: string,
  _signatureHeader: string | undefined,
  _rawBody: string,
): boolean {
  // TODO(Phase 1): implement per GHL's documented webhook security model.
  return false;
}

// ─────────────────────── Adapter (provider-neutral contract) ───────────────────────

/**
 * GoHighLevel SMS implementation of CommunicationProviderAdapter.
 *
 * Structural difference from Twilio worth calling out for the core team:
 * Twilio threads by raw phone number; GHL threads by **contactId**. Two clean
 * options, to decide in Phase 1 (neither changes commsService.ts's public
 * flow, only what the ResolvedConnection carries / an internal resolve step):
 *   (a) Resolve phone→contactId inside this adapter (extra GHL call per send).
 *   (b) Carry contactId on the dispatch path once customers live in GHL
 *       (Phase 2), so the id is already known. Preferred post-Phase-2.
 * Until then, (a) keeps Phase 1 independent of the data migration.
 */
export class GoHighLevelAdapter implements CommunicationProviderAdapter {
  readonly provider = "gohighlevel" as const; // VERIFY: add "gohighlevel" to the CommProvider enum (domain/comms.ts + db enum).
  readonly channel = "sms" as const;

  getCapabilities(): ChannelCapabilities {
    // SMS over GHL: two-way, no reply window, delivery callbacks via webhook.
    // VERIFY media support (GHL supports MMS on some numbers).
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
    // ResolvedConnection.accountId carries the GHL locationId; .credential the token.
    return validateCredentials({ accessToken: connection.credential, locationId: connection.accountId });
  }

  async sendMessage(command: OutboundMessageCommand): Promise<ProviderSendResult> {
    const { connection: c } = command;
    // See class note (a)/(b): contactId resolution strategy. For the sketch we
    // assume senderResourceId temporarily carries the contactId; Phase 1 wires
    // the real resolution.
    const result = await sendSms(
      { accessToken: c.credential, locationId: c.accountId },
      {
        to: command.to,
        body: command.body,
        contactId: c.senderResourceId, // VERIFY/REPLACE with real contact resolution.
        fromNumber: c.senderAddress,
      },
    );
    return result.ok
      ? { ok: true, providerMessageId: result.messageId, providerStatus: mapGhlStatus(result.status) }
      : { ok: false, providerErrorCode: result.errorCode, message: result.message };
  }

  validateWebhook(request: ProviderWebhookRequest): boolean {
    if (!request.credential) return false;
    // VERIFY: the actual signature header name + scheme.
    const signature = request.headers["x-ghl-signature"];
    const rawBody = JSON.stringify(request.params);
    return validateWebhookSignature(request.credential, signature, rawBody);
  }

  normalizeInboundWebhook(request: ProviderWebhookRequest): NormalizedCommunicationEvent[] {
    const p = request.params;
    // VERIFY: GHL webhook payload field names below are assumptions.
    const providerMessageId = (p.messageId as string) || (p.id as string) || null;

    // Delivery-status callback (no body, carries a status).
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

    // NOTE (OPEN-2): GHL may own STOP/START suppression (DND) natively. If so,
    // we likely do NOT emit opt_keyword here and instead let GHL be the source
    // of truth, syncing suppression from GHL rather than inferring it from the
    // message body. Keep this decision in the migration doc, not silently here.
    //
    // const keyword = classifyKeyword(body);
    // if (keyword) events.push({ kind: "opt_keyword", keyword, from: ..., providerMessageId });

    events.push({
      kind: "inbound_message",
      providerMessageId,
      from: (p.from as string) ?? null,
      to: (p.to as string) ?? null,
      body,
      // GHL exposes a conversationId — carry it so threading can prefer it.
      providerConversationId: (p.conversationId as string) ?? null,
      occurredAt: new Date(),
    });
    return events;
  }
}

/*
 * Wiring checklist to promote this sketch (Phase 1):
 *   1. Move to src/comms/gohighlevelAdapter.ts; fix the import to "./adapter.js".
 *   2. Add "gohighlevel" to CommProvider (src/domain/comms.ts) and the
 *      comm_provider pg enum (src/db/schema.ts) + a migration.
 *   3. Register it in ChannelRouter (src/comms/channelRouter.ts):
 *        const ghl = new GoHighLevelAdapter();
 *        this.adapters.set(`${ghl.provider}:${ghl.channel}`, ghl);
 *   4. Extend ChannelRouter.resolveCredential with a GHL branch (PIT/OAuth
 *      token) and map the stored connection's locationId → ResolvedConnection.
 *   5. Add a GHL webhook route (mirror /webhooks/twilio/*) →
 *      comms.verifyWebhook + comms.handleInbound / handleStatusCallback. The
 *      provider-scoped callback path (/webhooks/{provider}/status) already
 *      exists in ChannelRouter.statusCallbackUrl.
 *   6. Resolve every `VERIFY:` against the live GHL API / MCP first (OPEN-1).
 *   7. No change required to commsService.ts, consent, inbox, or scheduler.
 */

/*
 * ════════════════════════════════════════════════════════════════════════
 *  WEBHOOK ROUTE DESIGN (Phase 1) — pairs with the adapter above
 * ════════════════════════════════════════════════════════════════════════
 *
 * This section is design-only prose-in-comments. It mirrors the existing
 * Twilio webhook routes (src/routes/comms.ts, the `/webhooks/twilio/*` block)
 * and calls out exactly where GHL differs. Promote it alongside the adapter.
 *
 * ── Goal ──
 * Receive GHL inbound-message and message-status webhooks, verify authenticity,
 * and feed them into the SAME provider-neutral core calls the Twilio routes
 * use: comms.verifyWebhook(...), comms.handleInbound(...),
 * comms.handleStatusCallback(...). Nothing in commsService.ts changes.
 *
 * ── Key difference from Twilio: content type ──
 * Twilio posts application/x-www-form-urlencoded; app.ts registers a form
 * content-type parser so req.body is a Record<string,string>. GHL webhooks are
 * expected to be application/json (VERIFY). Two implications:
 *   1. req.body arrives as a parsed JSON object (nested), not a flat string map.
 *      The adapter's normalizeInboundWebhook already reads request.params as a
 *      loose Record — but GHL's payload is likely nested (e.g. { message: {...},
 *      contact: {...} }). Decide one of:
 *        (a) Flatten the GHL JSON into a Record<string,string> in the route
 *            before calling the core (keeps the adapter signature identical to
 *            Twilio's), OR
 *        (b) Widen ProviderWebhookRequest.params to accept `unknown`/nested
 *            objects and have the GHL adapter read the nested shape.
 *      RECOMMENDATION: (a) — flatten in the route. It keeps the port unchanged
 *      and confines GHL's payload shape to the route + adapter boundary.
 *   2. The signature is computed over the RAW JSON body, not sorted form params
 *      (Twilio's scheme). Capture the raw body for verification (Fastify:
 *      addContentTypeParser('application/json', { parseAs: 'string' }, ...) on a
 *      GHL-scoped route, or a rawBody plugin) so the signature check sees the
 *      exact bytes GHL signed. VERIFY GHL's documented scheme first (OPEN-1).
 *
 * ── Routes to add (mirror the Twilio pair) ──
 *
 *   app.post("/webhooks/gohighlevel/inbound", async (req, reply) => {
 *     // params: flattened view of the GHL JSON payload (strategy (a) above).
 *     const params = flattenGhlPayload(req.body);
 *     const ok = await comms.verifyWebhook(reconstructUrl(req), headersOf(req), params);
 *     if (!ok) return reply.code(403).send({ error: "invalid_signature" });
 *     await comms.handleInbound(params);
 *     // GHL does not expect TwiML back; a 200/204 ack is sufficient. VERIFY the
 *     // expected ack body/status (Twilio wanted empty <Response></Response>).
 *     return reply.code(204).send();
 *   });
 *
 *   app.post("/webhooks/gohighlevel/status", async (req, reply) => {
 *     const params = flattenGhlPayload(req.body);
 *     const ok = await comms.verifyWebhook(reconstructUrl(req), headersOf(req), params);
 *     if (!ok) return reply.code(403).send({ error: "invalid_signature" });
 *     await comms.handleStatusCallback(params);
 *     return reply.code(204).send();
 *   });
 *
 * reconstructUrl() and headersOf() are reused verbatim from the Twilio block;
 * they are provider-agnostic. The provider-scoped callback path is already
 * produced by ChannelRouter.statusCallbackUrl(provider) →
 * `/api/v1/webhooks/gohighlevel/status`, so the sender config lines up with no
 * new config plumbing.
 *
 * ── verifyWebhook wiring ──
 * comms.verifyWebhook already: (1) honors config.twilioSkipSignatureValidation
 * as a dev bypass — consider renaming to a provider-neutral
 * `skipWebhookSignatureValidation` (small, non-breaking) so it applies to GHL
 * too; (2) resolves the active connection and calls adapter.validateWebhook.
 * Since the active connection's provider will be "gohighlevel", the router hands
 * back the GoHighLevelAdapter and its validateWebhook runs. No core change
 * beyond the optional flag rename.
 *
 * ── A note on inbound→customer association ──
 * Twilio inbound carries the raw From phone; handleInbound resolves
 * phone→customer via repo.comms.findCustomerByPhone. GHL inbound carries a
 * contactId (and conversationId). Post-Phase-2 (customers live in GHL) the
 * cleaner association key is the GHL contactId, not the phone. For Phase 1
 * (customers still local) keep using the phone (ev.from) so association logic is
 * unchanged; revisit when Phase 2 lands. The adapter already passes
 * providerConversationId through for threading.
 *
 * ── Admin → Integrations surface ──
 * The GET /integrations/twilio handler exposes webhook URLs built from
 * publicBaseUrl. When GHL becomes a provider, either generalize this handler to
 * the active provider or add a parallel /integrations/gohighlevel handler that
 * emits `/api/v1/webhooks/gohighlevel/{inbound,status}`. Design choice for
 * Phase 1; the Twilio handler is the template.
 *
 * ── Webhook wiring checklist (additions to the adapter checklist) ──
 *   8.  Add a GHL-scoped JSON content-type parser that preserves the raw body
 *       for signature verification (or a rawBody plugin scoped to the route).
 *   9.  Implement flattenGhlPayload(body) in the route module (strategy (a)).
 *   10. Register the two /webhooks/gohighlevel/* routes (above) in commsRoutes.
 *   11. Rename config.twilioSkipSignatureValidation →
 *       skipWebhookSignatureValidation (provider-neutral) OR add a GHL twin.
 *   12. Decide the expected ack response for GHL (VERIFY) — likely 200/204.
 *   13. VERIFY the signature scheme + header name and implement
 *       validateWebhookSignature above before trusting any inbound payload.
 */
