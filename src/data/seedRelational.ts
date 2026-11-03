/**
 * Relational sample dataset — the single source of sample truth for the new
 * schema. Used two ways:
 *   - MemoryRepository builds an in-memory store from it (default backend).
 *   - the Postgres seed script (db:seed) inserts it.
 *
 * Rows use the Drizzle insert-model shape. IDs are fixed UUIDs so the data is
 * stable across re-seeds and cross-referenceable. Money is integer cents.
 */
import type { InferInsertModel } from "drizzle-orm";
import * as schema from "../db/schema.js";

type TenantIns = InferInsertModel<typeof schema.tenants>;
type CustomerIns = InferInsertModel<typeof schema.customers>;
type ContactIns = InferInsertModel<typeof schema.customerContacts>;
type PropertyIns = InferInsertModel<typeof schema.properties>;
type OfferingIns = InferInsertModel<typeof schema.serviceOfferings>;
type PlanIns = InferInsertModel<typeof schema.plans>;
type QuoteIns = InferInsertModel<typeof schema.quotes>;
type JobIns = InferInsertModel<typeof schema.jobs>;
type ReviewIns = InferInsertModel<typeof schema.jobReviews>;
type CleanerIns = InferInsertModel<typeof schema.cleaners>;
type PartnerIns = InferInsertModel<typeof schema.partners>;

// Stable UUIDs. The "entity" segment must be valid hex, so each entity gets a
// hex code in the 3rd group (…-00XX-…) and the row number fills the last group.
const TENANT = "00000000-0000-4000-8000-000000000001";
const U = (code: string, n: number) =>
  `00000000-0000-4000-${code}-${String(n).padStart(12, "0")}`;
// hex entity codes (valid as the UUID variant group): must start 8/9/a/b.
const cid = (n: number) => U("8c01", n); // customer
const kid = (n: number) => U("8c02", n); // contact
const pid = (n: number) => U("8c03", n); // property
const oid = (n: number) => U("8c04", n); // offering
const lid = (n: number) => U("8c05", n); // plan
const qid = (n: number) => U("8c06", n); // quote
const jid = (n: number) => U("8c07", n); // job
const rid = (n: number) => U("8c08", n); // review
const eid = (n: number) => U("8c09", n); // cleaner
const nid = (n: number) => U("8c0a", n); // partner

const DAY = 86_400_000;
const now = Date.now();
const daysFromNow = (d: number) => new Date(now + d * DAY);

export const tenant: TenantIns = { id: TENANT, name: "Corvia Cleaning", slug: "corvia" };

export const cleaners: CleanerIns[] = [
  { id: eid(1), tenantId: TENANT, slug: "maria-santos", displayName: "Maria Santos", email: "maria@corvia.example", status: "active", employmentType: "full-time", skills: ["standard", "deep"], homeBase: "Swedesboro" },
  { id: eid(2), tenantId: TENANT, slug: "james-lee", displayName: "James Lee", email: "james@corvia.example", status: "active", employmentType: "full-time", skills: ["standard", "move-out"], homeBase: "Mullica Hill" },
];

export const partners: PartnerIns[] = [
  { id: nid(1), tenantId: TENANT, slug: "aj-contractors", displayName: "A&J Contractors", type: "contractor", stage: "active", contactName: "Ana Jimenez", location: "Gloucester County, NJ", skills: ["deep", "move-out"], summary: "Overflow move-out crew, reliable on short notice." },
  { id: nid(2), tenantId: TENANT, slug: "harbor-realty", displayName: "Harbor Realty", type: "lead-gen", stage: "active", contactName: "Dennis Walsh", location: "Mullica Hill, NJ", commissionBps: 1200, summary: "Highest-volume referral partner." },
];

export const serviceOfferings: OfferingIns[] = [
  { id: oid(1), tenantId: TENANT, name: "Standard Weekly Clean", serviceType: "standard", frequency: "weekly", description: "Routine whole-home clean: kitchen, baths, floors, dusting.", defaultPriceCents: 12000 },
  { id: oid(2), tenantId: TENANT, name: "Biweekly Standard", serviceType: "standard", frequency: "biweekly", description: "Every-other-week standard clean.", defaultPriceCents: 24500 },
  { id: oid(3), tenantId: TENANT, name: "Move-out Deep Clean", serviceType: "move-out", frequency: "one-time", description: "Full move-out clean incl. inside appliances, cabinets, baseboards.", defaultPriceCents: 32500 },
];

// ── Customers ──
export const customers: CustomerIns[] = [
  { id: cid(1), tenantId: TENANT, slug: "tom-becker", displayName: "Tom Becker", firstName: "Tom", lastName: "Becker", status: "lead", lifecycleStage: "quote", source: "Inbound call", tags: ["New lead", "Biweekly", "2 dogs"], provenance: "Cori built this profile from a 4m 12s call yesterday at 4:52 PM.", summary: "Tom wants biweekly cleaning for his 2,400 sq ft home — 4 bedrooms, 3 bathrooms, two friendly dogs. He'd like to start with a deep clean, and Thursday afternoons work best.", goodToKnow: ["Two friendly dogs — keep the gate closed", "Works from home, so no key or lockbox", "Wants to start with a deep clean"] },
  { id: cid(2), tenantId: TENANT, slug: "gloria-hynes", displayName: "Gloria Hynes", firstName: "Gloria", lastName: "Hynes", status: "active", lifecycleStage: "recurring", source: "Referral", tags: ["Active", "Weekly"], provenance: "Profile enriched by Cori across 14 calls and texts.", summary: "Gloria is a weekly standard-clean customer in Swedesboro, with us since March. Reliable, pays on time, prefers morning visits.", goodToKnow: ["Prefers morning visits", "Spare key under the mat (left side)"] },
  { id: cid(3), tenantId: TENANT, slug: "marcus-reed", displayName: "Marcus Reed", status: "active", lifecycleStage: "recurring", tags: ["Active", "Weekly"], summary: "Weekly customer in Mullica Hill, highest lifetime value in the book." },
  { id: cid(4), tenantId: TENANT, slug: "the-porters", displayName: "The Porters", status: "lead", lifecycleStage: "quote", tags: ["Lead", "Biweekly"], summary: "Quote sent for biweekly cleaning; viewed twice, no reply in 6 days." },
  { id: cid(5), tenantId: TENANT, slug: "rachel-owens", displayName: "Rachel Owens", status: "lead", lifecycleStage: "quote", tags: ["Lead", "Move-out"], summary: "Selling her home, needs a move-out clean once she knows her closing date." },
  { id: cid(6), tenantId: TENANT, slug: "dwayne-foster", displayName: "Dwayne Foster", status: "lapsed", lifecycleStage: "recurring", tags: ["Lapsed"], summary: "One-time deep clean customer from the spring; hasn't rebooked." },
  { id: cid(7), tenantId: TENANT, slug: "gina-alvarez", displayName: "Gina Alvarez", status: "active", lifecycleStage: "booked", referredByPartnerId: nid(2), tags: ["Active"], summary: "Move-out clean customer; also sending us neighbor referrals." },
];

export const contacts: ContactIns[] = [
  { id: kid(1), tenantId: TENANT, customerId: cid(1), kind: "mobile", value: "+18565550187", isPrimary: true, consentStatus: "opted_in", consentSource: "verbal (call)", consentAt: daysFromNow(-1) },
  { id: kid(2), tenantId: TENANT, customerId: cid(1), kind: "email", value: "tom.becker@example.com", isPrimary: true, consentStatus: "unknown" },
  { id: kid(3), tenantId: TENANT, customerId: cid(2), kind: "mobile", value: "+18565550143", isPrimary: true, consentStatus: "opted_in", consentSource: "web form" },
  { id: kid(4), tenantId: TENANT, customerId: cid(3), kind: "mobile", value: "+18565550170", isPrimary: true, consentStatus: "opted_in" },
  { id: kid(5), tenantId: TENANT, customerId: cid(4), kind: "mobile", value: "+18565550199", isPrimary: true, consentStatus: "unknown" },
  { id: kid(6), tenantId: TENANT, customerId: cid(5), kind: "mobile", value: "+18565550142", isPrimary: true, consentStatus: "opted_in" },
  { id: kid(7), tenantId: TENANT, customerId: cid(6), kind: "mobile", value: "+18565550121", isPrimary: true, consentStatus: "opted_out", optOutAt: daysFromNow(-30) },
  { id: kid(8), tenantId: TENANT, customerId: cid(7), kind: "mobile", value: "+18565550188", isPrimary: true, consentStatus: "opted_in" },
];

export const properties: PropertyIns[] = [
  { id: pid(1), tenantId: TENANT, customerId: cid(1), label: "Home", addressLine1: "118 Kings Hwy", city: "Swedesboro", region: "NJ", postalCode: "08085", propertyType: "house", bedrooms: 4, bathrooms: 3, squareFeet: 2400, accessNotes: "Home during visits; two dogs", isPrimary: true },
  { id: pid(2), tenantId: TENANT, customerId: cid(2), label: "Home", addressLine1: "22 Lake St", city: "Swedesboro", region: "NJ", postalCode: "08085", propertyType: "house", bedrooms: 3, bathrooms: 2, squareFeet: 1600, accessNotes: "Spare key under the mat (left side)", isPrimary: true },
  { id: pid(3), tenantId: TENANT, customerId: cid(3), addressLine1: "40 Center Rd", city: "Mullica Hill", region: "NJ", postalCode: "08062", propertyType: "house", bedrooms: 4, bathrooms: 3, isPrimary: true },
  { id: pid(4), tenantId: TENANT, customerId: cid(4), addressLine1: "7 Maple Ave", city: "Mantua", region: "NJ", postalCode: "08051", propertyType: "house", isPrimary: true },
  { id: pid(5), tenantId: TENANT, customerId: cid(5), addressLine1: "15 Pine St", city: "Glassboro", region: "NJ", postalCode: "08028", propertyType: "house", bedrooms: 3, bathrooms: 2, isPrimary: true },
  { id: pid(6), tenantId: TENANT, customerId: cid(6), addressLine1: "9 Oak Ln", city: "Sewell", region: "NJ", postalCode: "08080", propertyType: "house", isPrimary: true },
  { id: pid(7), tenantId: TENANT, customerId: cid(7), addressLine1: "3 Birch Ct", city: "Pitman", region: "NJ", postalCode: "08071", propertyType: "apartment", bedrooms: 2, bathrooms: 1, isPrimary: true },
];

export const plans: PlanIns[] = [
  { id: lid(1), tenantId: TENANT, customerId: cid(2), propertyId: pid(2), offeringId: oid(1), name: "Standard · weekly", description: "Weekly whole-home standard clean, morning visits.", serviceType: "standard", frequency: "weekly", status: "active", priceCents: 12000, startDate: "2026-03-01" },
  { id: lid(2), tenantId: TENANT, customerId: cid(3), propertyId: pid(3), offeringId: oid(1), name: "Weekly", serviceType: "standard", frequency: "weekly", status: "active", priceCents: 14000, startDate: "2025-11-01" },
];

export const quotes: QuoteIns[] = [
  { id: qid(1), tenantId: TENANT, customerId: cid(1), propertyId: pid(1), status: "draft", serviceType: "deep", frequency: "one-time", amountCents: 79500, priceUnit: "flat", signal: "cori", needsYou: false, detail: "First deep clean, then biweekly", sentAt: null },
  { id: qid(2), tenantId: TENANT, customerId: cid(4), propertyId: pid(4), status: "sent", serviceType: "standard", frequency: "biweekly", amountCents: 22500, priceUnit: "per-visit", signal: "needs-you", needsYou: true, detail: "Biweekly · Mantua", sentAt: daysFromNow(-6), validUntil: "2026-12-01" },
  { id: qid(3), tenantId: TENANT, customerId: cid(5), propertyId: pid(5), status: "follow-up", serviceType: "move-out", frequency: "one-time", amountCents: 32500, priceUnit: "flat", signal: "cori", needsYou: false, detail: "Move-out clean · Glassboro", sentAt: daysFromNow(-3) },
  { id: qid(4), tenantId: TENANT, customerId: cid(7), propertyId: pid(7), status: "accepted", serviceType: "move-out", frequency: "one-time", amountCents: 28000, priceUnit: "flat", signal: "info", needsYou: false, detail: "Move-out clean · Pitman", sentAt: daysFromNow(-10), decidedAt: daysFromNow(-8) },
];

export const jobs: JobIns[] = [
  // Gloria — recurring weekly, several completed + one upcoming.
  { id: jid(1), tenantId: TENANT, customerId: cid(2), propertyId: pid(2), planId: lid(1), status: "completed", serviceType: "standard", scheduledStart: daysFromNow(-7), completedAt: daysFromNow(-7), assigneeType: "cleaner", assignedCleanerId: eid(1), priceCents: 12000 },
  { id: jid(2), tenantId: TENANT, customerId: cid(2), propertyId: pid(2), planId: lid(1), status: "completed", serviceType: "standard", scheduledStart: daysFromNow(0), completedAt: daysFromNow(0), assigneeType: "cleaner", assignedCleanerId: eid(1), priceCents: 12000 },
  { id: jid(3), tenantId: TENANT, customerId: cid(2), propertyId: pid(2), planId: lid(1), status: "scheduled", serviceType: "standard", scheduledStart: daysFromNow(7), assigneeType: "cleaner", assignedCleanerId: eid(1), priceCents: 12000 },
  // Marcus — recurring weekly, high LTV.
  { id: jid(4), tenantId: TENANT, customerId: cid(3), propertyId: pid(3), planId: lid(2), status: "completed", serviceType: "standard", scheduledStart: daysFromNow(-5), completedAt: daysFromNow(-5), assigneeType: "cleaner", assignedCleanerId: eid(2), priceCents: 14000 },
  { id: jid(5), tenantId: TENANT, customerId: cid(3), propertyId: pid(3), planId: lid(2), status: "scheduled", serviceType: "standard", scheduledStart: daysFromNow(2), assigneeType: "cleaner", assignedCleanerId: eid(2), priceCents: 14000 },
  // Dwayne — one lapsed one-time deep (contractor).
  { id: jid(6), tenantId: TENANT, customerId: cid(6), propertyId: pid(6), status: "completed", serviceType: "deep", scheduledStart: daysFromNow(-120), completedAt: daysFromNow(-120), assigneeType: "partner", assignedPartnerId: nid(1), priceCents: 82000 },
  // Gina — accepted move-out, booked + completed.
  { id: jid(7), tenantId: TENANT, customerId: cid(7), propertyId: pid(7), quoteId: qid(4), status: "completed", serviceType: "move-out", scheduledStart: daysFromNow(-7), completedAt: daysFromNow(-7), assigneeType: "partner", assignedPartnerId: nid(1), priceCents: 28000 },
  { id: jid(8), tenantId: TENANT, customerId: cid(7), propertyId: pid(7), status: "scheduled", serviceType: "standard", scheduledStart: daysFromNow(5), assigneeType: "cleaner", assignedCleanerId: eid(1), priceCents: 13000 },
];

export const reviews: ReviewIns[] = [
  { id: rid(1), tenantId: TENANT, jobId: jid(1), customerId: cid(2), rating: 5, reviewText: "Spotless as always, thank you Maria!", reviewer: "customer", wouldRecommend: true, reviewedCleanerId: eid(1) },
  { id: rid(2), tenantId: TENANT, jobId: jid(4), customerId: cid(3), rating: 5, reviewText: "Great job, on time.", reviewer: "customer", wouldRecommend: true, reviewedCleanerId: eid(2) },
  { id: rid(3), tenantId: TENANT, jobId: jid(7), customerId: cid(7), rating: 4, reviewText: "Move-out clean was thorough.", customerNote: "Ask about recurring", reviewer: "customer", wouldRecommend: true, reviewedPartnerId: nid(1) },
  { id: rid(4), tenantId: TENANT, jobId: jid(6), customerId: cid(6), rating: 3, customerNote: "Hasn't rebooked since; follow up.", reviewer: "staff" },
];

export const appointments: InferInsertModel<typeof schema.appointments>[] = [
  { id: U("8c0b", 1), tenantId: TENANT, customerId: cid(2), propertyId: pid(2), jobId: jid(3), kind: "clean", status: "scheduled", title: "Gloria Hynes — weekly clean", detail: "Standard clean", startsAt: daysFromNow(7), durationMin: 120, assigneeType: "cleaner", assignedCleanerId: eid(1) },
  { id: U("8c0b", 2), tenantId: TENANT, customerId: cid(3), propertyId: pid(3), jobId: jid(5), kind: "clean", status: "scheduled", title: "Marcus Reed — weekly clean", detail: "Standard clean", startsAt: daysFromNow(2), durationMin: 120, assigneeType: "cleaner", assignedCleanerId: eid(2) },
  { id: U("8c0b", 3), tenantId: TENANT, customerId: cid(1), propertyId: pid(1), quoteId: qid(1), kind: "quote-visit", status: "scheduled", title: "Tom Becker — walkthrough", detail: "Quote visit for deep clean", startsAt: daysFromNow(1), durationMin: 45 },
];
