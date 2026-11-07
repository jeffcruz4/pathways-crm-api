/**
 * Postgres (Drizzle) implementation of the comms (SMS) data-access seam.
 *
 * Kept in its own class so the large main repository stays focused. It receives
 * the shared Drizzle client plus helpers to resolve the active tenant and a
 * customer (UUID or slug), mirroring the main repository's single-tenant model.
 */
import { and, asc, desc, eq, ilike, inArray, lte, or, sql, type InferSelectModel } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../db/schema.js";
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
} from "../domain/comms.js";
import { NOTIFICATION_PURPOSES } from "../domain/comms.js";
import { DEFAULT_TEMPLATES } from "../comms/template.js";
import {
  mapConnection,
  mapNotificationSetting,
  mapCommPreference,
  mapSmsMessage,
  mapConversation,
} from "./assembleComms.js";

type Db = PostgresJsDatabase<typeof schema>;

export class PostgresCommsRepository implements CommsRepository {
  constructor(
    private readonly db: Db,
    private readonly getTenantId: () => Promise<string>,
    private readonly resolveCustomer: (idOrSlug: string) => Promise<{ id: string; tenantId: string } | undefined>,
  ) {}

  // ── Connection ──
  async getConnection(): Promise<IntegrationConnection | undefined> {
    const tenantId = await this.getTenantId();
    const [row] = await this.db
      .select()
      .from(schema.channelConnections)
      .where(
        and(
          eq(schema.channelConnections.tenantId, tenantId),
          eq(schema.channelConnections.provider, "twilio"),
          eq(schema.channelConnections.channel, "sms"),
        ),
      );
    return row ? mapConnection(row) : undefined;
  }

  async upsertConnection(input: IntegrationConnectionUpsert): Promise<IntegrationConnection> {
    const tenantId = await this.getTenantId();
    const [existing] = await this.db
      .select()
      .from(schema.channelConnections)
      .where(
        and(
          eq(schema.channelConnections.tenantId, tenantId),
          eq(schema.channelConnections.provider, "twilio"),
          eq(schema.channelConnections.channel, "sms"),
        ),
      );

    // When an auth token is supplied, store only a reference to where the secret
    // lives (env var name today). The raw token is intentionally discarded here.
    const credentialRef = input.authToken ? "env:TWILIO_AUTH_TOKEN" : existing?.credentialRef ?? null;

    const values = {
      accountSid: input.accountSid ?? existing?.accountSid ?? null,
      messagingServiceSid: input.messagingServiceSid ?? existing?.messagingServiceSid ?? null,
      fromNumber: input.fromNumber ?? existing?.fromNumber ?? null,
      credentialRef,
      businessName: input.businessName ?? existing?.businessName ?? null,
      businessPhone: input.businessPhone ?? existing?.businessPhone ?? null,
      reviewUrl: input.reviewUrl ? input.reviewUrl : input.reviewUrl === "" ? null : existing?.reviewUrl ?? null,
      updatedAt: new Date(),
    };

    // Compute a status: connected requires sid + credential + a sender.
    const hasSender = !!(values.messagingServiceSid || values.fromNumber);
    const ready = !!values.accountSid && !!values.credentialRef && hasSender;
    const status = existing?.status === "connected" && ready
      ? "connected"
      : ready
        ? "setup_required"
        : "setup_required";

    if (existing) {
      const [row] = await this.db
        .update(schema.channelConnections)
        .set({ ...values, status: existing.status === "disconnected" ? "setup_required" : status })
        .where(eq(schema.channelConnections.id, existing.id))
        .returning();
      return mapConnection(row);
    }
    const [row] = await this.db
      .insert(schema.channelConnections)
      .values({ tenantId, provider: "twilio", channel: "sms", status, ...values })
      .returning();
    return mapConnection(row);
  }

  async disconnectConnection(): Promise<IntegrationConnection | undefined> {
    const tenantId = await this.getTenantId();
    const [row] = await this.db
      .update(schema.channelConnections)
      .set({ status: "disconnected", disconnectedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(schema.channelConnections.tenantId, tenantId),
          eq(schema.channelConnections.provider, "twilio"),
          eq(schema.channelConnections.channel, "sms"),
        ),
      )
      .returning();
    return row ? mapConnection(row) : undefined;
  }

  async markConnectionValidated(ok: boolean, message: string): Promise<void> {
    const tenantId = await this.getTenantId();
    await this.db
      .update(schema.channelConnections)
      .set({
        status: ok ? "connected" : "action_required",
        lastValidatedAt: new Date(),
        lastError: ok ? null : message,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.channelConnections.tenantId, tenantId),
          eq(schema.channelConnections.provider, "twilio"),
          eq(schema.channelConnections.channel, "sms"),
        ),
      );
  }

  async touchConnection(field: "inbound" | "callback"): Promise<void> {
    const tenantId = await this.getTenantId();
    const patch = field === "inbound" ? { lastInboundAt: new Date() } : { lastCallbackAt: new Date() };
    await this.db
      .update(schema.channelConnections)
      .set({ ...patch, updatedAt: new Date() })
      .where(
        and(
          eq(schema.channelConnections.tenantId, tenantId),
          eq(schema.channelConnections.provider, "twilio"),
          eq(schema.channelConnections.channel, "sms"),
        ),
      );
  }

  // ── Notification settings ──
  async listNotificationSettings(): Promise<NotificationSetting[]> {
    const tenantId = await this.getTenantId();
    const rows = await this.db
      .select()
      .from(schema.smsNotificationSettings)
      .where(eq(schema.smsNotificationSettings.tenantId, tenantId));
    const byPurpose = new Map(rows.map((r) => [r.purpose, r]));
    // Ensure all four notification purposes are represented, seeding defaults.
    const out: NotificationSetting[] = [];
    for (const purpose of NOTIFICATION_PURPOSES) {
      const existing = byPurpose.get(purpose);
      if (existing) {
        out.push(mapNotificationSetting(existing));
      } else {
        out.push({ purpose, enabled: true, templateBody: DEFAULT_TEMPLATES[purpose] ?? "" });
      }
    }
    return out;
  }

  async updateNotificationSetting(
    purpose: CommPurpose,
    input: NotificationSettingUpdate,
  ): Promise<NotificationSetting | undefined> {
    const tenantId = await this.getTenantId();
    const [existing] = await this.db
      .select()
      .from(schema.smsNotificationSettings)
      .where(
        and(
          eq(schema.smsNotificationSettings.tenantId, tenantId),
          eq(schema.smsNotificationSettings.purpose, purpose),
        ),
      );
    if (existing) {
      const [row] = await this.db
        .update(schema.smsNotificationSettings)
        .set({
          enabled: input.enabled ?? existing.enabled,
          templateBody: input.templateBody ?? existing.templateBody,
          updatedAt: new Date(),
        })
        .where(eq(schema.smsNotificationSettings.id, existing.id))
        .returning();
      return mapNotificationSetting(row);
    }
    const [row] = await this.db
      .insert(schema.smsNotificationSettings)
      .values({
        tenantId,
        purpose,
        enabled: input.enabled ?? true,
        templateBody: input.templateBody ?? DEFAULT_TEMPLATES[purpose] ?? "",
      })
      .returning();
    return mapNotificationSetting(row);
  }

  // ── Customer preferences ──
  async listCustomerPreferences(customerId: string): Promise<CommPreference[] | undefined> {
    const c = await this.resolveCustomer(customerId);
    if (!c) return undefined;
    const rows = await this.db
      .select()
      .from(schema.customerCommPreferences)
      .where(eq(schema.customerCommPreferences.customerId, c.id));
    const byPurpose = new Map(rows.map((r) => [r.purpose, r]));
    // Expose a row for every notification purpose, defaulting to "unknown".
    return NOTIFICATION_PURPOSES.map((purpose) => {
      const existing = byPurpose.get(purpose);
      return existing
        ? mapCommPreference(existing)
        : { purpose, status: "unknown" as CommConsentStatus, source: null, capturedAt: null, providerStatus: null, updatedAt: null };
    });
  }

  async setCustomerPreference(
    customerId: string,
    input: CommPreferenceUpdate,
    actor: string,
  ): Promise<CommPreference | undefined> {
    const c = await this.resolveCustomer(customerId);
    if (!c) return undefined;
    const [existing] = await this.db
      .select()
      .from(schema.customerCommPreferences)
      .where(
        and(
          eq(schema.customerCommPreferences.customerId, c.id),
          eq(schema.customerCommPreferences.channel, "sms"),
          eq(schema.customerCommPreferences.purpose, input.purpose),
        ),
      );
    // A provider-level block cannot be cleared by a UI toggle.
    if (existing?.status === "provider_blocked") {
      return mapCommPreference(existing);
    }
    if (existing) {
      const [row] = await this.db
        .update(schema.customerCommPreferences)
        .set({
          status: input.status,
          source: input.source ?? "staff",
          capturedAt: new Date(),
          capturedBy: actor,
          updatedAt: new Date(),
        })
        .where(eq(schema.customerCommPreferences.id, existing.id))
        .returning();
      return mapCommPreference(row);
    }
    const [row] = await this.db
      .insert(schema.customerCommPreferences)
      .values({
        tenantId: c.tenantId,
        customerId: c.id,
        channel: "sms",
        purpose: input.purpose,
        status: input.status,
        source: input.source ?? "staff",
        capturedAt: new Date(),
        capturedBy: actor,
      })
      .returning();
    return mapCommPreference(row);
  }

  async getEffectiveConsent(customerId: string, purpose: CommPurpose): Promise<CommConsentStatus> {
    const c = await this.resolveCustomer(customerId);
    if (!c) return "unknown";
    const [row] = await this.db
      .select()
      .from(schema.customerCommPreferences)
      .where(
        and(
          eq(schema.customerCommPreferences.customerId, c.id),
          eq(schema.customerCommPreferences.channel, "sms"),
          eq(schema.customerCommPreferences.purpose, purpose),
        ),
      );
    return (row?.status as CommConsentStatus) ?? "unknown";
  }

  async applyProviderSuppression(phoneE164: string, blocked: boolean): Promise<string | undefined> {
    const tenantId = await this.getTenantId();
    // Find the customer that owns this phone via customer_contacts.
    const [contact] = await this.db
      .select()
      .from(schema.customerContacts)
      .where(
        and(
          eq(schema.customerContacts.tenantId, tenantId),
          eq(schema.customerContacts.value, phoneE164),
        ),
      );
    const customerId = contact?.customerId;
    const nextStatus: CommConsentStatus = blocked ? "provider_blocked" : "opted_in";
    // Reconcile across all SMS purposes for this customer (if matched).
    if (customerId) {
      for (const purpose of NOTIFICATION_PURPOSES) {
        const [existing] = await this.db
          .select()
          .from(schema.customerCommPreferences)
          .where(
            and(
              eq(schema.customerCommPreferences.customerId, customerId),
              eq(schema.customerCommPreferences.channel, "sms"),
              eq(schema.customerCommPreferences.purpose, purpose),
            ),
          );
        if (existing) {
          await this.db
            .update(schema.customerCommPreferences)
            .set({
              status: nextStatus,
              providerStatus: blocked ? "stop" : "start",
              providerSyncedAt: new Date(),
              source: "inbound_keyword",
              updatedAt: new Date(),
            })
            .where(eq(schema.customerCommPreferences.id, existing.id));
        } else {
          await this.db.insert(schema.customerCommPreferences).values({
            tenantId,
            customerId,
            channel: "sms",
            purpose,
            status: nextStatus,
            providerStatus: blocked ? "stop" : "start",
            providerSyncedAt: new Date(),
            source: "inbound_keyword",
          });
        }
      }
    }
    return customerId ?? undefined;
  }

  // ── Conversations ──
  async ensureConversation(input: EnsureConversationInput): Promise<{ id: string }> {
    const tenantId = await this.getTenantId();
    const conn = await this.db
      .select({ id: schema.channelConnections.id })
      .from(schema.channelConnections)
      .where(
        and(
          eq(schema.channelConnections.tenantId, tenantId),
          eq(schema.channelConnections.channel, input.channel),
        ),
      );
    const channelConnectionId = conn[0]?.id ?? null;

    const [existing] = await this.db
      .select()
      .from(schema.conversations)
      .where(
        and(
          eq(schema.conversations.tenantId, tenantId),
          eq(schema.conversations.channel, input.channel),
          eq(schema.conversations.conversationKey, input.conversationKey),
        ),
      );

    if (existing) {
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      // Link a customer if we now know one and the conversation was unmatched.
      if (input.customerId && !existing.customerId) patch.customerId = input.customerId;
      if (input.providerConversationId && !existing.providerConversationId)
        patch.providerConversationId = input.providerConversationId;
      if (input.lastMessageAt) patch.lastMessageAt = input.lastMessageAt;
      if (input.lastMessagePreview !== undefined) patch.lastMessagePreview = input.lastMessagePreview;
      if (input.incrementUnread) patch.unreadCount = (existing.unreadCount ?? 0) + 1;
      await this.db
        .update(schema.conversations)
        .set(patch as never)
        .where(eq(schema.conversations.id, existing.id));
      return { id: existing.id };
    }

    const [row] = await this.db
      .insert(schema.conversations)
      .values({
        tenantId,
        customerId: input.customerId ?? null,
        channel: input.channel,
        channelConnectionId,
        conversationKey: input.conversationKey,
        providerConversationId: input.providerConversationId ?? null,
        lastMessageAt: input.lastMessageAt ?? new Date(),
        lastMessagePreview: input.lastMessagePreview ?? null,
        unreadCount: input.incrementUnread ? 1 : 0,
      })
      .returning({ id: schema.conversations.id });
    return { id: row.id };
  }

  async listCustomerConversations(customerId: string): Promise<Conversation[] | undefined> {
    const c = await this.resolveCustomer(customerId);
    if (!c) return undefined;
    const rows = await this.db
      .select()
      .from(schema.conversations)
      .where(eq(schema.conversations.customerId, c.id))
      .orderBy(asc(schema.conversations.lastMessageAt));
    return rows.map(mapConversation);
  }

  // ── Unified inbox (tenant-wide) ──
  private inboxRow(
    r: InferSelectModel<typeof schema.conversations>,
    customerName: string | null,
  ): InboxConversation {
    return {
      id: r.id,
      channel: r.channel,
      status: r.status,
      customerId: r.customerId,
      customerName,
      counterparty: r.conversationKey,
      lastMessageAt: r.lastMessageAt ? r.lastMessageAt.toISOString() : null,
      lastMessagePreview: r.lastMessagePreview,
      unreadCount: r.unreadCount,
      unmatched: !r.customerId,
    };
  }

  async listInboxConversations(filter: InboxFilter): Promise<InboxConversation[]> {
    const tenantId = await this.getTenantId();
    const conds = [eq(schema.conversations.tenantId, tenantId)];
    if (filter.status) conds.push(eq(schema.conversations.status, filter.status));
    if (filter.channel) conds.push(eq(schema.conversations.channel, filter.channel));
    if (filter.unread) conds.push(sql`${schema.conversations.unreadCount} > 0`);
    if (filter.unmatched) conds.push(sql`${schema.conversations.customerId} IS NULL`);
    if (filter.search) {
      const term = `%${filter.search}%`;
      conds.push(
        or(
          ilike(schema.conversations.conversationKey, term),
          ilike(schema.conversations.lastMessagePreview, term),
        )!,
      );
    }
    const rows = await this.db
      .select()
      .from(schema.conversations)
      .where(and(...conds))
      .orderBy(desc(schema.conversations.lastMessageAt));

    const names = await this.customerNames(rows.map((r) => r.customerId));
    return rows.map((r) => this.inboxRow(r, r.customerId ? names.get(r.customerId) ?? null : null));
  }

  private async customerNames(ids: (string | null)[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((x): x is string => !!x))];
    const out = new Map<string, string>();
    if (unique.length === 0) return out;
    const rows = await this.db
      .select({ id: schema.customers.id, name: schema.customers.displayName })
      .from(schema.customers)
      .where(inArray(schema.customers.id, unique));
    for (const r of rows) out.set(r.id, r.name);
    return out;
  }

  async getConversationView(conversationId: string): Promise<ConversationView | undefined> {
    const tenantId = await this.getTenantId();
    const [convo] = await this.db
      .select()
      .from(schema.conversations)
      .where(
        and(eq(schema.conversations.tenantId, tenantId), eq(schema.conversations.id, conversationId)),
      );
    if (!convo) return undefined;
    const names = await this.customerNames([convo.customerId]);
    const messages = await this.db
      .select()
      .from(schema.smsMessages)
      .where(eq(schema.smsMessages.conversationId, convo.id))
      .orderBy(asc(schema.smsMessages.createdAt));
    return {
      conversation: this.inboxRow(convo, convo.customerId ? names.get(convo.customerId) ?? null : null),
      messages: messages.map(mapSmsMessage),
    };
  }

  async markConversationRead(conversationId: string): Promise<void> {
    const tenantId = await this.getTenantId();
    await this.db
      .update(schema.conversations)
      .set({ unreadCount: 0, updatedAt: new Date() })
      .where(
        and(eq(schema.conversations.tenantId, tenantId), eq(schema.conversations.id, conversationId)),
      );
  }

  async associateConversationCustomer(
    conversationId: string,
    customerId: string,
  ): Promise<InboxConversation | undefined> {
    const tenantId = await this.getTenantId();
    const c = await this.resolveCustomer(customerId);
    if (!c) return undefined;
    const [convo] = await this.db
      .update(schema.conversations)
      .set({ customerId: c.id, updatedAt: new Date() })
      .where(
        and(eq(schema.conversations.tenantId, tenantId), eq(schema.conversations.id, conversationId)),
      )
      .returning();
    if (!convo) return undefined;
    // Backfill the customer link on the conversation's messages.
    await this.db
      .update(schema.smsMessages)
      .set({ customerId: c.id, updatedAt: new Date() })
      .where(eq(schema.smsMessages.conversationId, convo.id));
    const names = await this.customerNames([c.id]);
    return this.inboxRow(convo, names.get(c.id) ?? null);
  }

  async getConversationDispatchInfo(
    conversationId: string,
  ): Promise<{ channel: CommChannel; counterparty: string; customerId: string | null } | undefined> {
    const tenantId = await this.getTenantId();
    const [convo] = await this.db
      .select()
      .from(schema.conversations)
      .where(
        and(eq(schema.conversations.tenantId, tenantId), eq(schema.conversations.id, conversationId)),
      );
    if (!convo) return undefined;
    return { channel: convo.channel, counterparty: convo.conversationKey, customerId: convo.customerId };
  }

  // ── Messages ──
  async listCustomerMessages(customerId: string): Promise<SmsMessage[] | undefined> {
    const c = await this.resolveCustomer(customerId);
    if (!c) return undefined;
    const rows = await this.db
      .select()
      .from(schema.smsMessages)
      .where(eq(schema.smsMessages.customerId, c.id))
      .orderBy(asc(schema.smsMessages.createdAt));
    return rows.map(mapSmsMessage);
  }

  async createMessage(input: CreateMessageInput): Promise<{ id: string; deduped: boolean }> {
    const tenantId = await this.getTenantId();
    // Idempotency: if a key is supplied and already present, return the existing id.
    if (input.idempotencyKey) {
      const [dupe] = await this.db
        .select({ id: schema.smsMessages.id })
        .from(schema.smsMessages)
        .where(
          and(
            eq(schema.smsMessages.tenantId, tenantId),
            eq(schema.smsMessages.idempotencyKey, input.idempotencyKey),
          ),
        );
      if (dupe) return { id: dupe.id, deduped: true };
    }
    const [row] = await this.db
      .insert(schema.smsMessages)
      .values({
        tenantId,
        conversationId: input.conversationId ?? null,
        customerId: input.customerId ?? null,
        jobId: input.jobId ?? null,
        direction: input.direction,
        purpose: input.purpose ?? null,
        status: input.status as never,
        fromNumber: input.fromNumber ?? null,
        toNumber: input.toNumber ?? null,
        body: input.body,
        providerSid: input.providerSid ?? null,
        providerErrorCode: input.providerErrorCode ?? null,
        errorDetail: input.errorDetail ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
        sentAt: input.sentAt ?? null,
        receivedAt: input.receivedAt ?? null,
      })
      .returning({ id: schema.smsMessages.id });
    return { id: row.id, deduped: false };
  }

  async updateMessageStatusBySid(
    providerSid: string,
    status: string,
    errorCode?: string | null,
  ): Promise<void> {
    const tenantId = await this.getTenantId();
    const patch: Record<string, unknown> = { status, updatedAt: new Date() };
    if (status === "delivered") patch.deliveredAt = new Date();
    if (status === "failed" || status === "undelivered") patch.failedAt = new Date();
    if (errorCode) patch.providerErrorCode = errorCode;
    // Don't regress a terminal state on a stale/out-of-order callback.
    await this.db
      .update(schema.smsMessages)
      .set(patch as never)
      .where(
        and(
          eq(schema.smsMessages.tenantId, tenantId),
          eq(schema.smsMessages.providerSid, providerSid),
          sql`${schema.smsMessages.status} NOT IN ('delivered','failed','undelivered')`,
        ),
      );
  }

  async updateMessageStatus(
    id: string,
    status: string,
    fields?: { providerSid?: string | null; errorCode?: string | null; errorDetail?: string | null },
  ): Promise<void> {
    const patch: Record<string, unknown> = { status, updatedAt: new Date() };
    if (status === "sent") patch.sentAt = new Date();
    if (status === "delivered") patch.deliveredAt = new Date();
    if (status === "failed" || status === "undelivered") patch.failedAt = new Date();
    if (fields?.providerSid !== undefined) patch.providerSid = fields.providerSid;
    if (fields?.errorCode !== undefined) patch.providerErrorCode = fields.errorCode;
    if (fields?.errorDetail !== undefined) patch.errorDetail = fields.errorDetail;
    await this.db.update(schema.smsMessages).set(patch as never).where(eq(schema.smsMessages.id, id));
  }

  async findCustomerByPhone(phoneE164: string): Promise<{ id: string } | "ambiguous" | undefined> {
    const tenantId = await this.getTenantId();
    const rows = await this.db
      .select({ customerId: schema.customerContacts.customerId })
      .from(schema.customerContacts)
      .where(
        and(
          eq(schema.customerContacts.tenantId, tenantId),
          eq(schema.customerContacts.value, phoneE164),
        ),
      );
    const unique = [...new Set(rows.map((r) => r.customerId))];
    if (unique.length === 0) return undefined;
    if (unique.length > 1) return "ambiguous";
    return { id: unique[0] };
  }

  // ── Scheduled communications ──
  async scheduleCommunication(input: ScheduleCommInput): Promise<{ id: string; deduped: boolean }> {
    const tenantId = await this.getTenantId();
    const [dupe] = await this.db
      .select({ id: schema.scheduledCommunications.id })
      .from(schema.scheduledCommunications)
      .where(
        and(
          eq(schema.scheduledCommunications.tenantId, tenantId),
          eq(schema.scheduledCommunications.idempotencyKey, input.idempotencyKey),
        ),
      );
    if (dupe) return { id: dupe.id, deduped: true };
    const [row] = await this.db
      .insert(schema.scheduledCommunications)
      .values({
        tenantId,
        customerId: input.customerId,
        jobId: input.jobId ?? null,
        purpose: input.purpose,
        scheduledFor: input.scheduledFor,
        idempotencyKey: input.idempotencyKey,
        scheduleVersion: input.scheduleVersion ?? null,
      })
      .returning({ id: schema.scheduledCommunications.id });
    return { id: row.id, deduped: false };
  }

  async cancelScheduledForJob(jobId: string, purpose?: CommPurpose): Promise<number> {
    const tenantId = await this.getTenantId();
    const conds = [
      eq(schema.scheduledCommunications.tenantId, tenantId),
      eq(schema.scheduledCommunications.jobId, jobId),
      eq(schema.scheduledCommunications.status, "pending"),
    ];
    if (purpose) conds.push(eq(schema.scheduledCommunications.purpose, purpose));
    const rows = await this.db
      .update(schema.scheduledCommunications)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(and(...conds))
      .returning({ id: schema.scheduledCommunications.id });
    return rows.length;
  }

  async claimDueScheduled(now: Date, limit: number): Promise<DueScheduledComm[]> {
    // Claim pending-and-due rows by flipping them to "processing" in one update.
    const due = await this.db
      .select({ id: schema.scheduledCommunications.id })
      .from(schema.scheduledCommunications)
      .where(
        and(
          eq(schema.scheduledCommunications.status, "pending"),
          lte(schema.scheduledCommunications.scheduledFor, now),
        ),
      )
      .limit(limit);
    const ids = due.map((d) => d.id);
    if (ids.length === 0) return [];
    const claimed = await this.db
      .update(schema.scheduledCommunications)
      .set({ status: "processing", updatedAt: new Date() })
      .where(
        and(
          inArray(schema.scheduledCommunications.id, ids),
          eq(schema.scheduledCommunications.status, "pending"),
        ),
      )
      .returning();
    return claimed.map((r) => ({
      id: r.id,
      customerId: r.customerId,
      jobId: r.jobId,
      purpose: r.purpose,
      scheduleVersion: r.scheduleVersion,
    }));
  }

  async markScheduledResult(
    id: string,
    status: "sent" | "suppressed" | "failed" | "cancelled",
    fields?: { messageId?: string | null; lastError?: string | null },
  ): Promise<void> {
    await this.db
      .update(schema.scheduledCommunications)
      .set({
        status,
        messageId: fields?.messageId ?? null,
        lastError: fields?.lastError ?? null,
        updatedAt: new Date(),
      })
      .where(eq(schema.scheduledCommunications.id, id));
  }

  // ── Audit ──
  async recordAudit(input: CommAuditInput): Promise<void> {
    const tenantId = await this.getTenantId();
    await this.db.insert(schema.commAuditEvents).values({
      tenantId,
      action: input.action,
      actor: input.actor ?? null,
      customerId: input.customerId ?? null,
      messageId: input.messageId ?? null,
      detail: input.detail ?? {},
    });
  }
}
