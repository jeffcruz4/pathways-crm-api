/**
 * Row → domain mappers for the Unified Communications (Twilio SMS) feature.
 */
import type { InferSelectModel } from "drizzle-orm";
import * as schema from "../db/schema.js";
import type {
  IntegrationConnection,
  NotificationSetting,
  CommPreference,
  SmsMessage,
  Conversation,
} from "../domain/comms.js";

type ConnectionRow = InferSelectModel<typeof schema.channelConnections>;
type SettingRow = InferSelectModel<typeof schema.smsNotificationSettings>;
type PreferenceRow = InferSelectModel<typeof schema.customerCommPreferences>;
type MessageRow = InferSelectModel<typeof schema.smsMessages>;
type ConversationRow = InferSelectModel<typeof schema.conversations>;

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

/** Mask an Account SID like "ACxxxx...1234" → "AC••••1234". */
function maskSid(sid: string | null): string | null {
  if (!sid) return null;
  if (sid.length <= 6) return sid;
  return `${sid.slice(0, 2)}••••${sid.slice(-4)}`;
}

export function mapConnection(r: ConnectionRow): IntegrationConnection {
  return {
    id: r.id,
    provider: r.provider,
    channel: r.channel,
    status: r.status,
    accountSid: r.accountSid,
    accountSidMasked: maskSid(r.accountSid),
    messagingServiceSid: r.messagingServiceSid,
    fromNumber: r.fromNumber,
    hasCredential: !!r.credentialRef,
    credentialRef: r.credentialRef,
    businessName: r.businessName,
    businessPhone: r.businessPhone,
    reviewUrl: r.reviewUrl,
    lastValidatedAt: iso(r.lastValidatedAt),
    lastInboundAt: iso(r.lastInboundAt),
    lastCallbackAt: iso(r.lastCallbackAt),
    lastError: r.lastError,
    updatedAt: iso(r.updatedAt),
  };
}

export function mapNotificationSetting(r: SettingRow): NotificationSetting {
  return {
    purpose: r.purpose,
    enabled: r.enabled,
    templateBody: r.templateBody,
  };
}

export function mapCommPreference(r: PreferenceRow): CommPreference {
  return {
    purpose: r.purpose,
    status: r.status,
    source: r.source,
    capturedAt: iso(r.capturedAt),
    providerStatus: r.providerStatus,
    updatedAt: iso(r.updatedAt),
  };
}

export function mapConversation(r: ConversationRow): Conversation {
  return {
    id: r.id,
    customerId: r.customerId,
    channel: r.channel,
    status: r.status,
    providerConversationId: r.providerConversationId,
    assignedUserId: r.assignedUserId,
    lastMessageAt: iso(r.lastMessageAt),
    lastMessagePreview: r.lastMessagePreview,
    unreadCount: r.unreadCount,
    createdAt: r.createdAt.toISOString(),
  };
}

export function mapSmsMessage(r: MessageRow): SmsMessage {
  return {
    id: r.id,
    conversationId: r.conversationId,
    customerId: r.customerId,
    jobId: r.jobId,
    direction: r.direction,
    purpose: r.purpose,
    status: r.status,
    fromNumber: r.fromNumber,
    toNumber: r.toNumber,
    body: r.body,
    providerErrorCode: r.providerErrorCode,
    errorDetail: r.errorDetail,
    sentAt: iso(r.sentAt),
    deliveredAt: iso(r.deliveredAt),
    receivedAt: iso(r.receivedAt),
    createdAt: r.createdAt.toISOString(),
  };
}
