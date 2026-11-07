import type { Customer, CustomerListItem, CustomerCreate, CustomerUpdate } from "../domain/customer.js";
import type {
  Partner,
  PartnerListItem,
  PartnerCreate,
  PartnerUpdate,
  PartnerHighlights,
  UpcomingPartnerItem,
} from "../domain/partner.js";
import type { TeamMember, TeamMemberListItem, TeamMemberCreate, TeamStats, TeamMemberDetail } from "../domain/team-member.js";
import type { UserProfile, UserProfileUpdate, UserIdentity } from "../domain/user-profile.js";
import type {
  Notification,
  NotificationUpdate,
  NotificationFilter,
  NotificationList,
} from "../domain/notification.js";
import type { CustomerStats } from "../domain/customer-stats.js";
import type { SearchResults } from "../domain/search.js";
import type { Pipeline, PipelineStats } from "../domain/deal.js";
import type { ConvoListItem, ConversationDetail } from "../domain/conversation.js";
import type { CalendarWeek, Digest } from "../domain/calendar.js";
import type { Home } from "../domain/home.js";
import type { Task, TaskCreate, TaskUpdate } from "../domain/task.js";
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
  CommPurpose as CommPurposeT,
  CommConsentStatus as CommConsentStatusT,
  CommChannel as CommChannelT,
} from "../domain/comms.js";
import type {
  Contact,
  ContactCreate,
  Property,
  PropertyCreate,
  PropertyUpdate,
  Plan,
  PlanCreate,
  Quote,
  QuoteCreate,
  QuoteUpdate,
  Job,
  JobCreate,
  JobUpdate,
  JobListItem,
  Review,
  ReviewCreate,
  ServiceOffering,
  ServiceOfferingCreate,
  ServiceOfferingUpdate,
  Appointment,
  AppointmentCreate,
  Interaction,
  InteractionCreate,
} from "../domain/crm.js";

/**
 * The data access seam. Both a memory implementation and a Postgres (Drizzle)
 * implementation satisfy this interface. Reads assemble the 360° customer
 * record from related entities; writes create those records.
 */
export interface Repository {
  // Home (today)
  getHome(): Promise<Home>;

  // Customers
  listCustomers(): Promise<CustomerListItem[]>;
  getCustomerStats(): Promise<CustomerStats>;
  getCustomer(id: string): Promise<Customer | undefined>;
  createCustomer(input: CustomerCreate): Promise<Customer>;
  updateCustomer(id: string, input: CustomerUpdate): Promise<Customer | undefined>;

  // Jobs (flat, cross-customer — for the Jobs table)
  listJobs(): Promise<JobListItem[]>;

  // Tasks ("Your priorities")
  listTasks(): Promise<Task[]>;
  createTask(input: TaskCreate): Promise<Task>;
  updateTask(id: string, input: TaskUpdate): Promise<Task | undefined>;

  // Customer sub-resources (the 360° record)
  addContact(customerId: string, input: ContactCreate): Promise<Contact | undefined>;
  addProperty(customerId: string, input: PropertyCreate): Promise<Property | undefined>;
  updateProperty(
    customerId: string,
    propertyId: string,
    input: PropertyUpdate,
  ): Promise<Property | undefined>;
  createPlan(customerId: string, input: PlanCreate): Promise<Plan | undefined>;
  createQuote(customerId: string, input: QuoteCreate): Promise<Quote | undefined>;
  createJob(customerId: string, input: JobCreate): Promise<Job | undefined>;
  updateJob(customerId: string, jobId: string, input: JobUpdate): Promise<Job | undefined>;
  addJobReview(customerId: string, jobId: string, input: ReviewCreate): Promise<Review | undefined>;
  listAppointments(customerId: string): Promise<Appointment[] | undefined>;
  createAppointment(customerId: string, input: AppointmentCreate): Promise<Appointment | undefined>;
  addInteraction(customerId: string, input: InteractionCreate): Promise<Interaction | undefined>;

  // Service offerings (reusable catalog / plan templates)
  listServiceOfferings(): Promise<ServiceOffering[]>;
  createServiceOffering(input: ServiceOfferingCreate): Promise<ServiceOffering>;
  updateServiceOffering(
    id: string,
    input: ServiceOfferingUpdate,
  ): Promise<ServiceOffering | undefined>;

  // Partners
  listPartners(): Promise<PartnerListItem[]>;
  getPartner(id: string): Promise<Partner | undefined>;
  createPartner(input: PartnerCreate): Promise<Partner>;
  updatePartner(id: string, input: PartnerUpdate): Promise<Partner | undefined>;
  getPartnerHighlights(): Promise<PartnerHighlights>;
  getUpcomingPartnerItems(): Promise<UpcomingPartnerItem[]>;

  // Team members (full-time staff)
  listTeamMembers(): Promise<TeamMemberListItem[]>;
  getTeamMember(id: string): Promise<TeamMemberDetail | undefined>;
  createTeamMember(input: TeamMemberCreate): Promise<TeamMember>;
  getTeamStats(): Promise<TeamStats>;

  // Current user (settings) — identity from claims, editable fields stored by sub
  getMyProfile(identity: UserIdentity): Promise<UserProfile>;
  updateMyProfile(identity: UserIdentity, input: UserProfileUpdate): Promise<UserProfile>;

  // Notifications center
  listNotifications(filter: NotificationFilter): Promise<NotificationList>;
  updateNotification(id: string, input: NotificationUpdate): Promise<Notification | undefined>;
  markAllNotificationsRead(): Promise<NotificationList>;

  // Global keyword search (all object types)
  search(query: string): Promise<SearchResults>;

  // Quotes (pipeline card edits)
  updateQuote(id: string, input: QuoteUpdate): Promise<Quote | undefined>;

  // Pipeline
  getPipeline(): Promise<Pipeline>;
  getPipelineStats(): Promise<PipelineStats>;

  // Conversations
  listConversations(): Promise<ConvoListItem[]>;
  getConversation(id: string): Promise<ConversationDetail | undefined>;

  // Calendar + digest
  getCalendarWeek(): Promise<CalendarWeek>;
  getDigest(): Promise<Digest>;

  // ── Unified Communications (Twilio SMS) ──
  comms: CommsRepository;
}

/**
 * Data-access seam for the Unified Communications (SMS) feature. Grouped under
 * `repo.comms` to keep the surface area organized as the feature grows. All
 * methods are tenant-scoped (single-tenant resolution today, matching the rest
 * of the repository).
 */
export interface CommsRepository {
  // Integration connection (Admin → Integrations)
  getConnection(): Promise<IntegrationConnection | undefined>;
  upsertConnection(input: IntegrationConnectionUpsert): Promise<IntegrationConnection>;
  disconnectConnection(): Promise<IntegrationConnection | undefined>;
  markConnectionValidated(ok: boolean, message: string): Promise<void>;
  touchConnection(field: "inbound" | "callback"): Promise<void>;

  // Notification settings (per purpose)
  listNotificationSettings(): Promise<NotificationSetting[]>;
  updateNotificationSetting(
    purpose: CommPurposeT,
    input: NotificationSettingUpdate,
  ): Promise<NotificationSetting | undefined>;

  // Customer preferences
  listCustomerPreferences(customerId: string): Promise<CommPreference[] | undefined>;
  setCustomerPreference(
    customerId: string,
    input: CommPreferenceUpdate,
    actor: string,
  ): Promise<CommPreference | undefined>;
  /** Effective consent for a (customer, purpose) at dispatch time. */
  getEffectiveConsent(customerId: string, purpose: CommPurposeT): Promise<CommConsentStatusT>;
  /** Apply a provider-level opt-out/opt-in across all SMS purposes for a phone. */
  applyProviderSuppression(phoneE164: string, blocked: boolean): Promise<string | undefined>;

  // Conversations (channel-agnostic, Pathways-owned)
  /**
   * Find-or-create the conversation for a channel + deterministic key, and keep
   * its last-activity fields fresh. Returns the conversation id. When a
   * customer is matched after the fact, the conversation is linked.
   */
  ensureConversation(input: EnsureConversationInput): Promise<{ id: string }>;
  listCustomerConversations(customerId: string): Promise<Conversation[] | undefined>;

  // Unified inbox (tenant-wide, cross-customer)
  listInboxConversations(filter: InboxFilter): Promise<InboxConversation[]>;
  getConversationView(conversationId: string): Promise<ConversationView | undefined>;
  /** Reset a conversation's unread counter to zero (on open). */
  markConversationRead(conversationId: string): Promise<void>;
  /**
   * Associate an unmatched conversation with a customer and backfill the
   * customer link on its messages. Returns the updated inbox row.
   */
  associateConversationCustomer(
    conversationId: string,
    customerId: string,
  ): Promise<InboxConversation | undefined>;
  /** Resolve a conversation's channel + customer-side address for replies. */
  getConversationDispatchInfo(
    conversationId: string,
  ): Promise<{ channel: CommChannelT; counterparty: string; customerId: string | null } | undefined>;

  // Messages (shared store)
  listCustomerMessages(customerId: string): Promise<SmsMessage[] | undefined>;
  /** Insert a message row; returns the created id. Dedupes on idempotencyKey. */
  createMessage(input: CreateMessageInput): Promise<{ id: string; deduped: boolean }>;
  updateMessageStatusBySid(
    providerSid: string,
    status: string,
    errorCode?: string | null,
  ): Promise<void>;
  updateMessageStatus(
    id: string,
    status: string,
    fields?: { providerSid?: string | null; errorCode?: string | null; errorDetail?: string | null },
  ): Promise<void>;
  findCustomerByPhone(phoneE164: string): Promise<{ id: string } | "ambiguous" | undefined>;

  // Scheduled communications (24h reminder)
  scheduleCommunication(input: ScheduleCommInput): Promise<{ id: string; deduped: boolean }>;
  cancelScheduledForJob(jobId: string, purpose?: CommPurposeT): Promise<number>;
  claimDueScheduled(now: Date, limit: number): Promise<DueScheduledComm[]>;
  markScheduledResult(
    id: string,
    status: "sent" | "suppressed" | "failed" | "cancelled",
    fields?: { messageId?: string | null; lastError?: string | null },
  ): Promise<void>;

  // Audit
  recordAudit(input: CommAuditInput): Promise<void>;
}

export type EnsureConversationInput = {
  channel: CommChannelT;
  /** Deterministic conversation key (e.g. customer E.164 for SMS). */
  conversationKey: string;
  customerId?: string | null;
  providerConversationId?: string | null;
  /** Latest message preview + timestamp to refresh last-activity. */
  lastMessagePreview?: string | null;
  lastMessageAt?: Date | null;
  /** Increment the unread counter (inbound messages). */
  incrementUnread?: boolean;
};

export type CreateMessageInput = {
  conversationId?: string | null;
  customerId?: string | null;
  jobId?: string | null;
  direction: "inbound" | "outbound";
  purpose?: CommPurposeT | null;
  status: string;
  fromNumber?: string | null;
  toNumber?: string | null;
  body: string;
  providerSid?: string | null;
  providerErrorCode?: string | null;
  errorDetail?: string | null;
  idempotencyKey?: string | null;
  sentAt?: Date | null;
  receivedAt?: Date | null;
};

export type ScheduleCommInput = {
  customerId: string;
  jobId?: string | null;
  purpose: CommPurposeT;
  scheduledFor: Date;
  idempotencyKey: string;
  scheduleVersion?: string | null;
};

export type DueScheduledComm = {
  id: string;
  customerId: string;
  jobId: string | null;
  purpose: CommPurposeT;
  scheduleVersion: string | null;
};

export type CommAuditInput = {
  action: string;
  actor?: string | null;
  customerId?: string | null;
  messageId?: string | null;
  detail?: Record<string, unknown>;
};
