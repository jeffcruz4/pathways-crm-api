/**
 * Drizzle schema — the Postgres (RDS) data model for the CRM.
 *
 * Reflects docs/design/customer-data-model.md (v3, decisions Q1–Q11 locked):
 * a normalized, multi-tenant relational model. The customer row holds identity
 * only; properties, contacts, plans (per-customer subscriptions to reusable
 * service_offerings), quotes (= the pipeline), jobs, appointments, and reviews
 * hang off it by FK. Work is performed by a `team_member` (your staff) OR a
 * contracted `partner` (assignee_type + two nullable FKs, CHECK-enforced). Money is stored
 * in integer cents; dates/times are real date/timestamptz; ids are UUIDs with
 * an optional per-tenant `slug` for URLs.
 *
 * Volatile/aggregate fields (lifetime value, last/next service, partner
 * rollups, worker ratings) are NOT stored — they're computed on read (Q6).
 */
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  boolean,
  jsonb,
  numeric,
  char,
  date,
  timestamp,
  uniqueIndex,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ─────────────────────────────── Enums ───────────────────────────────
export const customerStatus = pgEnum("customer_status", ["lead", "active", "lapsed"]);
export const customerStage = pgEnum("customer_stage", ["new-lead", "quote", "booked", "recurring"]);
export const contactChannel = pgEnum("contact_channel", ["sms", "email", "call"]);
export const contactKind = pgEnum("contact_kind", ["mobile", "landline", "email"]);
export const consentStatus = pgEnum("consent_status", ["unknown", "opted_in", "opted_out"]);
export const propertyType = pgEnum("property_type", ["house", "apartment", "commercial"]);
export const serviceType = pgEnum("service_type", ["standard", "deep", "move-out", "one-time"]);
export const planFrequency = pgEnum("plan_frequency", ["weekly", "biweekly", "monthly", "one-time"]);
export const planStatus = pgEnum("plan_status", ["active", "paused", "cancelled"]);
export const quoteStatus = pgEnum("quote_status", [
  "draft",
  "sent",
  "follow-up",
  "accepted",
  "declined",
  "expired",
]);
export const priceUnit = pgEnum("price_unit", ["per-visit", "flat"]);
export const dealSignal = pgEnum("deal_signal", ["cori", "needs-you", "info"]);
export const jobStatus = pgEnum("job_status", [
  "scheduled",
  "en-route",
  "in-progress",
  "completed",
  "cancelled",
  "no-show",
]);
export const assigneeType = pgEnum("assignee_type", ["team_member", "partner"]);
export const appointmentKind = pgEnum("appointment_kind", [
  "clean",
  "walkthrough",
  "quote-visit",
  "call",
  "other",
]);
export const appointmentStatus = pgEnum("appointment_status", [
  "scheduled",
  "confirmed",
  "completed",
  "cancelled",
  "no-show",
]);
export const reviewSource = pgEnum("review_source", ["customer", "staff"]);
export const taskStatus = pgEnum("task_status", ["open", "done"]);
export const taskBucket = pgEnum("task_bucket", ["today", "overdue", "upcoming"]);
export const taskRelatedType = pgEnum("task_related_type", ["customer", "team-member", "partner"]);
export const interactionType = pgEnum("interaction_type", [
  "unplanned",
  "formal-meeting",
  "complaint",
  "compliment",
]);
export const interactionMethod = pgEnum("interaction_method", ["call", "text", "email", "dm"]);
export const teamMemberStatus = pgEnum("team_member_status", ["active", "inactive", "on-leave"]);
export const employmentType = pgEnum("employment_type", ["full-time", "part-time"]);
export const partnerType = pgEnum("partner_type", ["lead-gen", "contractor", "both"]);
export const partnerStage = pgEnum("partner_stage", [
  "prospect",
  "vetting",
  "onboarding",
  "active",
  "paused",
]);

// Shared column builders.
const pk = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
const archivedAt = () => timestamp("archived_at", { withTimezone: true });

// ─────────────────────────────── Tenants ───────────────────────────────
export const tenants = pgTable("tenants", {
  id: pk(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ─────────────────────────────── Customers ───────────────────────────────
export const customers = pgTable(
  "customers",
  {
    id: pk(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    slug: text("slug"),
    displayName: text("display_name").notNull(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    companyName: text("company_name"),
    status: customerStatus("status").notNull().default("lead"),
    lifecycleStage: customerStage("lifecycle_stage").notNull().default("new-lead"),
    preferredContact: contactChannel("preferred_contact"),
    source: text("source"),
    referredByPartnerId: uuid("referred_by_partner_id").references(() => partners.id),
    referredByTeamMemberId: uuid("referred_by_team_member_id").references(() => teamMembers.id),
    summary: text("summary").notNull().default(""),
    provenance: text("provenance").notNull().default(""),
    goodToKnow: jsonb("good_to_know").$type<string[]>().notNull().default([]),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: archivedAt(),
  },
  (t) => ({
    bySlug: uniqueIndex("customers_tenant_slug_uq").on(t.tenantId, t.slug),
    byTenant: index("customers_tenant_idx").on(t.tenantId),
  }),
);

// ──────────────────────── Customer contacts (+ consent) ────────────────────────
export const customerContacts = pgTable(
  "customer_contacts",
  {
    id: pk(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    kind: contactKind("kind").notNull(),
    value: text("value").notNull(),
    label: text("label"),
    isPrimary: boolean("is_primary").notNull().default(false),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    consentStatus: consentStatus("consent_status").notNull().default("unknown"),
    consentSource: text("consent_source"),
    consentAt: timestamp("consent_at", { withTimezone: true }),
    optOutAt: timestamp("opt_out_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    // At most one primary contact per (customer, kind).
    onePrimaryPerKind: uniqueIndex("customer_contacts_primary_uq")
      .on(t.tenantId, t.customerId, t.kind)
      .where(sql`${t.isPrimary}`),
    byCustomer: index("customer_contacts_customer_idx").on(t.customerId),
  }),
);

// ─────────────────────────────── Properties ───────────────────────────────
export const properties = pgTable(
  "properties",
  {
    id: pk(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    label: text("label"),
    addressLine1: text("address_line1").notNull(),
    addressLine2: text("address_line2"),
    city: text("city").notNull(),
    region: text("region").notNull(),
    postalCode: text("postal_code").notNull(),
    country: char("country", { length: 2 }).notNull().default("US"),
    latitude: numeric("latitude"),
    longitude: numeric("longitude"),
    propertyType: propertyType("property_type"),
    bedrooms: integer("bedrooms"),
    bathrooms: integer("bathrooms"),
    squareFeet: integer("square_feet"),
    accessNotes: text("access_notes"),
    homeDetails: jsonb("home_details").$type<unknown[]>().notNull().default([]),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: archivedAt(),
  },
  (t) => ({ byCustomer: index("properties_customer_idx").on(t.customerId) }),
);

// ─────────────────────── Service offerings (reusable catalog) ───────────────────────
export const serviceOfferings = pgTable(
  "service_offerings",
  {
    id: pk(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: text("name").notNull(),
    serviceType: serviceType("service_type").notNull(),
    frequency: planFrequency("frequency").notNull(),
    description: text("description"),
    defaultPriceCents: integer("default_price_cents"),
    currency: char("currency", { length: 3 }).notNull().default("USD"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: archivedAt(),
  },
  (t) => ({ byTenant: index("service_offerings_tenant_idx").on(t.tenantId) }),
);

// ─────────────────────── Plans (per-customer subscription) ───────────────────────
export const plans = pgTable(
  "plans",
  {
    id: pk(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id),
    offeringId: uuid("offering_id").references(() => serviceOfferings.id),
    name: text("name").notNull(),
    description: text("description"),
    serviceType: serviceType("service_type").notNull(),
    frequency: planFrequency("frequency").notNull(),
    status: planStatus("status").notNull().default("active"),
    priceCents: integer("price_cents").notNull(),
    currency: char("currency", { length: 3 }).notNull().default("USD"),
    startDate: date("start_date"),
    endDate: date("end_date"),
    sourceQuoteId: uuid("source_quote_id").references(() => quotes.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: archivedAt(),
  },
  (t) => ({
    byCustomer: index("plans_customer_idx").on(t.customerId),
    byProperty: index("plans_property_idx").on(t.propertyId),
  }),
);

// ─────────────────────────── Quotes (= pipeline) ───────────────────────────
export const quotes = pgTable(
  "quotes",
  {
    id: pk(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    propertyId: uuid("property_id").references(() => properties.id),
    status: quoteStatus("status").notNull().default("draft"),
    serviceType: serviceType("service_type").notNull(),
    frequency: planFrequency("frequency"),
    amountCents: integer("amount_cents").notNull(),
    currency: char("currency", { length: 3 }).notNull().default("USD"),
    priceUnit: priceUnit("price_unit").notNull().default("per-visit"),
    validUntil: date("valid_until"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    signal: dealSignal("signal").notNull().default("info"),
    needsYou: boolean("needs_you").notNull().default(false),
    detail: text("detail"),
    coriNotes: jsonb("cori_notes").$type<unknown>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: archivedAt(),
  },
  (t) => ({
    byCustomer: index("quotes_customer_idx").on(t.customerId),
    byStatus: index("quotes_status_idx").on(t.tenantId, t.status),
  }),
);

// ─────────────────────────── Team members (your staff) ───────────────────────────
export const teamMembers = pgTable(
  "team_members",
  {
    id: pk(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    slug: text("slug"),
    displayName: text("display_name").notNull(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    email: text("email"),
    phone: text("phone"),
    status: teamMemberStatus("status").notNull().default("active"),
    hiredOn: date("hired_on"),
    employmentType: employmentType("employment_type").notNull().default("full-time"),
    skills: jsonb("skills").$type<string[]>().notNull().default([]),
    homeBase: text("home_base"),
    /** Preferred working days, e.g. ["Mon","Tue","Wed"]. */
    preferredDays: jsonb("preferred_days").$type<string[]>().notNull().default([]),
    /** Preferred working hours, free text e.g. "8:00 AM – 4:00 PM". */
    preferredHours: text("preferred_hours"),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: archivedAt(),
  },
  (t) => ({ byTenant: index("team_members_tenant_idx").on(t.tenantId) }),
);

// ───────────────── Partners (sales partners + contracted crews) ─────────────────
export const partners = pgTable(
  "partners",
  {
    id: pk(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    slug: text("slug"),
    displayName: text("display_name").notNull(),
    type: partnerType("type").notNull(),
    stage: partnerStage("stage").notNull().default("prospect"),
    contactName: text("contact_name"),
    email: text("email"),
    phone: text("phone"),
    location: text("location"),
    since: date("since"),
    skills: jsonb("skills").$type<string[]>().notNull().default([]),
    commissionBps: integer("commission_bps"),
    summary: text("summary").notNull().default(""),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: archivedAt(),
  },
  (t) => ({ byTenant: index("partners_tenant_idx").on(t.tenantId) }),
);

// ─────────────────────── Jobs (billable service work) ───────────────────────
export const jobs = pgTable(
  "jobs",
  {
    id: pk(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id),
    planId: uuid("plan_id").references(() => plans.id),
    quoteId: uuid("quote_id").references(() => quotes.id),
    status: jobStatus("status").notNull().default("scheduled"),
    serviceType: serviceType("service_type").notNull(),
    scheduledStart: timestamp("scheduled_start", { withTimezone: true }),
    scheduledEnd: timestamp("scheduled_end", { withTimezone: true }),
    durationMin: integer("duration_min"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    assigneeType: assigneeType("assignee_type"),
    assignedTeamMemberId: uuid("assigned_team_member_id").references(() => teamMembers.id),
    assignedPartnerId: uuid("assigned_partner_id").references(() => partners.id),
    priceCents: integer("price_cents"),
    currency: char("currency", { length: 3 }).notNull().default("USD"),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: archivedAt(),
  },
  (t) => ({
    byCustomer: index("jobs_customer_idx").on(t.customerId),
    byCompleted: index("jobs_completed_idx").on(t.tenantId, t.completedAt),
    byScheduled: index("jobs_scheduled_idx").on(t.tenantId, t.scheduledStart),
    // Exactly one worker, matching the assignee_type (Q10).
    assigneeExclusive: check(
      "jobs_assignee_ck",
      sql`(${t.assigneeType} IS NULL AND ${t.assignedTeamMemberId} IS NULL AND ${t.assignedPartnerId} IS NULL)
          OR (${t.assigneeType} = 'team_member' AND ${t.assignedTeamMemberId} IS NOT NULL AND ${t.assignedPartnerId} IS NULL)
          OR (${t.assigneeType} = 'partner' AND ${t.assignedPartnerId} IS NOT NULL AND ${t.assignedTeamMemberId} IS NULL)`,
    ),
  }),
);

// ─────────────────── Appointments (calendar events; svc + non-svc) ───────────────────
export const appointments = pgTable(
  "appointments",
  {
    id: pk(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    customerId: uuid("customer_id").references(() => customers.id),
    propertyId: uuid("property_id").references(() => properties.id),
    jobId: uuid("job_id").references(() => jobs.id),
    quoteId: uuid("quote_id").references(() => quotes.id),
    kind: appointmentKind("kind").notNull(),
    status: appointmentStatus("status").notNull().default("scheduled"),
    title: text("title").notNull(),
    detail: text("detail"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    durationMin: integer("duration_min"),
    assigneeType: assigneeType("assignee_type"),
    assignedTeamMemberId: uuid("assigned_team_member_id").references(() => teamMembers.id),
    assignedPartnerId: uuid("assigned_partner_id").references(() => partners.id),
    locationOverride: text("location_override"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: archivedAt(),
  },
  (t) => ({
    byStart: index("appointments_start_idx").on(t.tenantId, t.startsAt),
    byCustomer: index("appointments_customer_idx").on(t.customerId),
    assigneeExclusive: check(
      "appointments_assignee_ck",
      sql`(${t.assigneeType} IS NULL AND ${t.assignedTeamMemberId} IS NULL AND ${t.assignedPartnerId} IS NULL)
          OR (${t.assigneeType} = 'team_member' AND ${t.assignedTeamMemberId} IS NOT NULL AND ${t.assignedPartnerId} IS NULL)
          OR (${t.assigneeType} = 'partner' AND ${t.assignedPartnerId} IS NOT NULL AND ${t.assignedTeamMemberId} IS NULL)`,
    ),
  }),
);

// ─────────────── Job reviews (rating/review/note, one per job) ───────────────
export const jobReviews = pgTable(
  "job_reviews",
  {
    id: pk(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    rating: integer("rating"),
    reviewText: text("review_text"),
    customerNote: text("customer_note"),
    reviewer: reviewSource("reviewer").notNull().default("customer"),
    wouldRecommend: boolean("would_recommend"),
    reviewedTeamMemberId: uuid("reviewed_team_member_id").references(() => teamMembers.id),
    reviewedPartnerId: uuid("reviewed_partner_id").references(() => partners.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    onePerJob: uniqueIndex("job_reviews_job_uq").on(t.jobId),
    byCustomer: index("job_reviews_customer_idx").on(t.customerId),
    ratingRange: check(
      "job_reviews_rating_ck",
      sql`${t.rating} IS NULL OR (${t.rating} >= 1 AND ${t.rating} <= 5)`,
    ),
  }),
);

// ───────────── Interactions (logged touchpoints that signal service needs) ─────────────
// A lightweight, chronological log of notable customer touchpoints. `type`
// captures the nature (unplanned / formal meeting / complaint / compliment),
// `method` the channel (call / text / email / DM). Used to spot at-risk
// customers and inform future service/marketing. Optionally tied to the team
// member or partner who handled it.
export const interactions = pgTable(
  "interactions",
  {
    id: pk(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    type: interactionType("type").notNull(),
    method: interactionMethod("method").notNull(),
    note: text("note"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    handledByTeamMemberId: uuid("handled_by_team_member_id").references(() => teamMembers.id),
    handledByPartnerId: uuid("handled_by_partner_id").references(() => partners.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: archivedAt(),
  },
  (t) => ({
    byCustomer: index("interactions_customer_idx").on(t.customerId),
    byOccurred: index("interactions_occurred_idx").on(t.tenantId, t.occurredAt),
  }),
);

// ───────────────── User profiles (editable account fields) ─────────────────
// Keyed by the Cognito `sub` (the stable account id). Holds only the fields a
// user edits on the Settings screen; identity (email, name, role) comes from
// the ID-token claims, not this table. One row per (tenant, sub).
export const userProfiles = pgTable(
  "user_profiles",
  {
    id: pk(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    sub: text("sub").notNull(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    workNumber: text("work_number"),
    mobileNumber: text("mobile_number"),
    preferences: jsonb("preferences").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    bySub: uniqueIndex("user_profiles_tenant_sub_uq").on(t.tenantId, t.sub),
  }),
);

// ───────────────── Notifications (the Notifications center) ─────────────────
// Tenant-scoped inbox items. `type` drives the CTA color in the UI. `read` and
// `saved` are user-toggled. A per-user `sub` column can be added later for a
// personal (vs shared-team) inbox.
export const notificationType = pgEnum("notification_type", [
  "action",
  "success",
  "info",
  "alert",
]);
export const notifications = pgTable(
  "notifications",
  {
    id: pk(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    type: notificationType("type").notNull().default("info"),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    read: boolean("read").notNull().default(false),
    saved: boolean("saved").notNull().default(false),
    ctaLabel: text("cta_label"),
    ctaHref: text("cta_href"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    byTenant: index("notifications_tenant_idx").on(t.tenantId, t.createdAt),
  }),
);

// ─────────────────────────────── Tasks ───────────────────────────────
// A to-do surfaced in "Your priorities". Optionally related to a customer,
// team member, or partner (polymorphic: related_type + related_id). Completing
// a task requires a comment (stored in completion_comment).
export const tasks = pgTable(
  "tasks",
  {
    id: pk(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    title: text("title").notNull(),
    detail: text("detail"),
    status: taskStatus("status").notNull().default("open"),
    bucket: taskBucket("bucket").notNull().default("today"),
    relatedType: taskRelatedType("related_type"),
    relatedId: uuid("related_id"),
    completionComment: text("completion_comment"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: archivedAt(),
  },
  (t) => ({
    byTenant: index("tasks_tenant_idx").on(t.tenantId, t.status),
  }),
);

// ════════════════════════════════════════════════════════════════════════
//  Unified Communications — Twilio SMS
//
//  Implements the Twilio SMS feature spec. The design keeps the message store
//  and preference model provider-neutral so email/voice/social channels can be
//  added later behind the same shared concepts. Twilio-specific identifiers are
//  stored as metadata; core behavior (consent, idempotency, history) does not
//  depend on Twilio fields.
// ════════════════════════════════════════════════════════════════════════

// Channel the message/connection/preference applies to. SMS is the only one
// wired today, but the enum leaves room for the roadmap (email/voice/social).
export const commChannel = pgEnum("comm_channel", ["sms", "email", "voice"]);

// Which integration provider powers a channel connection.
export const commProvider = pgEnum("comm_provider", ["twilio"]);

// Operational state of a channel connection, surfaced in Admin → Integrations.
export const connectionStatus = pgEnum("connection_status", [
  "not_connected",
  "setup_required",
  "connected",
  "action_required",
  "disconnected",
]);

// Purpose-specific SMS categories. Automated notifications map 1:1 to the first
// four; STAFF_CONVERSATION covers staff-authored replies (Phase 2).
export const commPurpose = pgEnum("comm_purpose", [
  "job_scheduled",
  "appointment_reminder",
  "cleaner_en_route",
  "job_completed_review",
  "staff_conversation",
]);

// Direction of a stored message, relative to the business.
export const messageDirection = pgEnum("message_direction", ["inbound", "outbound"]);

// Provider-neutral delivery lifecycle. Twilio statuses map into these; a
// terminal state is never regressed by a stale/out-of-order callback.
export const messageStatus = pgEnum("message_status", [
  "queued",
  "sending",
  "sent",
  "delivered",
  "undelivered",
  "failed",
  "received", // inbound
  "suppressed", // blocked by consent/policy before submission
]);

// Effective consent state for a (customer, purpose). Mirrors the spec taxonomy.
export const commConsentStatus = pgEnum("comm_consent_status", [
  "opted_in",
  "opted_out",
  "unknown",
  "provider_blocked",
]);

// Lifecycle of a scheduled (future-dated) communication, e.g. the 24h reminder.
export const scheduledCommStatus = pgEnum("scheduled_comm_status", [
  "pending",
  "processing",
  "sent",
  "cancelled",
  "suppressed",
  "failed",
]);

// ─────────────── Channel connections (Admin → Integrations) ───────────────
// One active connection per (tenant, provider, channel) for the MVP. The raw
// Twilio Auth Token is NEVER stored here — only a reference to where the secret
// lives (env var name today, Secrets Manager ARN later). Everything in this
// table is safe to return to an admin UI.
export const channelConnections = pgTable(
  "channel_connections",
  {
    id: pk(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    provider: commProvider("provider").notNull().default("twilio"),
    channel: commChannel("channel").notNull().default("sms"),
    status: connectionStatus("status").notNull().default("not_connected"),
    // Twilio Account SID (safe to display, abbreviated in UI).
    accountSid: text("account_sid"),
    // Preferred sender: a Messaging Service SID; fall back to a from-number.
    messagingServiceSid: text("messaging_service_sid"),
    fromNumber: text("from_number"),
    // Reference to the auth credential (env var name / secret ARN), not the value.
    credentialRef: text("credential_ref"),
    // Business-level fields used to render templates / compliance.
    businessName: text("business_name"),
    businessPhone: text("business_phone"),
    reviewUrl: text("review_url"),
    lastValidatedAt: timestamp("last_validated_at", { withTimezone: true }),
    lastInboundAt: timestamp("last_inbound_at", { withTimezone: true }),
    lastCallbackAt: timestamp("last_callback_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    disconnectedAt: timestamp("disconnected_at", { withTimezone: true }),
  },
  (t) => ({
    oneActivePerChannel: uniqueIndex("channel_connections_tenant_provider_channel_uq").on(
      t.tenantId,
      t.provider,
      t.channel,
    ),
  }),
);

// ─────────────── Notification settings (per purpose, per tenant) ───────────────
// Admin toggles each of the four automated notifications on/off and selects the
// template body. Kept intentionally simple (no workflow builder) per the spec.
export const smsNotificationSettings = pgTable(
  "sms_notification_settings",
  {
    id: pk(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    purpose: commPurpose("purpose").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    // Template body with {{handlebars}}-style variables; rendered at send time
    // and the rendered copy is stored on the message for accurate history.
    templateBody: text("template_body").notNull().default(""),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    onePerPurpose: uniqueIndex("sms_notification_settings_tenant_purpose_uq").on(
      t.tenantId,
      t.purpose,
    ),
  }),
);

// ─────────────── Customer communication preferences (consent) ───────────────
// Purpose-specific consent, so a customer can allow reminders but opt out of
// review requests. This layers on top of customer_contacts consent columns and
// is the authoritative per-purpose record checked at dispatch time.
export const customerCommPreferences = pgTable(
  "customer_comm_preferences",
  {
    id: pk(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    // Normalized E.164 target. Nullable so a preference can be customer-wide.
    phoneE164: text("phone_e164"),
    channel: commChannel("channel").notNull().default("sms"),
    purpose: commPurpose("purpose").notNull(),
    status: commConsentStatus("status").notNull().default("unknown"),
    source: text("source"), // web form, staff, inbound keyword, import, …
    capturedAt: timestamp("captured_at", { withTimezone: true }),
    capturedBy: text("captured_by"),
    // Provider-level suppression (e.g. Twilio STOP). Authoritative over UI.
    providerStatus: text("provider_status"),
    providerSyncedAt: timestamp("provider_synced_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    onePerPurpose: uniqueIndex("customer_comm_preferences_uq").on(
      t.tenantId,
      t.customerId,
      t.channel,
      t.purpose,
    ),
    byCustomer: index("customer_comm_preferences_customer_idx").on(t.customerId),
  }),
);

// ─────────────── Conversations (channel-agnostic, Pathways-owned) ───────────────
// The authoritative conversation record. SMS keys a conversation by tenant +
// channel + connection + customer phone; social channels will use the provider
// thread id. Provider identifiers are metadata, never the primary key — so the
// conversation history survives a provider change (ADR-001/002).
export const conversationStatus = pgEnum("conversation_status", [
  "open",
  "pending",
  "closed",
  "archived",
]);
export const conversations = pgTable(
  "conversations",
  {
    id: pk(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    customerId: uuid("customer_id").references(() => customers.id),
    channel: commChannel("channel").notNull().default("sms"),
    channelConnectionId: uuid("channel_connection_id").references(() => channelConnections.id),
    // Deterministic Pathways conversation key (e.g. the customer E.164 for SMS).
    conversationKey: text("conversation_key").notNull(),
    // Provider thread id when the channel exposes one (social channels).
    providerConversationId: text("provider_conversation_id"),
    status: conversationStatus("status").notNull().default("open"),
    assignedUserId: text("assigned_user_id"),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    lastMessagePreview: text("last_message_preview"),
    unreadCount: integer("unread_count").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (t) => ({
    // One conversation per (tenant, channel, connection, key).
    keyUq: uniqueIndex("conversations_key_uq").on(
      t.tenantId,
      t.channel,
      t.channelConnectionId,
      t.conversationKey,
    ),
    byCustomer: index("conversations_customer_idx").on(t.customerId, t.lastMessageAt),
    byTenant: index("conversations_tenant_idx").on(t.tenantId, t.lastMessageAt),
  }),
);

// ─────────────── Conversation participants ───────────────
export const participantType = pgEnum("participant_type", [
  "customer",
  "business",
  "staff",
  "system",
]);
export const conversationParticipants = pgTable(
  "conversation_participants",
  {
    id: pk(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id),
    participantType: participantType("participant_type").notNull(),
    customerId: uuid("customer_id").references(() => customers.id),
    staffUserId: text("staff_user_id"),
    providerUserId: text("provider_user_id"),
    displayName: text("display_name"),
    createdAt: createdAt(),
  },
  (t) => ({
    byConversation: index("conversation_participants_conversation_idx").on(t.conversationId),
  }),
);

// ─────────────── Messages (shared inbound/outbound message store) ───────────────
// One row per SMS, inbound or outbound. Provider SID gives idempotency for
// inbound + status callbacks; idempotencyKey dedupes outbound lifecycle sends.
export const smsMessages = pgTable(
  "sms_messages",
  {
    id: pk(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    conversationId: uuid("conversation_id").references(() => conversations.id),
    customerId: uuid("customer_id").references(() => customers.id),
    jobId: uuid("job_id").references(() => jobs.id),
    channel: commChannel("channel").notNull().default("sms"),
    direction: messageDirection("direction").notNull(),
    purpose: commPurpose("purpose"),
    status: messageStatus("status").notNull(),
    fromNumber: text("from_number"),
    toNumber: text("to_number"),
    body: text("body").notNull().default(""),
    // Provider message SID (Twilio "SM..."). Unique per tenant when present.
    providerSid: text("provider_sid"),
    providerErrorCode: text("provider_error_code"),
    errorDetail: text("error_detail"),
    // Dedupe key for lifecycle-triggered outbound sends (purpose + job + version).
    idempotencyKey: text("idempotency_key"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    byCustomer: index("sms_messages_customer_idx").on(t.customerId, t.createdAt),
    byConversation: index("sms_messages_conversation_idx").on(t.conversationId, t.createdAt),
    byJob: index("sms_messages_job_idx").on(t.jobId),
    providerSidUq: uniqueIndex("sms_messages_provider_sid_uq")
      .on(t.tenantId, t.providerSid)
      .where(sql`${t.providerSid} IS NOT NULL`),
    idempotencyUq: uniqueIndex("sms_messages_idempotency_uq")
      .on(t.tenantId, t.idempotencyKey)
      .where(sql`${t.idempotencyKey} IS NOT NULL`),
  }),
);

// ─────────────── Scheduled communications (future-dated sends) ───────────────
// Backs the 24-hour reminder. A worker claims PENDING rows whose scheduled_for
// has passed, re-checks the job schedule version + consent, and dispatches.
export const scheduledCommunications = pgTable(
  "scheduled_communications",
  {
    id: pk(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    jobId: uuid("job_id").references(() => jobs.id),
    purpose: commPurpose("purpose").notNull(),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    status: scheduledCommStatus("status").notNull().default("pending"),
    idempotencyKey: text("idempotency_key").notNull(),
    // The job schedule "version" captured when scheduled; a worker skips the
    // send if the job's current version no longer matches (rescheduled/cancelled).
    scheduleVersion: text("schedule_version"),
    messageId: uuid("message_id").references(() => smsMessages.id),
    lastError: text("last_error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    byDue: index("scheduled_communications_due_idx").on(t.status, t.scheduledFor),
    idempotencyUq: uniqueIndex("scheduled_communications_idempotency_uq").on(
      t.tenantId,
      t.idempotencyKey,
    ),
  }),
);

// ─────────────── Audit events (integration + comms actions) ───────────────
// A durable, tenant-scoped record of sensitive comms actions (connection
// changes, preference changes, message sends/suppressions). Message bodies are
// not duplicated here; a reference to the message is kept instead.
export const commAuditEvents = pgTable(
  "comm_audit_events",
  {
    id: pk(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    action: text("action").notNull(),
    actor: text("actor"),
    customerId: uuid("customer_id").references(() => customers.id),
    messageId: uuid("message_id").references(() => smsMessages.id),
    detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => ({
    byTenant: index("comm_audit_events_tenant_idx").on(t.tenantId, t.createdAt),
  }),
);
