/**
 * In-memory implementation of the comms (SMS) data-access seam, used by the
 * default "memory" backend so the feature works without a database. State lives
 * in plain arrays/maps for the process lifetime.
 */
import { randomUUID } from "node:crypto";
import type {
  CommsRepository,
  CreateMessageInput,
  ScheduleCommInput,
  DueScheduledComm,
  CommAuditInput,
  EnsureConversationInput,
} from "./repository.js";
import type {
  IntegrationConnection,
  IntegrationConnectionUpsert,
  NotificationSetting,
  NotificationSettingUpdate,
  CommPreference,
  CommPreferenceUpdate,
  SmsMessage,
  Conversation,
  InboxConversation,
  InboxFilter,
  ConversationView,
  CommChannel,
  CommPurpose,
  CommConsentStatus,
  ConnectionStatus,
} from "../domain/comms.js";
import { NOTIFICATION_PURPOSES } from "../domain/comms.js";
import { DEFAULT_TEMPLATES } from "../comms/template.js";

type ConnState = {
  id: string;
  status: ConnectionStatus;
  accountSid: string | null;
  messagingServiceSid: string | null;
  fromNumber: string | null;
  credentialRef: string | null;
  businessName: string | null;
  businessPhone: string | null;
  reviewUrl: string | null;
  lastValidatedAt: Date | null;
  lastInboundAt: Date | null;
  lastCallbackAt: Date | null;
  lastError: string | null;
  updatedAt: Date;
  disconnectedAt: Date | null;
};

type PrefState = {
  purpose: CommPurpose;
  status: CommConsentStatus;
  source: string | null;
  capturedAt: Date | null;
  providerStatus: string | null;
  updatedAt: Date;
};

type ConversationState = {
  id: string;
  customerId: string | null;
  channel: CommChannel;
  conversationKey: string;
  providerConversationId: string | null;
  status: "open" | "pending" | "closed" | "archived";
  assignedUserId: string | null;
  lastMessageAt: Date | null;
  lastMessagePreview: string | null;
  unreadCount: number;
  createdAt: Date;
};

type MessageState = {
  id: string;
  conversationId: string | null;
  customerId: string | null;
  jobId: string | null;
  direction: "inbound" | "outbound";
  purpose: CommPurpose | null;
  status: string;
  fromNumber: string | null;
  toNumber: string | null;
  body: string;
  providerSid: string | null;
  providerErrorCode: string | null;
  errorDetail: string | null;
  idempotencyKey: string | null;
  sentAt: Date | null;
  deliveredAt: Date | null;
  receivedAt: Date | null;
  createdAt: Date;
};

type ScheduledState = {
  id: string;
  customerId: string;
  jobId: string | null;
  purpose: CommPurpose;
  scheduledFor: Date;
  status: "pending" | "processing" | "sent" | "cancelled" | "suppressed" | "failed";
  idempotencyKey: string;
  scheduleVersion: string | null;
  messageId: string | null;
  lastError: string | null;
};

const maskSid = (sid: string | null): string | null =>
  !sid ? null : sid.length <= 6 ? sid : `${sid.slice(0, 2)}••••${sid.slice(-4)}`;
const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

export class MemoryCommsRepository implements CommsRepository {
  private connection: ConnState | null = null;
  private settings = new Map<CommPurpose, NotificationSetting>();
  private prefs = new Map<string, Map<CommPurpose, PrefState>>(); // customerId → purpose → state
  private messages: MessageState[] = [];
  private scheduled: ScheduledState[] = [];
  private conversations: ConversationState[] = [];

  constructor(
    private readonly resolveCustomerId: (idOrSlug: string) => string | undefined,
    private readonly findCustomerIdByPhone: (phoneE164: string) => string[] | undefined,
    private readonly customerName: (customerId: string) => string | null,
  ) {}

  private connToDomain(c: ConnState): IntegrationConnection {
    return {
      id: c.id,
      provider: "twilio",
      channel: "sms",
      status: c.status,
      accountSid: c.accountSid,
      accountSidMasked: maskSid(c.accountSid),
      messagingServiceSid: c.messagingServiceSid,
      fromNumber: c.fromNumber,
      hasCredential: !!c.credentialRef,
      credentialRef: c.credentialRef,
      businessName: c.businessName,
      businessPhone: c.businessPhone,
      reviewUrl: c.reviewUrl,
      lastValidatedAt: iso(c.lastValidatedAt),
      lastInboundAt: iso(c.lastInboundAt),
      lastCallbackAt: iso(c.lastCallbackAt),
      lastError: c.lastError,
      updatedAt: iso(c.updatedAt),
    };
  }

  async getConnection(): Promise<IntegrationConnection | undefined> {
    return this.connection ? this.connToDomain(this.connection) : undefined;
  }

  async upsertConnection(input: IntegrationConnectionUpsert): Promise<IntegrationConnection> {
    const prev = this.connection;
    const credentialRef = input.authToken ? "env:TWILIO_AUTH_TOKEN" : prev?.credentialRef ?? null;
    const next: ConnState = {
      id: prev?.id ?? randomUUID(),
      status: prev?.status ?? "setup_required",
      accountSid: input.accountSid ?? prev?.accountSid ?? null,
      messagingServiceSid: input.messagingServiceSid ?? prev?.messagingServiceSid ?? null,
      fromNumber: input.fromNumber ?? prev?.fromNumber ?? null,
      credentialRef,
      businessName: input.businessName ?? prev?.businessName ?? null,
      businessPhone: input.businessPhone ?? prev?.businessPhone ?? null,
      reviewUrl: input.reviewUrl ? input.reviewUrl : input.reviewUrl === "" ? null : prev?.reviewUrl ?? null,
      lastValidatedAt: prev?.lastValidatedAt ?? null,
      lastInboundAt: prev?.lastInboundAt ?? null,
      lastCallbackAt: prev?.lastCallbackAt ?? null,
      lastError: prev?.lastError ?? null,
      updatedAt: new Date(),
      disconnectedAt: null,
    };
    const ready = !!next.accountSid && !!next.credentialRef && !!(next.messagingServiceSid || next.fromNumber);
    next.status = prev?.status === "connected" && ready ? "connected" : "setup_required";
    this.connection = next;
    return this.connToDomain(next);
  }

  async disconnectConnection(): Promise<IntegrationConnection | undefined> {
    if (!this.connection) return undefined;
    this.connection.status = "disconnected";
    this.connection.disconnectedAt = new Date();
    this.connection.updatedAt = new Date();
    return this.connToDomain(this.connection);
  }

  async markConnectionValidated(ok: boolean, message: string): Promise<void> {
    if (!this.connection) return;
    this.connection.status = ok ? "connected" : "action_required";
    this.connection.lastValidatedAt = new Date();
    this.connection.lastError = ok ? null : message;
    this.connection.updatedAt = new Date();
  }

  async touchConnection(field: "inbound" | "callback"): Promise<void> {
    if (!this.connection) return;
    if (field === "inbound") this.connection.lastInboundAt = new Date();
    else this.connection.lastCallbackAt = new Date();
  }

  async listNotificationSettings(): Promise<NotificationSetting[]> {
    return NOTIFICATION_PURPOSES.map(
      (purpose) =>
        this.settings.get(purpose) ?? {
          purpose,
          enabled: true,
          templateBody: DEFAULT_TEMPLATES[purpose] ?? "",
        },
    );
  }

  async updateNotificationSetting(
    purpose: CommPurpose,
    input: NotificationSettingUpdate,
  ): Promise<NotificationSetting | undefined> {
    const existing =
      this.settings.get(purpose) ??
      ({ purpose, enabled: true, templateBody: DEFAULT_TEMPLATES[purpose] ?? "" } as NotificationSetting);
    const next: NotificationSetting = {
      purpose,
      enabled: input.enabled ?? existing.enabled,
      templateBody: input.templateBody ?? existing.templateBody,
    };
    this.settings.set(purpose, next);
    return next;
  }

  private prefToDomain(p: PrefState): CommPreference {
    return {
      purpose: p.purpose,
      status: p.status,
      source: p.source,
      capturedAt: iso(p.capturedAt),
      providerStatus: p.providerStatus,
      updatedAt: iso(p.updatedAt),
    };
  }

  async listCustomerPreferences(customerId: string): Promise<CommPreference[] | undefined> {
    const cid = this.resolveCustomerId(customerId);
    if (!cid) return undefined;
    const map = this.prefs.get(cid);
    return NOTIFICATION_PURPOSES.map((purpose) => {
      const p = map?.get(purpose);
      return p
        ? this.prefToDomain(p)
        : { purpose, status: "unknown" as CommConsentStatus, source: null, capturedAt: null, providerStatus: null, updatedAt: null };
    });
  }

  async setCustomerPreference(
    customerId: string,
    input: CommPreferenceUpdate,
    actor: string,
  ): Promise<CommPreference | undefined> {
    const cid = this.resolveCustomerId(customerId);
    if (!cid) return undefined;
    const map = this.prefs.get(cid) ?? new Map<CommPurpose, PrefState>();
    const existing = map.get(input.purpose);
    if (existing?.status === "provider_blocked") return this.prefToDomain(existing);
    const next: PrefState = {
      purpose: input.purpose,
      status: input.status,
      source: input.source ?? actor,
      capturedAt: new Date(),
      providerStatus: existing?.providerStatus ?? null,
      updatedAt: new Date(),
    };
    map.set(input.purpose, next);
    this.prefs.set(cid, map);
    return this.prefToDomain(next);
  }

  async getEffectiveConsent(customerId: string, purpose: CommPurpose): Promise<CommConsentStatus> {
    const cid = this.resolveCustomerId(customerId);
    if (!cid) return "unknown";
    return this.prefs.get(cid)?.get(purpose)?.status ?? "unknown";
  }

  async applyProviderSuppression(phoneE164: string, blocked: boolean): Promise<string | undefined> {
    const ids = this.findCustomerIdByPhone(phoneE164);
    const cid = ids && ids.length === 1 ? ids[0] : undefined;
    if (!cid) return undefined;
    const map = this.prefs.get(cid) ?? new Map<CommPurpose, PrefState>();
    for (const purpose of NOTIFICATION_PURPOSES) {
      map.set(purpose, {
        purpose,
        status: blocked ? "provider_blocked" : "opted_in",
        source: "inbound_keyword",
        capturedAt: new Date(),
        providerStatus: blocked ? "stop" : "start",
        updatedAt: new Date(),
      });
    }
    this.prefs.set(cid, map);
    return cid;
  }

  private msgToDomain(m: MessageState): SmsMessage {
    return {
      id: m.id,
      conversationId: m.conversationId,
      customerId: m.customerId,
      jobId: m.jobId,
      direction: m.direction,
      purpose: m.purpose,
      status: m.status as SmsMessage["status"],
      fromNumber: m.fromNumber,
      toNumber: m.toNumber,
      body: m.body,
      providerErrorCode: m.providerErrorCode,
      errorDetail: m.errorDetail,
      sentAt: iso(m.sentAt),
      deliveredAt: iso(m.deliveredAt),
      receivedAt: iso(m.receivedAt),
      createdAt: m.createdAt.toISOString(),
    };
  }

  async ensureConversation(input: EnsureConversationInput): Promise<{ id: string }> {
    const existing = this.conversations.find(
      (c) => c.channel === input.channel && c.conversationKey === input.conversationKey,
    );
    if (existing) {
      if (input.customerId && !existing.customerId) existing.customerId = input.customerId;
      if (input.providerConversationId && !existing.providerConversationId)
        existing.providerConversationId = input.providerConversationId;
      if (input.lastMessageAt) existing.lastMessageAt = input.lastMessageAt;
      if (input.lastMessagePreview !== undefined) existing.lastMessagePreview = input.lastMessagePreview;
      if (input.incrementUnread) existing.unreadCount += 1;
      return { id: existing.id };
    }
    const row: ConversationState = {
      id: randomUUID(),
      customerId: input.customerId ?? null,
      channel: input.channel,
      conversationKey: input.conversationKey,
      providerConversationId: input.providerConversationId ?? null,
      status: "open",
      assignedUserId: null,
      lastMessageAt: input.lastMessageAt ?? new Date(),
      lastMessagePreview: input.lastMessagePreview ?? null,
      unreadCount: input.incrementUnread ? 1 : 0,
      createdAt: new Date(),
    };
    this.conversations.push(row);
    return { id: row.id };
  }

  async listCustomerConversations(customerId: string): Promise<Conversation[] | undefined> {
    const cid = this.resolveCustomerId(customerId);
    if (!cid) return undefined;
    return this.conversations
      .filter((c) => c.customerId === cid)
      .sort((a, b) => (a.lastMessageAt?.getTime() ?? 0) - (b.lastMessageAt?.getTime() ?? 0))
      .map((c) => ({
        id: c.id,
        customerId: c.customerId,
        channel: c.channel,
        status: c.status,
        providerConversationId: c.providerConversationId,
        assignedUserId: c.assignedUserId,
        lastMessageAt: iso(c.lastMessageAt),
        lastMessagePreview: c.lastMessagePreview,
        unreadCount: c.unreadCount,
        createdAt: c.createdAt.toISOString(),
      }));
  }

  // ── Unified inbox (tenant-wide) ──
  private inboxRow(c: ConversationState): InboxConversation {
    return {
      id: c.id,
      channel: c.channel,
      status: c.status,
      customerId: c.customerId,
      customerName: c.customerId ? this.customerName(c.customerId) : null,
      counterparty: c.conversationKey,
      lastMessageAt: iso(c.lastMessageAt),
      lastMessagePreview: c.lastMessagePreview,
      unreadCount: c.unreadCount,
      unmatched: !c.customerId,
    };
  }

  async listInboxConversations(filter: InboxFilter): Promise<InboxConversation[]> {
    let rows = [...this.conversations];
    if (filter.status) rows = rows.filter((c) => c.status === filter.status);
    if (filter.channel) rows = rows.filter((c) => c.channel === filter.channel);
    if (filter.unread) rows = rows.filter((c) => c.unreadCount > 0);
    if (filter.unmatched) rows = rows.filter((c) => !c.customerId);
    if (filter.search) {
      const term = filter.search.toLowerCase();
      rows = rows.filter(
        (c) =>
          c.conversationKey.toLowerCase().includes(term) ||
          (c.lastMessagePreview ?? "").toLowerCase().includes(term) ||
          (c.customerId ? (this.customerName(c.customerId) ?? "").toLowerCase().includes(term) : false),
      );
    }
    return rows
      .sort((a, b) => (b.lastMessageAt?.getTime() ?? 0) - (a.lastMessageAt?.getTime() ?? 0))
      .map((c) => this.inboxRow(c));
  }

  async getConversationView(conversationId: string): Promise<ConversationView | undefined> {
    const convo = this.conversations.find((c) => c.id === conversationId);
    if (!convo) return undefined;
    const messages = this.messages
      .filter((m) => m.conversationId === convo.id)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((m) => this.msgToDomain(m));
    return { conversation: this.inboxRow(convo), messages };
  }

  async markConversationRead(conversationId: string): Promise<void> {
    const convo = this.conversations.find((c) => c.id === conversationId);
    if (convo) convo.unreadCount = 0;
  }

  async associateConversationCustomer(
    conversationId: string,
    customerId: string,
  ): Promise<InboxConversation | undefined> {
    const cid = this.resolveCustomerId(customerId);
    if (!cid) return undefined;
    const convo = this.conversations.find((c) => c.id === conversationId);
    if (!convo) return undefined;
    convo.customerId = cid;
    for (const m of this.messages) if (m.conversationId === convo.id) m.customerId = cid;
    return this.inboxRow(convo);
  }

  async getConversationDispatchInfo(
    conversationId: string,
  ): Promise<{ channel: CommChannel; counterparty: string; customerId: string | null } | undefined> {
    const convo = this.conversations.find((c) => c.id === conversationId);
    if (!convo) return undefined;
    return { channel: convo.channel, counterparty: convo.conversationKey, customerId: convo.customerId };
  }

  async listCustomerMessages(customerId: string): Promise<SmsMessage[] | undefined> {
    const cid = this.resolveCustomerId(customerId);
    if (!cid) return undefined;
    return this.messages
      .filter((m) => m.customerId === cid)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((m) => this.msgToDomain(m));
  }

  async createMessage(input: CreateMessageInput): Promise<{ id: string; deduped: boolean }> {
    if (input.idempotencyKey) {
      const dupe = this.messages.find((m) => m.idempotencyKey === input.idempotencyKey);
      if (dupe) return { id: dupe.id, deduped: true };
    }
    const row: MessageState = {
      id: randomUUID(),
      conversationId: input.conversationId ?? null,
      customerId: input.customerId ?? null,
      jobId: input.jobId ?? null,
      direction: input.direction,
      purpose: input.purpose ?? null,
      status: input.status,
      fromNumber: input.fromNumber ?? null,
      toNumber: input.toNumber ?? null,
      body: input.body,
      providerSid: input.providerSid ?? null,
      providerErrorCode: input.providerErrorCode ?? null,
      errorDetail: input.errorDetail ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
      sentAt: input.sentAt ?? null,
      deliveredAt: null,
      receivedAt: input.receivedAt ?? null,
      createdAt: new Date(),
    };
    this.messages.push(row);
    return { id: row.id, deduped: false };
  }

  async updateMessageStatusBySid(providerSid: string, status: string, errorCode?: string | null): Promise<void> {
    const m = this.messages.find((x) => x.providerSid === providerSid);
    if (!m) return;
    if (["delivered", "failed", "undelivered"].includes(m.status)) return; // don't regress terminal
    m.status = status;
    if (status === "delivered") m.deliveredAt = new Date();
    if (errorCode) m.providerErrorCode = errorCode;
  }

  async updateMessageStatus(
    id: string,
    status: string,
    fields?: { providerSid?: string | null; errorCode?: string | null; errorDetail?: string | null },
  ): Promise<void> {
    const m = this.messages.find((x) => x.id === id);
    if (!m) return;
    m.status = status;
    if (status === "sent") m.sentAt = new Date();
    if (status === "delivered") m.deliveredAt = new Date();
    if (fields?.providerSid !== undefined) m.providerSid = fields.providerSid;
    if (fields?.errorCode !== undefined) m.providerErrorCode = fields.errorCode;
    if (fields?.errorDetail !== undefined) m.errorDetail = fields.errorDetail;
  }

  async findCustomerByPhone(phoneE164: string): Promise<{ id: string } | "ambiguous" | undefined> {
    const ids = this.findCustomerIdByPhone(phoneE164);
    if (!ids || ids.length === 0) return undefined;
    if (ids.length > 1) return "ambiguous";
    return { id: ids[0] };
  }

  async scheduleCommunication(input: ScheduleCommInput): Promise<{ id: string; deduped: boolean }> {
    const dupe = this.scheduled.find((s) => s.idempotencyKey === input.idempotencyKey);
    if (dupe) return { id: dupe.id, deduped: true };
    const row: ScheduledState = {
      id: randomUUID(),
      customerId: input.customerId,
      jobId: input.jobId ?? null,
      purpose: input.purpose,
      scheduledFor: input.scheduledFor,
      status: "pending",
      idempotencyKey: input.idempotencyKey,
      scheduleVersion: input.scheduleVersion ?? null,
      messageId: null,
      lastError: null,
    };
    this.scheduled.push(row);
    return { id: row.id, deduped: false };
  }

  async cancelScheduledForJob(jobId: string, purpose?: CommPurpose): Promise<number> {
    let n = 0;
    for (const s of this.scheduled) {
      if (s.jobId === jobId && s.status === "pending" && (!purpose || s.purpose === purpose)) {
        s.status = "cancelled";
        n++;
      }
    }
    return n;
  }

  async claimDueScheduled(now: Date, limit: number): Promise<DueScheduledComm[]> {
    const due = this.scheduled
      .filter((s) => s.status === "pending" && s.scheduledFor.getTime() <= now.getTime())
      .slice(0, limit);
    for (const s of due) s.status = "processing";
    return due.map((s) => ({
      id: s.id,
      customerId: s.customerId,
      jobId: s.jobId,
      purpose: s.purpose,
      scheduleVersion: s.scheduleVersion,
    }));
  }

  async markScheduledResult(
    id: string,
    status: "sent" | "suppressed" | "failed" | "cancelled",
    fields?: { messageId?: string | null; lastError?: string | null },
  ): Promise<void> {
    const s = this.scheduled.find((x) => x.id === id);
    if (!s) return;
    s.status = status;
    s.messageId = fields?.messageId ?? null;
    s.lastError = fields?.lastError ?? null;
  }

  async recordAudit(_input: CommAuditInput): Promise<void> {
    // No-op persistence in memory mode (kept for interface parity).
  }
}
