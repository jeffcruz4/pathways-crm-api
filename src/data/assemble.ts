/**
 * Row → domain assembly + derivation for the 360° customer record.
 *
 * The DB stores normalized facts; the API exposes a presentation-shaped record.
 * These pure helpers map Drizzle rows to the domain contracts and DERIVE the
 * volatile fields (lifetime value, last/next service, plan string, home
 * details, activity) from the related rows (design Q6 — computed on read).
 */
import type { InferSelectModel } from "drizzle-orm";
import * as schema from "../db/schema.js";
import { formatMoney } from "../domain/money.js";
import type { Customer } from "../domain/customer.js";
import type { CustomerStats } from "../domain/customer-stats.js";
import type { SearchGroup, SearchHit, SearchResults } from "../domain/search.js";
import type {
  Contact,
  Property,
  Plan,
  Quote,
  Job,
  Review,
  ServiceOffering,
  Appointment,
  Interaction,
} from "../domain/crm.js";
import type { Partner, PartnerListItem, UpcomingPartnerItem } from "../domain/partner.js";
import type { UserProfile, UserIdentity, UserPreferences } from "../domain/user-profile.js";
import type { Notification, NotificationFilter, NotificationList } from "../domain/notification.js";

type CustomerRow = InferSelectModel<typeof schema.customers>;
type ContactRow = InferSelectModel<typeof schema.customerContacts>;
type PropertyRow = InferSelectModel<typeof schema.properties>;
type PlanRow = InferSelectModel<typeof schema.plans>;
type QuoteRow = InferSelectModel<typeof schema.quotes>;
type JobRow = InferSelectModel<typeof schema.jobs>;
type ReviewRow = InferSelectModel<typeof schema.jobReviews>;
type PartnerRow = InferSelectModel<typeof schema.partners>;
type OfferingRow = InferSelectModel<typeof schema.serviceOfferings>;
type AppointmentRow = InferSelectModel<typeof schema.appointments>;
type TeamMemberRow = InferSelectModel<typeof schema.teamMembers>;
type InteractionRow = InferSelectModel<typeof schema.interactions>;

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

export function mapServiceOffering(r: OfferingRow): ServiceOffering {
  return {
    id: r.id,
    name: r.name,
    serviceType: r.serviceType,
    frequency: r.frequency,
    description: r.description,
    defaultPrice: r.defaultPriceCents == null ? null : formatMoney(r.defaultPriceCents, r.currency),
    isActive: r.isActive,
  };
}

export function mapAppointment(r: AppointmentRow, assigneeName: string | null): Appointment {
  return {
    id: r.id,
    customerId: r.customerId,
    propertyId: r.propertyId,
    jobId: r.jobId,
    quoteId: r.quoteId,
    kind: r.kind,
    status: r.status,
    title: r.title,
    detail: r.detail,
    startsAt: r.startsAt.toISOString(),
    endsAt: iso(r.endsAt),
    durationMin: r.durationMin,
    assigneeType: r.assigneeType,
    assigneeName,
    locationOverride: r.locationOverride,
  };
}

export function mapInteraction(r: InteractionRow, handledBy: string | null): Interaction {
  return {
    id: r.id,
    type: r.type,
    method: r.method,
    note: r.note,
    occurredAt: r.occurredAt.toISOString(),
    handledBy,
  };
}

// ── Partners (rollups leads/jobs/value + related entities derived — design Q6) ──

/** Rollup counts for a partner, computed from referred customers + covered jobs. */
export type PartnerRollups = {
  leadsGenerated: number;
  jobsCovered: number;
  /** Lifetime value in whole dollars (sum of completed covered jobs). */
  value: number;
};

export function partnerListItem(r: PartnerRow, rollups: PartnerRollups): PartnerListItem {
  return {
    id: r.id,
    name: r.displayName,
    contact: r.contactName ?? "",
    location: r.location ?? "",
    type: r.type,
    stage: r.stage,
    leadsGenerated: rollups.leadsGenerated,
    jobsCovered: rollups.jobsCovered,
    value: rollups.value,
  };
}

export function partnerDetail(
  r: PartnerRow,
  rollups: PartnerRollups,
  relatedCustomers: Partner["relatedCustomers"],
  relatedJobs: Partner["relatedJobs"],
): Partner {
  return {
    id: r.id,
    name: r.displayName,
    contact: r.contactName ?? "",
    email: r.email ?? null,
    phone: r.phone ?? null,
    location: r.location ?? "",
    type: r.type,
    stage: r.stage,
    skills: r.skills,
    commissionBps: r.commissionBps ?? null,
    leadsGenerated: rollups.leadsGenerated,
    jobsCovered: rollups.jobsCovered,
    value: rollups.value,
    since: r.since ?? "",
    summary: r.summary,
    notes: r.notes ?? null,
    relatedCustomers,
    relatedJobs,
  };
}

/** Service-type → friendly label for upcoming-item lines. */
const SERVICE_LABEL: Record<string, string> = {
  standard: "Standard clean",
  deep: "Deep clean",
  "move-out": "Move-out clean",
  "move-in": "Move-in clean",
  "post-construction": "Post-construction clean",
};
function serviceLabel(serviceType: string): string {
  return SERVICE_LABEL[serviceType] ?? "Clean";
}

/**
 * Upcoming engagements with partners — future partner-assigned jobs +
 * appointments, merged and sorted soonest-first. Pure: callers pass raw rows
 * plus a partnerId→name map and "now"; unknown partners are skipped.
 */
export function upcomingPartnerItems(
  jobs: JobRow[],
  appointments: AppointmentRow[],
  partnerNameById: Map<string, string>,
  now = new Date(),
): UpcomingPartnerItem[] {
  const items: UpcomingPartnerItem[] = [];

  for (const j of jobs) {
    if (j.assigneeType !== "partner" || !j.assignedPartnerId) continue;
    if (!j.scheduledStart || j.scheduledStart.getTime() < now.getTime()) continue;
    if (j.status === "cancelled" || j.status === "completed" || j.status === "no-show") continue;
    const name = partnerNameById.get(j.assignedPartnerId);
    if (!name) continue;
    items.push({
      id: j.id,
      partnerId: j.assignedPartnerId,
      partnerName: name,
      when: j.scheduledStart.toISOString(),
      label: serviceLabel(j.serviceType),
      source: "job",
    });
  }

  for (const a of appointments) {
    if (a.assigneeType !== "partner" || !a.assignedPartnerId) continue;
    if (!a.startsAt || a.startsAt.getTime() < now.getTime()) continue;
    if (a.status === "cancelled" || a.status === "completed" || a.status === "no-show") continue;
    const name = partnerNameById.get(a.assignedPartnerId);
    if (!name) continue;
    items.push({
      id: a.id,
      partnerId: a.assignedPartnerId,
      partnerName: name,
      when: a.startsAt.toISOString(),
      label: a.detail?.trim() || a.title,
      source: "appointment",
    });
  }

  return items.sort((x, y) => x.when.localeCompare(y.when));
}

// ── User profile (current user; identity from claims + editable DB row) ──

type UserProfileRow = InferSelectModel<typeof schema.userProfiles>;
type TenantRow = InferSelectModel<typeof schema.tenants>;

const DEFAULT_PREFERENCES: UserPreferences = {
  theme: "system",
  emailNotifications: true,
  smsNotifications: false,
  preferredContact: "email",
};

/** Merge stored preference JSON over the defaults (tolerates partial/legacy rows). */
export function mergePreferences(stored: Record<string, unknown> | null | undefined): UserPreferences {
  const s = stored ?? {};
  const pick = <K extends keyof UserPreferences>(k: K): UserPreferences[K] =>
    (s[k] as UserPreferences[K]) ?? DEFAULT_PREFERENCES[k];
  return {
    theme: pick("theme"),
    emailNotifications: pick("emailNotifications"),
    smsNotifications: pick("smsNotifications"),
    preferredContact: pick("preferredContact"),
  };
}

/**
 * Assemble the current user's profile: identity (sub/email/name/role) comes
 * from the ID-token claims, tenancy from the tenant row, and the editable
 * fields from the user_profiles row (may be absent → nulls + defaults).
 */
export function assembleUserProfile(
  identity: UserIdentity,
  tenant: Pick<TenantRow, "id" | "name">,
  row: UserProfileRow | undefined,
): UserProfile {
  return {
    sub: identity.sub,
    email: identity.email,
    name: identity.name,
    role: identity.role,
    tenantId: tenant.id,
    tenantName: tenant.name,
    firstName: row?.firstName ?? null,
    lastName: row?.lastName ?? null,
    workNumber: row?.workNumber ?? null,
    mobileNumber: row?.mobileNumber ?? null,
    preferences: mergePreferences(row?.preferences),
    updatedAt: (row?.updatedAt ?? new Date()).toISOString(),
  };
}

// ── Notifications ──

type NotificationRow = InferSelectModel<typeof schema.notifications>;

export function mapNotification(r: NotificationRow): Notification {
  return {
    id: r.id,
    type: r.type,
    title: r.title,
    body: r.body,
    read: r.read,
    saved: r.saved,
    createdAt: r.createdAt.toISOString(),
    ctaLabel: r.ctaLabel ?? null,
    ctaHref: r.ctaHref ?? null,
  };
}

/**
 * Build the notification list response for a filter. Rows come newest-first;
 * `unreadCount` is always the full-inbox unread total (for the nav badge),
 * independent of the filter.
 */
export function assembleNotificationList(
  rows: NotificationRow[],
  filter: NotificationFilter,
): NotificationList {
  const sorted = [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const unreadCount = sorted.filter((r) => !r.read).length;
  const visible = sorted.filter((r) => {
    if (filter === "unread") return !r.read;
    if (filter === "saved") return r.saved;
    return true;
  });
  return { items: visible.map(mapNotification), unreadCount };
}

export function mapContact(r: ContactRow): Contact {
  return {
    id: r.id,
    kind: r.kind,
    value: r.value,
    label: r.label,
    isPrimary: r.isPrimary,
    consentStatus: r.consentStatus,
  };
}

export function addressLine(r: PropertyRow): string {
  return [r.addressLine1, r.city, r.region].filter(Boolean).join(", ");
}

export function mapProperty(r: PropertyRow): Property {
  return {
    id: r.id,
    label: r.label,
    addressLine1: r.addressLine1,
    addressLine2: r.addressLine2,
    city: r.city,
    region: r.region,
    postalCode: r.postalCode,
    country: r.country,
    propertyType: r.propertyType,
    bedrooms: r.bedrooms,
    bathrooms: r.bathrooms,
    squareFeet: r.squareFeet,
    accessNotes: r.accessNotes,
    isPrimary: r.isPrimary,
    addressLine: addressLine(r),
  };
}

export function mapPlan(r: PlanRow): Plan {
  return {
    id: r.id,
    propertyId: r.propertyId,
    offeringId: r.offeringId,
    name: r.name,
    description: r.description,
    serviceType: r.serviceType,
    frequency: r.frequency,
    status: r.status,
    price: formatMoney(r.priceCents, r.currency),
    startDate: r.startDate,
    endDate: r.endDate,
  };
}

export function mapQuote(r: QuoteRow): Quote {
  return {
    id: r.id,
    propertyId: r.propertyId,
    status: r.status,
    serviceType: r.serviceType,
    frequency: r.frequency,
    amount: formatMoney(r.amountCents, r.currency),
    priceUnit: r.priceUnit,
    validUntil: r.validUntil,
    signal: r.signal,
    needsYou: r.needsYou,
    detail: r.detail,
  };
}

export function mapReview(r: ReviewRow): Review {
  return {
    id: r.id,
    rating: r.rating,
    reviewText: r.reviewText,
    customerNote: r.customerNote,
    reviewer: r.reviewer,
    wouldRecommend: r.wouldRecommend,
  };
}

export function mapJob(r: JobRow, review: ReviewRow | undefined, assigneeName: string | null): Job {
  return {
    id: r.id,
    propertyId: r.propertyId,
    planId: r.planId,
    quoteId: r.quoteId,
    status: r.status,
    serviceType: r.serviceType,
    scheduledStart: iso(r.scheduledStart),
    scheduledEnd: iso(r.scheduledEnd),
    durationMin: r.durationMin,
    completedAt: iso(r.completedAt),
    assigneeType: r.assigneeType,
    assigneeName,
    price: r.priceCents == null ? null : formatMoney(r.priceCents, r.currency),
    notes: r.notes,
    review: review ? mapReview(review) : null,
  };
}

// ── Derivations (Q6) ──

/** A relative "time ago" / "in N days" label for a date, vs. now. */
export function relativeDate(d: Date | null, now = new Date()): string {
  if (!d) return "—";
  const ms = d.getTime() - now.getTime();
  const days = Math.round(ms / 86_400_000);
  const abs = Math.abs(days);
  if (days === 0) return "Today";
  const unit = abs === 1 ? "day" : "days";
  return days < 0 ? `${abs} ${unit} ago` : `in ${abs} ${unit}`;
}

/** Lifetime value = sum of completed jobs' prices. */
export function lifetimeValueCents(jobs: JobRow[]): number {
  return jobs
    .filter((j) => j.status === "completed")
    .reduce((sum, j) => sum + (j.priceCents ?? 0), 0);
}

/** Pick the active plan's display name, or a sensible fallback. */
export function planLabel(plans: PlanRow[]): string {
  const active = plans.find((p) => p.status === "active") ?? plans[0];
  return active ? active.name : "No active plan";
}

/** Home details tiles derived from the primary property. */
export function homeDetailsFrom(property: PropertyRow | undefined): Customer["homeDetails"] {
  if (!property) return [];
  const tiles: Customer["homeDetails"] = [];
  if (property.squareFeet != null)
    tiles.push({ icon: "home", value: String(property.squareFeet), label: "Square feet" });
  if (property.bedrooms != null)
    tiles.push({ icon: "home", value: String(property.bedrooms), label: "Bedrooms" });
  if (property.bathrooms != null)
    tiles.push({ icon: "home", value: String(property.bathrooms), label: "Bathrooms" });
  if (property.propertyType)
    tiles.push({ icon: "home", value: property.propertyType, label: "Type" });
  if (property.accessNotes)
    tiles.push({ icon: "home", value: property.accessNotes, label: "Access" });
  return tiles;
}

export type CustomerBundle = {
  customer: CustomerRow;
  contacts: ContactRow[];
  properties: PropertyRow[];
  plans: PlanRow[];
  quotes: QuoteRow[];
  jobs: JobRow[];
  interactions: InteractionRow[];
  reviewsByJob: Map<string, ReviewRow>;
  workerNameById: Map<string, string>;
};

/** Assemble the full Customer domain object from a bundle of related rows. */
export function assembleCustomer(b: CustomerBundle, now = new Date()): Customer {
  const { customer: c } = b;
  const primaryMobile =
    b.contacts.find((x) => x.isPrimary && x.kind === "mobile") ??
    b.contacts.find((x) => x.kind === "mobile");
  const primaryProperty = b.properties.find((p) => p.isPrimary) ?? b.properties[0];

  const completed = b.jobs
    .filter((j) => j.completedAt)
    .sort((a, z) => (z.completedAt!.getTime() - a.completedAt!.getTime()));
  const upcoming = b.jobs
    .filter((j) => j.scheduledStart && j.scheduledStart.getTime() >= now.getTime())
    .sort((a, z) => a.scheduledStart!.getTime() - z.scheduledStart!.getTime());

  const ltvCents = lifetimeValueCents(b.jobs);

  const jobs = [...b.jobs]
    .sort((a, z) => {
      const ad = (a.completedAt ?? a.scheduledStart)?.getTime() ?? 0;
      const zd = (z.completedAt ?? z.scheduledStart)?.getTime() ?? 0;
      return zd - ad;
    })
    .map((j) => {
      const workerId = j.assignedTeamMemberId ?? j.assignedPartnerId ?? null;
      const name = workerId ? (b.workerNameById.get(workerId) ?? null) : null;
      return mapJob(j, b.reviewsByJob.get(j.id), name);
    });

  return {
    id: c.id,
    name: c.displayName,
    phone: primaryMobile?.value ?? "—",
    location: primaryProperty ? addressLine(primaryProperty) : "—",
    plan: planLabel(b.plans),
    status: c.status,
    stage: c.lifecycleStage,
    lifetimeValue: Math.round(ltvCents / 100),
    lastService: completed[0] ? relativeDate(completed[0].completedAt, now) : "—",
    nextService: upcoming[0]?.scheduledStart
      ? relativeDate(upcoming[0].scheduledStart, now)
      : undefined,
    tags: c.tags,
    summary: c.summary,
    provenance: c.provenance,
    homeDetails: homeDetailsFrom(primaryProperty),
    nextStep: undefined,
    goodToKnow: c.goodToKnow,
    activity: [],

    lifetimeValueMoney: formatMoney(ltvCents),
    contacts: b.contacts.map(mapContact),
    properties: b.properties.map(mapProperty),
    plans: b.plans.map(mapPlan),
    quotes: b.quotes.map(mapQuote),
    jobs,
    interactions: [...b.interactions]
      .filter((i) => !i.archivedAt)
      .sort((a, z) => z.occurredAt.getTime() - a.occurredAt.getTime())
      .map((i) => {
        const wid = i.handledByTeamMemberId ?? i.handledByPartnerId ?? null;
        return mapInteraction(i, wid ? (b.workerNameById.get(wid) ?? null) : null);
      }),
  };
}

// ── Customer dashboard stats (Q6 — computed on read) ──

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Local-time YYYY-MM-DD key for a date (trend buckets are calendar days). */
function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Local-time YYYY-MM key for a date. */
function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Assemble the Customers-screen dashboard stats from customer + job rows.
 * Pure: both repositories pass their rows in and get the same result.
 *   - `signupsTrend`: one point per day for the trailing 90 days (zero-filled).
 *   - `revenueTrend`: one point per month for the trailing 6 months (incl. now),
 *     summing completed jobs' prices by completion month.
 */
export function assembleCustomerStats(
  customers: CustomerRow[],
  jobs: JobRow[],
  now = new Date(),
): CustomerStats {
  const live = customers.filter((c) => !c.archivedAt);

  // ── Status counts ──
  const counts = { total: live.length, active: 0, lead: 0, lapsed: 0 };
  for (const c of live) {
    if (c.status === "active") counts.active++;
    else if (c.status === "lead") counts.lead++;
    else if (c.status === "lapsed") counts.lapsed++;
  }

  // ── Signups trend: trailing 90 days, zero-filled by day ──
  const signupByDay = new Map<string, number>();
  for (const c of live) {
    if (!c.createdAt) continue;
    signupByDay.set(dayKey(c.createdAt), (signupByDay.get(dayKey(c.createdAt)) ?? 0) + 1);
  }
  const signupsTrend: CustomerStats["signupsTrend"] = [];
  for (let i = 89; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = dayKey(d);
    signupsTrend.push({ date: key, count: signupByDay.get(key) ?? 0 });
  }

  // ── Revenue trend: trailing 6 months of completed-job revenue ──
  const liveJobs = jobs.filter((j) => !j.archivedAt);
  const completed = liveJobs.filter((j) => j.status === "completed");
  const revenueByMonth = new Map<string, number>();
  for (const j of completed) {
    if (!j.completedAt) continue;
    const key = monthKey(j.completedAt);
    revenueByMonth.set(key, (revenueByMonth.get(key) ?? 0) + (j.priceCents ?? 0));
  }
  const revenueTrend: CustomerStats["revenueTrend"] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = monthKey(d);
    revenueTrend.push({
      month: key,
      label: MONTH_LABELS[d.getMonth()],
      revenue: formatMoney(revenueByMonth.get(key) ?? 0),
    });
  }

  // ── Lifetime value (all completed) + per-customer average ──
  const ltvCents = completed.reduce((sum, j) => sum + (j.priceCents ?? 0), 0);
  const avgCents = live.length ? Math.round(ltvCents / live.length) : 0;

  // ── Job mix: pending (scheduled/in-progress) vs completed ──
  const pending = liveJobs.filter(
    (j) => j.status === "scheduled" || j.status === "in-progress",
  ).length;

  return {
    counts,
    lifetimeValue: formatMoney(ltvCents),
    averageLifetimeValue: formatMoney(avgCents),
    signupsTrend,
    revenueTrend,
    jobMix: { pending, completed: completed.length },
  };
}

// ── Partner derivations (rollups + related customers/jobs) ──

type PartnerRelations = {
  rollups: PartnerRollups;
  relatedCustomers: Partner["relatedCustomers"];
  relatedJobs: Partner["relatedJobs"];
};

/**
 * Compute a partner's rollups + related entities from the relational rows.
 * Pure: both repositories pass the partner's referred customers, the jobs this
 * partner covered, and a customer-name resolver.
 *
 *   - leadsGenerated = customers whose referredByPartnerId = partner
 *   - jobsCovered    = jobs whose assignedPartnerId = partner
 *   - value          = sum of completed covered jobs' prices (whole dollars)
 *   - relatedCustomers = referred ∪ served (customers of the covered jobs)
 *   - relatedJobs    = the covered jobs, newest first
 */
export function partnerRelations(
  referredCustomers: CustomerRow[],
  coveredJobs: JobRow[],
  customerById: Map<string, CustomerRow>,
): PartnerRelations {
  const valueCents = coveredJobs
    .filter((j) => j.status === "completed")
    .reduce((sum, j) => sum + (j.priceCents ?? 0), 0);

  // Tally jobs-covered per customer (from the covered jobs).
  const jobsByCustomer = new Map<string, number>();
  for (const j of coveredJobs) {
    jobsByCustomer.set(j.customerId, (jobsByCustomer.get(j.customerId) ?? 0) + 1);
  }

  const referredIds = new Set(referredCustomers.map((c) => c.id));
  const servedIds = new Set(coveredJobs.map((j) => j.customerId));
  const allIds = new Set<string>([...referredIds, ...servedIds]);

  const relatedCustomers: Partner["relatedCustomers"] = [];
  for (const id of allIds) {
    const c = customerById.get(id);
    if (!c) continue;
    const isReferred = referredIds.has(id);
    const isServed = servedIds.has(id);
    relatedCustomers.push({
      id: c.id,
      name: c.displayName,
      relationship: isReferred && isServed ? "both" : isReferred ? "referred" : "served",
      status: c.status,
      jobsCovered: jobsByCustomer.get(id) ?? 0,
    });
  }
  relatedCustomers.sort((a, b) => a.name.localeCompare(b.name));

  const relatedJobs: Partner["relatedJobs"] = [...coveredJobs]
    .sort((a, z) => {
      const ad = (a.completedAt ?? a.scheduledStart)?.getTime() ?? 0;
      const zd = (z.completedAt ?? z.scheduledStart)?.getTime() ?? 0;
      return zd - ad;
    })
    .map((j) => ({
      id: j.id,
      customerName: customerById.get(j.customerId)?.displayName ?? "—",
      serviceType: j.serviceType,
      status: j.status,
      date: iso(j.completedAt ?? j.scheduledStart),
      price: j.priceCents == null ? null : formatMoney(j.priceCents, j.currency),
    }));

  return {
    rollups: {
      leadsGenerated: referredCustomers.length,
      jobsCovered: coveredJobs.length,
      value: Math.round(valueCents / 100),
    },
    relatedCustomers,
    relatedJobs,
  };
}

// ── Global keyword search (all object types) ──

/** Everything the search needs, in raw rows. Both backends supply this. */
export type SearchCorpus = {
  customers: CustomerRow[];
  contacts: ContactRow[];
  partners: PartnerRow[];
  teamMembers: TeamMemberRow[];
  offerings: OfferingRow[];
  properties: PropertyRow[];
  plans: PlanRow[];
  quotes: QuoteRow[];
  jobs: JobRow[];
  appointments: AppointmentRow[];
};

/** Case-insensitive substring test over a set of candidate fields. */
function matchField(q: string, fields: (string | null | undefined)[]): string | null {
  for (const f of fields) {
    if (f && f.toLowerCase().includes(q)) return f;
  }
  return null;
}

const PER_GROUP_LIMIT = 8;
const GROUP_ORDER: { type: SearchGroup["type"]; label: string }[] = [
  { type: "customer", label: "Customers" },
  { type: "partner", label: "Partners" },
  { type: "team-member", label: "Team members" },
  { type: "catalog", label: "Catalog" },
  { type: "job", label: "Jobs" },
  { type: "quote", label: "Quotes" },
  { type: "plan", label: "Service plans" },
  { type: "property", label: "Properties" },
  { type: "appointment", label: "Appointments" },
];

const titleCase = (s: string) => s.replace(/(^|[\s-])\w/g, (m) => m.toUpperCase());

/**
 * Keyword search across every object type. Pure: both repositories pass their
 * rows. Work entities (job/quote/plan/property/appointment) resolve to the
 * customer record they belong to via `href`.
 */
export function searchCorpus(corpus: SearchCorpus, rawQuery: string): SearchResults {
  const q = rawQuery.trim().toLowerCase();
  const query = rawQuery.trim();
  if (q.length === 0) return { query, total: 0, groups: [] };

  const liveCustomers = corpus.customers.filter((c) => !c.archivedAt);
  const customerById = new Map(corpus.customers.map((c) => [c.id, c]));
  const customerName = (id: string) => customerById.get(id)?.displayName ?? "Unknown customer";
  const hits: Record<SearchGroup["type"], SearchHit[]> = {
    customer: [], partner: [], "team-member": [], catalog: [],
    job: [], quote: [], plan: [], property: [], appointment: [],
  };

  // Customers — name, tags, summary; also match on a contact value.
  const contactsByCustomer = new Map<string, ContactRow[]>();
  for (const k of corpus.contacts) {
    const arr = contactsByCustomer.get(k.customerId) ?? [];
    arr.push(k);
    contactsByCustomer.set(k.customerId, arr);
  }
  for (const c of liveCustomers) {
    const m =
      matchField(q, [c.displayName, c.summary, ...c.tags]) ??
      matchField(q, (contactsByCustomer.get(c.id) ?? []).map((k) => k.value));
    if (m) {
      hits.customer.push({
        type: "customer", id: c.id, title: c.displayName,
        subtitle: [titleCase(c.status), ...c.tags.slice(0, 2)].join(" · "),
        href: `/customers/${c.id}`, matchedOn: m,
      });
    }
  }

  // Partners — name, contact, location, skills, summary.
  for (const p of corpus.partners.filter((x) => !x.archivedAt)) {
    const m = matchField(q, [p.displayName, p.contactName, p.location, p.summary, ...p.skills]);
    if (m) {
      hits.partner.push({
        type: "partner", id: p.id, title: p.displayName,
        subtitle: [titleCase(p.type), p.location].filter(Boolean).join(" · "),
        href: `/partners/${p.id}`, matchedOn: m,
      });
    }
  }

  // Team members — name, email, home base, skills.
  for (const t of corpus.teamMembers.filter((x) => !x.archivedAt)) {
    const m = matchField(q, [t.displayName, t.email, t.homeBase, ...t.skills]);
    if (m) {
      hits["team-member"].push({
        type: "team-member", id: t.id, title: t.displayName,
        subtitle: [titleCase(t.employmentType), t.homeBase].filter(Boolean).join(" · "),
        href: `/team`, matchedOn: m,
      });
    }
  }

  // Catalog (service offerings) — name, description, service type.
  for (const o of corpus.offerings.filter((x) => !x.archivedAt)) {
    const m = matchField(q, [o.name, o.description, o.serviceType, o.frequency]);
    if (m) {
      hits.catalog.push({
        type: "catalog", id: o.id, title: o.name,
        subtitle: [titleCase(o.serviceType), o.frequency, o.defaultPriceCents != null ? formatMoney(o.defaultPriceCents, o.currency).display : null]
          .filter(Boolean).join(" · "),
        href: `/catalog`, matchedOn: m,
      });
    }
  }

  // Jobs — service type, status, notes; resolve to the customer record.
  for (const j of corpus.jobs.filter((x) => !x.archivedAt)) {
    const name = customerName(j.customerId);
    const m = matchField(q, [j.serviceType, j.status, j.notes, name]);
    if (m) {
      hits.job.push({
        type: "job", id: j.customerId, title: `${titleCase(j.serviceType)} · ${name}`,
        subtitle: [titleCase(j.status), j.priceCents != null ? formatMoney(j.priceCents, j.currency).display : null]
          .filter(Boolean).join(" · "),
        href: `/customers/${j.customerId}`, matchedOn: m,
      });
    }
  }

  // Quotes — detail, service type, status; resolve to the customer record.
  for (const qu of corpus.quotes.filter((x) => !x.archivedAt)) {
    const name = customerName(qu.customerId);
    const m = matchField(q, [qu.detail, qu.serviceType, qu.status, name]);
    if (m) {
      hits.quote.push({
        type: "quote", id: qu.customerId, title: qu.detail ?? `${titleCase(qu.serviceType)} quote`,
        subtitle: [name, titleCase(qu.status), formatMoney(qu.amountCents, qu.currency).display].join(" · "),
        href: `/customers/${qu.customerId}`, matchedOn: m,
      });
    }
  }

  // Plans — name, service type; resolve to the customer record.
  for (const pl of corpus.plans.filter((x) => !x.archivedAt)) {
    const name = customerName(pl.customerId);
    const m = matchField(q, [pl.name, pl.description, pl.serviceType, pl.frequency, name]);
    if (m) {
      hits.plan.push({
        type: "plan", id: pl.customerId, title: pl.name,
        subtitle: [name, titleCase(pl.frequency), formatMoney(pl.priceCents, pl.currency).display].join(" · "),
        href: `/customers/${pl.customerId}`, matchedOn: m,
      });
    }
  }

  // Properties — address parts; resolve to the customer record.
  for (const pr of corpus.properties.filter((x) => !x.archivedAt)) {
    const name = customerName(pr.customerId);
    const m = matchField(q, [pr.addressLine1, pr.city, pr.region, pr.postalCode, pr.label, name]);
    if (m) {
      hits.property.push({
        type: "property", id: pr.customerId, title: addressLine(pr),
        subtitle: [name, pr.label].filter(Boolean).join(" · ") || name,
        href: `/customers/${pr.customerId}`, matchedOn: m,
      });
    }
  }

  // Appointments — title, detail, kind; resolve to the customer record if any.
  for (const a of corpus.appointments.filter((x) => !x.archivedAt)) {
    const name = a.customerId ? customerName(a.customerId) : null;
    const m = matchField(q, [a.title, a.detail, a.kind, name]);
    if (m) {
      hits.appointment.push({
        type: "appointment", id: a.customerId ?? a.id, title: a.title,
        subtitle: [titleCase(a.kind.replace("-", " ")), name].filter(Boolean).join(" · "),
        href: a.customerId ? `/customers/${a.customerId}` : `/calendar`, matchedOn: m,
      });
    }
  }

  const groups: SearchGroup[] = [];
  let total = 0;
  for (const g of GROUP_ORDER) {
    const list = hits[g.type];
    if (list.length === 0) continue;
    total += list.length;
    groups.push({ type: g.type, label: g.label, hits: list.slice(0, PER_GROUP_LIMIT) });
  }
  return { query, total, groups };
}

// ── Team member rollups + spotlight (review → job → team member) ──

type ReviewRowT = ReviewRow;

/** Mean of ratings (1–5) rounded to 1 decimal; null when there are none. */
function meanRating(ratings: number[]): number | null {
  if (ratings.length === 0) return null;
  const m = ratings.reduce((s, n) => s + n, 0) / ratings.length;
  return Math.round(m * 10) / 10;
}

/**
 * Per-team-member rollups: jobs completed, review count, and average rating.
 * A review belongs to a team member through its job (job.assignedTeamMemberId);
 * the review's own reviewedTeamMemberId is honored too (set at write time).
 */
export function teamMemberRollups(
  teamMemberId: string,
  jobs: JobRow[],
  reviews: ReviewRowT[],
): { jobsCompleted: number; reviewCount: number; avgRating: number | null } {
  const mine = jobs.filter((j) => !j.archivedAt && j.assignedTeamMemberId === teamMemberId);
  const myJobIds = new Set(mine.map((j) => j.id));
  const myReviews = reviews.filter(
    (r) => myJobIds.has(r.jobId) || r.reviewedTeamMemberId === teamMemberId,
  );
  return {
    jobsCompleted: mine.filter((j) => j.status === "completed").length,
    reviewCount: myReviews.length,
    avgRating: meanRating(myReviews.map((r) => r.rating).filter((n): n is number => n != null)),
  };
}

/**
 * Team-screen stats: filter-tab counts + the most recent reviews attributed to
 * team members (review → job → assigned team member), newest first.
 */
export function assembleTeamStats(
  teamMembers: TeamMemberRow[],
  jobs: JobRow[],
  reviews: ReviewRowT[],
  customers: CustomerRow[],
  limit = 6,
): import("../domain/team-member.js").TeamStats {
  const live = teamMembers.filter((t) => !t.archivedAt);
  const counts = {
    total: live.length,
    active: live.filter((t) => t.status === "active").length,
    onLeave: live.filter((t) => t.status === "on-leave").length,
    inactive: live.filter((t) => t.status === "inactive").length,
  };

  const memberById = new Map(live.map((t) => [t.id, t]));
  const jobById = new Map(jobs.map((j) => [j.id, j]));
  const customerById = new Map(customers.map((c) => [c.id, c]));

  const spotlight: import("../domain/team-member.js").TeamSpotlightReview[] = [];
  for (const r of reviews) {
    const job = jobById.get(r.jobId);
    // Attribute via the job's assigned team member (fall back to the review's own).
    const memberId = job?.assignedTeamMemberId ?? r.reviewedTeamMemberId;
    const member = memberId ? memberById.get(memberId) : undefined;
    if (!member) continue;
    // Spotlight only reviews with something to show.
    if (r.rating == null && !r.reviewText) continue;
    const when = job?.completedAt ?? r.createdAt;
    spotlight.push({
      id: r.id,
      teamMemberId: member.id,
      teamMemberName: member.displayName,
      customerId: r.customerId,
      customerName: customerById.get(r.customerId)?.displayName ?? "Customer",
      rating: r.rating,
      reviewText: r.reviewText,
      serviceType: job?.serviceType ?? "standard",
      date: when.toISOString(),
    });
  }
  spotlight.sort((a, z) => z.date.localeCompare(a.date));
  return { counts, spotlightReviews: spotlight.slice(0, limit) };
}

// ── Partner highlights (producer / rated / revenue) ──

/**
 * Partner highlights for the Partners screen.
 *
 * "Production" = revenue a partner brought in, counted two ways without
 * double-counting: completed jobs the partner covered (contractor work) plus
 * completed jobs for customers they referred (lead-gen). Each job counts once
 * per partner. Total revenue is the de-duplicated union across all partners.
 * "Top rated" is the highest average review rating among partners that cover
 * jobs (contractors), requiring at least one rating.
 */
export function assemblePartnerHighlights(
  partners: PartnerRow[],
  customers: CustomerRow[],
  jobs: JobRow[],
  reviews: ReviewRowT[],
): import("../domain/partner.js").PartnerHighlights {
  const livePartners = partners.filter((p) => !p.archivedAt);
  const completed = jobs.filter((j) => !j.archivedAt && j.status === "completed");
  const jobById = new Map(jobs.map((j) => [j.id, j]));

  const production = new Map<string, number>(); // partnerId → cents
  const revenueJobCents = new Map<string, number>(); // jobId → cents (de-duped union for the total)

  for (const p of livePartners) {
    const referredIds = new Set(customers.filter((c) => c.referredByPartnerId === p.id).map((c) => c.id));
    const credited = new Map<string, number>(); // jobId → cents, de-duped per partner
    for (const j of completed) {
      if (j.assignedPartnerId === p.id || referredIds.has(j.customerId)) {
        credited.set(j.id, j.priceCents ?? 0);
      }
    }
    let cents = 0;
    for (const [jobId, c] of credited) {
      cents += c;
      revenueJobCents.set(jobId, c);
    }
    production.set(p.id, cents);
  }

  const totalCents = Array.from(revenueJobCents.values()).reduce((s, c) => s + c, 0);

  // Top producer: highest production > 0.
  let topProducer: import("../domain/partner.js").PartnerSpotlight | null = null;
  let bestCents = 0;
  for (const p of livePartners) {
    const cents = production.get(p.id) ?? 0;
    if (cents > bestCents) {
      bestCents = cents;
      topProducer = {
        id: p.id,
        name: p.displayName,
        type: p.type,
        metric: formatMoney(cents).display,
        metricLabel: "Revenue brought in",
      };
    }
  }

  // Top rated: avg rating of reviews on jobs a partner covered (contractors).
  let topRated: import("../domain/partner.js").PartnerSpotlight | null = null;
  let bestAvg = -1;
  let bestCount = 0;
  for (const p of livePartners) {
    if (p.type === "lead-gen") continue; // contractors only
    const ratings = reviews
      .filter((r) => {
        const job = jobById.get(r.jobId);
        return (job?.assignedPartnerId ?? r.reviewedPartnerId) === p.id && r.rating != null;
      })
      .map((r) => r.rating as number);
    const avg = meanRating(ratings);
    if (avg != null && (avg > bestAvg || (avg === bestAvg && ratings.length > bestCount))) {
      bestAvg = avg;
      bestCount = ratings.length;
      topRated = {
        id: p.id,
        name: p.displayName,
        type: p.type,
        metric: avg.toFixed(1),
        metricLabel: `Avg rating · ${ratings.length} review${ratings.length === 1 ? "" : "s"}`,
      };
    }
  }

  return {
    topProducer,
    topRated,
    totalRevenue: formatMoney(totalCents),
    producingPartners: Array.from(production.values()).filter((c) => c > 0).length,
  };
}

// ── Pipeline: stage ⇄ quote-status mapping + stats ──

import type { PipelineStats } from "../domain/deal.js";

/** UI pipeline stages in display order (label + dot come from here). */
export const PIPELINE_STAGES: { id: string; label: string; dot: string }[] = [
  { id: "new", label: "New", dot: "var(--pw-color-text-secondary)" },
  { id: "needs-quote", label: "Needs quote", dot: "var(--pw-color-warning)" },
  { id: "quote-sent", label: "Quote sent", dot: "var(--pw-color-info)" },
  { id: "follow-up", label: "Follow-up", dot: "var(--pw-color-warning)" },
  { id: "booked", label: "Booked", dot: "var(--pw-color-success)" },
];

/** Quote status → the UI stage it lands in. */
export const STATUS_TO_STAGE: Record<string, string> = {
  draft: "new",
  sent: "quote-sent",
  "follow-up": "follow-up",
  accepted: "booked",
  declined: "booked",
  expired: "new",
};

/**
 * UI stage → the quote status set when a card is dragged there. Inverse of
 * STATUS_TO_STAGE, picking a sensible representative status per stage.
 */
export const STAGE_TO_STATUS: Record<string, QuoteRow["status"]> = {
  new: "draft",
  "needs-quote": "draft",
  "quote-sent": "sent",
  "follow-up": "follow-up",
  booked: "accepted",
};

/** A quote is "open" until it's decided (accepted/declined) or expired. */
export function isOpenQuote(q: QuoteRow): boolean {
  return q.status === "draft" || q.status === "sent" || q.status === "follow-up";
}

/** Assemble the pipeline stats (open value, per-stage counts, 90-day new trend). */
export function assemblePipelineStats(quotes: QuoteRow[], now = new Date()): PipelineStats {
  const live = quotes.filter((q) => !q.archivedAt);
  const open = live.filter(isOpenQuote);
  const openCents = open.reduce((sum, q) => sum + (q.amountCents ?? 0), 0);

  const byStageMap = new Map<string, number>();
  for (const s of PIPELINE_STAGES) byStageMap.set(s.id, 0);
  for (const q of live) {
    const stage = STATUS_TO_STAGE[q.status] ?? "new";
    byStageMap.set(stage, (byStageMap.get(stage) ?? 0) + 1);
  }
  const byStage = PIPELINE_STAGES.map((s) => ({
    stageId: s.id as PipelineStats["byStage"][number]["stageId"],
    label: s.label,
    count: byStageMap.get(s.id) ?? 0,
  }));

  // New-opportunity trend: created-at per day, trailing 90 days, zero-filled.
  const byDay = new Map<string, number>();
  for (const q of live) {
    if (!q.createdAt) continue;
    const k = dayKey(q.createdAt);
    byDay.set(k, (byDay.get(k) ?? 0) + 1);
  }
  const newTrend: PipelineStats["newTrend"] = [];
  for (let i = 89; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const k = dayKey(d);
    newTrend.push({ date: k, count: byDay.get(k) ?? 0 });
  }

  return { openValue: formatMoney(openCents), openCount: open.length, byStage, newTrend };
}
