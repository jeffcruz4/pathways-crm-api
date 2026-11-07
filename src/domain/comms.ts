import { z } from "zod";

/**
 * Unified Communications (Twilio SMS) domain contracts.
 *
 * Provider-neutral request/response shapes for the SMS feature: the Twilio
 * integration connection, per-purpose notification settings, customer consent
 * preferences, stored messages, and the admin test-send. Twilio-specific
 * details live in the adapter, not here.
 */

export const CommChannel = z.enum(["sms", "email", "voice"]);
export const CommProvider = z.enum(["twilio", "gohighlevel"]);
export const ConnectionStatus = z.enum([
  "not_connected",
  "setup_required",
  "connected",
  "action_required",
  "disconnected",
]);
export const CommPurpose = z.enum([
  "job_scheduled",
  "appointment_reminder",
  "cleaner_en_route",
  "job_completed_review",
  "staff_conversation",
]);
export const MessageDirection = z.enum(["inbound", "outbound"]);
export const MessageStatus = z.enum([
  "queued",
  "sending",
  "sent",
  "delivered",
  "undelivered",
  "failed",
  "received",
  "suppressed",
]);
export const CommConsentStatus = z.enum(["opted_in", "opted_out", "unknown", "provider_blocked"]);

/** The four automated notification purposes (staff_conversation is Phase 2). */
export const NOTIFICATION_PURPOSES = [
  "job_scheduled",
  "appointment_reminder",
  "cleaner_en_route",
  "job_completed_review",
] as const;

// ─────────────── Integration connection (safe, admin-facing shape) ───────────────

/** Connection as returned to the admin UI. Never includes the auth token. */
export const IntegrationConnection = z.object({
  id: z.string(),
  provider: CommProvider,
  channel: CommChannel,
  status: ConnectionStatus,
  accountSid: z.string().nullable(),
  /** Masked for display, e.g. "AC••••1234". */
  accountSidMasked: z.string().nullable(),
  messagingServiceSid: z.string().nullable(),
  fromNumber: z.string().nullable(),
  /** Whether an auth credential has been configured (never the value itself). */
  hasCredential: z.boolean(),
  credentialRef: z.string().nullable(),
  businessName: z.string().nullable(),
  businessPhone: z.string().nullable(),
  reviewUrl: z.string().nullable(),
  lastValidatedAt: z.string().nullable(),
  lastInboundAt: z.string().nullable(),
  lastCallbackAt: z.string().nullable(),
  lastError: z.string().nullable(),
  updatedAt: z.string().nullable(),
});

/** Upsert the Twilio connection config. Auth token is accepted but stored as a
 *  secret reference, never echoed back. */
export const IntegrationConnectionUpsert = z.object({
  accountSid: z.string().trim().min(1).optional(),
  /** Raw auth token; write-only. When present, flips hasCredential true. */
  authToken: z.string().trim().min(1).optional(),
  messagingServiceSid: z.string().trim().optional(),
  fromNumber: z.string().trim().optional(),
  businessName: z.string().trim().optional(),
  businessPhone: z.string().trim().optional(),
  reviewUrl: z.string().trim().url().optional().or(z.literal("")),
});

export const ConnectionValidationResult = z.object({
  ok: z.boolean(),
  status: ConnectionStatus,
  message: z.string(),
});

// ─────────────── Notification settings ───────────────

export const NotificationSetting = z.object({
  purpose: CommPurpose,
  enabled: z.boolean(),
  templateBody: z.string(),
});

export const NotificationSettingUpdate = z.object({
  enabled: z.boolean().optional(),
  templateBody: z.string().optional(),
});

// ─────────────── Customer preferences ───────────────

export const CommPreference = z.object({
  purpose: CommPurpose,
  status: CommConsentStatus,
  source: z.string().nullable(),
  capturedAt: z.string().nullable(),
  providerStatus: z.string().nullable(),
  updatedAt: z.string().nullable(),
});

export const CommPreferenceUpdate = z.object({
  purpose: CommPurpose,
  /** UI may set opted_in / opted_out / unknown. It may NOT set provider_blocked;
   *  provider suppression is reconciled only from inbound keyword handling. */
  status: z.enum(["opted_in", "opted_out", "unknown"]),
  source: z.string().optional(),
});

// ─────────────── Messages (SMS history) ───────────────

export const ConversationStatus = z.enum(["open", "pending", "closed", "archived"]);

export const Conversation = z.object({
  id: z.string(),
  customerId: z.string().nullable(),
  channel: CommChannel,
  status: ConversationStatus,
  providerConversationId: z.string().nullable(),
  assignedUserId: z.string().nullable(),
  lastMessageAt: z.string().nullable(),
  lastMessagePreview: z.string().nullable(),
  unreadCount: z.number(),
  createdAt: z.string(),
});

export const SmsMessage = z.object({
  id: z.string(),
  conversationId: z.string().nullable(),
  customerId: z.string().nullable(),
  jobId: z.string().nullable(),
  direction: MessageDirection,
  purpose: CommPurpose.nullable(),
  status: MessageStatus,
  fromNumber: z.string().nullable(),
  toNumber: z.string().nullable(),
  body: z.string(),
  providerErrorCode: z.string().nullable(),
  errorDetail: z.string().nullable(),
  sentAt: z.string().nullable(),
  deliveredAt: z.string().nullable(),
  receivedAt: z.string().nullable(),
  createdAt: z.string(),
});

// ─────────────── Unified inbox ───────────────

/** A conversation row enriched for the inbox list (tenant-wide). */
export const InboxConversation = z.object({
  id: z.string(),
  channel: CommChannel,
  status: ConversationStatus,
  customerId: z.string().nullable(),
  /** Resolved customer display name, or null when unmatched. */
  customerName: z.string().nullable(),
  /** The customer-side address (E.164 for SMS) — the conversation counterparty. */
  counterparty: z.string(),
  lastMessageAt: z.string().nullable(),
  lastMessagePreview: z.string().nullable(),
  unreadCount: z.number(),
  /** True when no customer is associated yet (needs manual resolution). */
  unmatched: z.boolean(),
});

/** Parse a query-string boolean: only the literal "true" (or true) is true. */
const QueryBool = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((v) => (typeof v === "string" ? v === "true" : v));

/** Filters for the inbox list. */
export const InboxFilter = z.object({
  status: z.enum(["open", "pending", "closed", "archived"]).optional(),
  unread: QueryBool,
  unmatched: QueryBool,
  channel: CommChannel.optional(),
  search: z.string().optional(),
});

/** A full conversation for the detail pane: header + chronological messages. */
export const ConversationView = z.object({
  conversation: InboxConversation,
  messages: z.array(SmsMessage),
});

/** Staff reply composed from the inbox (Phase 2). */
export const ReplyCreate = z.object({
  body: z.string().trim().min(1),
});

/** Associate an unmatched conversation with a customer. */
export const AssociateCustomer = z.object({
  customerId: z.string().min(1),
});

// ─────────────── Admin test send ───────────────

export const TestMessageSend = z.object({
  to: z.string().trim().min(1),
  body: z.string().trim().min(1).optional(),
});

export const SendResult = z.object({
  ok: z.boolean(),
  messageId: z.string().nullable(),
  status: MessageStatus,
  message: z.string(),
});

export type CommChannel = z.infer<typeof CommChannel>;
export type CommProvider = z.infer<typeof CommProvider>;
export type ConnectionStatus = z.infer<typeof ConnectionStatus>;
export type CommPurpose = z.infer<typeof CommPurpose>;
export type MessageDirection = z.infer<typeof MessageDirection>;
export type MessageStatus = z.infer<typeof MessageStatus>;
export type CommConsentStatus = z.infer<typeof CommConsentStatus>;
export type IntegrationConnection = z.infer<typeof IntegrationConnection>;
export type IntegrationConnectionUpsert = z.infer<typeof IntegrationConnectionUpsert>;
export type ConnectionValidationResult = z.infer<typeof ConnectionValidationResult>;
export type NotificationSetting = z.infer<typeof NotificationSetting>;
export type NotificationSettingUpdate = z.infer<typeof NotificationSettingUpdate>;
export type CommPreference = z.infer<typeof CommPreference>;
export type CommPreferenceUpdate = z.infer<typeof CommPreferenceUpdate>;
export type ConversationStatus = z.infer<typeof ConversationStatus>;
export type Conversation = z.infer<typeof Conversation>;
export type SmsMessage = z.infer<typeof SmsMessage>;
export type InboxConversation = z.infer<typeof InboxConversation>;
export type InboxFilter = z.infer<typeof InboxFilter>;
export type ConversationView = z.infer<typeof ConversationView>;
export type ReplyCreate = z.infer<typeof ReplyCreate>;
export type AssociateCustomer = z.infer<typeof AssociateCustomer>;
export type TestMessageSend = z.infer<typeof TestMessageSend>;
export type SendResult = z.infer<typeof SendResult>;
