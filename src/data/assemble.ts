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
import type { Contact, Property, Plan, Quote, Job, Review } from "../domain/crm.js";

type CustomerRow = InferSelectModel<typeof schema.customers>;
type ContactRow = InferSelectModel<typeof schema.customerContacts>;
type PropertyRow = InferSelectModel<typeof schema.properties>;
type PlanRow = InferSelectModel<typeof schema.plans>;
type QuoteRow = InferSelectModel<typeof schema.quotes>;
type JobRow = InferSelectModel<typeof schema.jobs>;
type ReviewRow = InferSelectModel<typeof schema.jobReviews>;

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

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
      const workerId = j.assignedCleanerId ?? j.assignedPartnerId ?? null;
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
  };
}
