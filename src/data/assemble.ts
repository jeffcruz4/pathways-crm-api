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
import type { Partner, PartnerListItem } from "../domain/partner.js";

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
