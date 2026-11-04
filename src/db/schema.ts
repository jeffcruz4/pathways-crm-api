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
