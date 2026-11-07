/**
 * Twilio channel adapter.
 *
 * Talks to the Twilio REST API over `fetch` (no SDK dependency) to send SMS and
 * validate credentials, and implements Twilio's documented webhook signature
 * validation (HMAC-SHA1 over the URL + sorted POST params, base64-encoded).
 *
 * All Twilio-specific knowledge lives here; the rest of the app speaks the
 * provider-neutral domain. The raw Auth Token is passed in per-call and is
 * never logged or persisted by this module.
 *
 * Refs:
 *  - https://www.twilio.com/docs/messaging/api/message-resource
 *  - https://www.twilio.com/docs/usage/webhooks/webhooks-security
 */
import crypto from "node:crypto";

const TWILIO_API_BASE = "https://api.twilio.com/2010-04-01";

export type TwilioCreds = {
  accountSid: string;
  authToken: string;
};

export type TwilioSendInput = {
  to: string;
  body: string;
  /** Prefer a Messaging Service SID; fall back to a from-number. */
  messagingServiceSid?: string | null;
  fromNumber?: string | null;
  /** Optional absolute URL Twilio will POST delivery status callbacks to. */
  statusCallbackUrl?: string | null;
};

export type TwilioSendResult =
  | { ok: true; sid: string; status: string }
  | { ok: false; errorCode: string | null; message: string };

/** Map a Twilio message `status` string to our provider-neutral status. */
export function mapTwilioStatus(status: string): string {
  switch (status) {
    case "queued":
    case "accepted":
    case "scheduled":
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
      return "failed";
    case "received":
      return "received";
    default:
      return "queued";
  }
}

function basicAuthHeader(creds: TwilioCreds): string {
  const token = Buffer.from(`${creds.accountSid}:${creds.authToken}`).toString("base64");
  return `Basic ${token}`;
}

/** Send an SMS. Returns a normalized result; never throws for provider errors. */
export async function sendSms(
  creds: TwilioCreds,
  input: TwilioSendInput,
): Promise<TwilioSendResult> {
  const form = new URLSearchParams();
  form.set("To", input.to);
  form.set("Body", input.body);
  if (input.messagingServiceSid) {
    form.set("MessagingServiceSid", input.messagingServiceSid);
  } else if (input.fromNumber) {
    form.set("From", input.fromNumber);
  } else {
    return { ok: false, errorCode: null, message: "No Messaging Service SID or from-number configured" };
  }
  if (input.statusCallbackUrl) form.set("StatusCallback", input.statusCallbackUrl);

  const url = `${TWILIO_API_BASE}/Accounts/${encodeURIComponent(creds.accountSid)}/Messages.json`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: basicAuthHeader(creds),
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: form.toString(),
    });
  } catch (err) {
    return { ok: false, errorCode: null, message: `Network error contacting Twilio: ${(err as Error).message}` };
  }

  const payload = (await res.json().catch(() => ({}))) as {
    sid?: string;
    status?: string;
    code?: number;
    message?: string;
  };

  if (!res.ok) {
    return {
      ok: false,
      errorCode: payload.code != null ? String(payload.code) : String(res.status),
      message: payload.message ?? `Twilio returned ${res.status}`,
    };
  }
  return { ok: true, sid: payload.sid ?? "", status: payload.status ?? "queued" };
}

/** Validate credentials by fetching the account resource. */
export async function validateCredentials(
  creds: TwilioCreds,
): Promise<{ ok: boolean; message: string }> {
  const url = `${TWILIO_API_BASE}/Accounts/${encodeURIComponent(creds.accountSid)}.json`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: { Authorization: basicAuthHeader(creds), Accept: "application/json" },
    });
  } catch (err) {
    return { ok: false, message: `Network error contacting Twilio: ${(err as Error).message}` };
  }
  if (res.status === 401) return { ok: false, message: "Invalid Twilio credentials (401)." };
  if (!res.ok) return { ok: false, message: `Twilio returned ${res.status}.` };
  const payload = (await res.json().catch(() => ({}))) as { status?: string };
  if (payload.status && payload.status !== "active") {
    return { ok: false, message: `Twilio account status is "${payload.status}".` };
  }
  return { ok: true, message: "Twilio connection validated." };
}

/**
 * Validate a Twilio webhook signature. Twilio signs with:
 *   base64( HMAC-SHA1( authToken, fullUrl + sortedConcatenatedPostParams ) )
 * compared against the `X-Twilio-Signature` header.
 */
export function validateWebhookSignature(
  authToken: string,
  signatureHeader: string | undefined,
  fullUrl: string,
  params: Record<string, string>,
): boolean {
  if (!signatureHeader) return false;
  const sortedKeys = Object.keys(params).sort();
  let data = fullUrl;
  for (const key of sortedKeys) data += key + params[key];
  const expected = crypto.createHmac("sha1", authToken).update(Buffer.from(data, "utf-8")).digest("base64");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
  } catch {
    return false;
  }
}

/** Recognized inbound opt-out / opt-in / help keywords (case-insensitive). */
export function classifyKeyword(body: string): "stop" | "start" | "help" | null {
  const normalized = body.trim().toUpperCase();
  const STOP = ["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"];
  const START = ["START", "YES", "UNSTOP"];
  const HELP = ["HELP", "INFO"];
  if (STOP.includes(normalized)) return "stop";
  if (START.includes(normalized)) return "start";
  if (HELP.includes(normalized)) return "help";
  return null;
}

// ─────────────────────── Adapter (provider-neutral contract) ───────────────────────

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

/**
 * Twilio SMS implementation of the shared CommunicationProviderAdapter. This is
 * the seam the communications core talks to; it wraps the low-level functions
 * above so adding another channel is "write a new adapter" rather than editing
 * the core.
 */
export class TwilioAdapter implements CommunicationProviderAdapter {
  readonly provider = "twilio" as const;
  readonly channel = "sms" as const;

  getCapabilities(): ChannelCapabilities {
    // SMS: two-way, no reply window, no native read receipts. (A2P segment
    // limits are provider-enforced; we don't cap size here.)
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
    return validateCredentials({ accountSid: connection.accountId, authToken: connection.credential });
  }

  async sendMessage(command: OutboundMessageCommand): Promise<ProviderSendResult> {
    const { connection: c } = command;
    const result = await sendSms(
      { accountSid: c.accountId, authToken: c.credential },
      {
        to: command.to,
        body: command.body,
        messagingServiceSid: c.senderResourceId,
        fromNumber: c.senderAddress,
        statusCallbackUrl: c.statusCallbackUrl,
      },
    );
    return result.ok
      ? { ok: true, providerMessageId: result.sid, providerStatus: result.status }
      : { ok: false, providerErrorCode: result.errorCode, message: result.message };
  }

  validateWebhook(request: ProviderWebhookRequest): boolean {
    if (!request.credential) return false;
    const signature = request.headers["x-twilio-signature"];
    return validateWebhookSignature(request.credential, signature, request.url, request.params);
  }

  normalizeInboundWebhook(request: ProviderWebhookRequest): NormalizedCommunicationEvent[] {
    const p = request.params;
    const providerMessageId = p.MessageSid || p.SmsSid || null;

    // Delivery status callback.
    const statusValue = p.MessageStatus || p.SmsStatus;
    if (statusValue && providerMessageId && !p.Body) {
      return [
        {
          kind: "status_update",
          providerMessageId,
          providerStatus: mapTwilioStatus(statusValue),
          errorCode: p.ErrorCode || null,
        },
      ];
    }

    const events: NormalizedCommunicationEvent[] = [];
    const body = p.Body ?? "";
    const keyword = classifyKeyword(body);
    if (keyword) {
      events.push({ kind: "opt_keyword", keyword, from: p.From ?? null, providerMessageId });
    }
    events.push({
      kind: "inbound_message",
      providerMessageId,
      from: p.From ?? null,
      to: p.To ?? null,
      body,
      providerConversationId: null,
      occurredAt: new Date(),
    });
    return events;
  }
}
