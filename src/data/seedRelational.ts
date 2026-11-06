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
type TeamMemberIns = InferInsertModel<typeof schema.teamMembers>;
type PartnerIns = InferInsertModel<typeof schema.partners>;
type InteractionIns = InferInsertModel<typeof schema.interactions>;
type UserProfileIns = InferInsertModel<typeof schema.userProfiles>;
type NotificationIns = InferInsertModel<typeof schema.notifications>;
type TaskIns = InferInsertModel<typeof schema.tasks>;

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
const eid = (n: number) => U("8c09", n); // team member
const nid = (n: number) => U("8c0a", n); // partner

const DAY = 86_400_000;
const now = Date.now();
const daysFromNow = (d: number) => new Date(now + d * DAY);

export const tenant: TenantIns = { id: TENANT, name: "Corvia Cleaning", slug: "corvia" };

// Stable dev identity used before the Cognito pool exists (preview mode). The
// API's /me route falls back to this sub when there's no verified token.
export const DEV_USER_SUB = "dev-user-0001";

export const userProfiles: UserProfileIns[] = [
  {
    id: U("8c0d", 1),
    tenantId: TENANT,
    sub: DEV_USER_SUB,
    firstName: "Joe",
    lastName: "Garrity",
    workNumber: "+18565550100",
    mobileNumber: "+18565550101",
    preferences: { theme: "system", emailNotifications: true, smsNotifications: false, preferredContact: "email" },
  },
];

export const teamMembers: TeamMemberIns[] = [
  { id: eid(1), tenantId: TENANT, slug: "maria-santos", displayName: "Maria Santos", email: "maria@corvia.example", status: "active", employmentType: "full-time", skills: ["standard", "deep"], homeBase: "Swedesboro", preferredDays: ["Mon", "Tue", "Wed", "Thu", "Fri"], preferredHours: "8:00 AM – 4:00 PM" },
  { id: eid(2), tenantId: TENANT, slug: "james-lee", displayName: "James Lee", email: "james@corvia.example", status: "active", employmentType: "full-time", skills: ["standard", "move-out"], homeBase: "Mullica Hill", preferredDays: ["Tue", "Wed", "Thu", "Sat"], preferredHours: "9:00 AM – 5:00 PM" },
];

export const partners: PartnerIns[] = [
  { id: nid(1), tenantId: TENANT, slug: "aj-contractors", displayName: "A&J Contractors", type: "contractor", stage: "active", contactName: "Ana Jimenez", location: "Gloucester County, NJ", skills: ["deep", "move-out"], summary: "Overflow move-out crew, reliable on short notice." },
  { id: nid(2), tenantId: TENANT, slug: "harbor-realty", displayName: "Harbor Realty", type: "lead-gen", stage: "active", contactName: "Dennis Walsh", location: "Mullica Hill, NJ", commissionBps: 1200, summary: "Highest-volume referral partner." },
  { id: nid(3), tenantId: TENANT, slug: "sparkclean-crew", displayName: "SparkClean Crew", type: "contractor", stage: "active", contactName: "Luis Ortega", location: "Woolwich, NJ", skills: ["standard", "deep"], summary: "Detail-oriented crew we send on recurring overflow." },
];

export const serviceOfferings: OfferingIns[] = [
  { id: oid(1), tenantId: TENANT, name: "Standard Weekly Clean", serviceType: "standard", frequency: "weekly", description: "Routine whole-home clean: kitchen, baths, floors, dusting.", defaultPriceCents: 12000 },
  { id: oid(2), tenantId: TENANT, name: "Biweekly Standard", serviceType: "standard", frequency: "biweekly", description: "Every-other-week standard clean.", defaultPriceCents: 24500 },
  { id: oid(3), tenantId: TENANT, name: "Move-out Deep Clean", serviceType: "move-out", frequency: "one-time", description: "Full move-out clean incl. inside appliances, cabinets, baseboards.", defaultPriceCents: 32500 },
];

// ── Customers ──
// `createdAt` is spread across the trailing ~6 months so the signups trend and
// status mix look real on the dashboard. Recent leads cluster in the last 90d.
export const customers: CustomerIns[] = [
  { id: cid(1), tenantId: TENANT, slug: "tom-becker", displayName: "Tom Becker", firstName: "Tom", lastName: "Becker", status: "lead", lifecycleStage: "quote", source: "Inbound call", createdAt: daysFromNow(-2), tags: ["New lead", "Biweekly", "2 dogs"], provenance: "Cori built this profile from a 4m 12s call yesterday at 4:52 PM.", summary: "Tom wants biweekly cleaning for his 2,400 sq ft home — 4 bedrooms, 3 bathrooms, two friendly dogs. He'd like to start with a deep clean, and Thursday afternoons work best.", goodToKnow: ["Two friendly dogs — keep the gate closed", "Works from home, so no key or lockbox", "Wants to start with a deep clean"] },
  { id: cid(2), tenantId: TENANT, slug: "gloria-hynes", displayName: "Gloria Hynes", firstName: "Gloria", lastName: "Hynes", status: "active", lifecycleStage: "recurring", source: "Referral", referredByTeamMemberId: eid(1), createdAt: daysFromNow(-240), tags: ["Active", "Weekly"], provenance: "Profile enriched by Cori across 14 calls and texts.", summary: "Gloria is a weekly standard-clean customer in Swedesboro, with us since March. Reliable, pays on time, prefers morning visits.", goodToKnow: ["Prefers morning visits", "Spare key under the mat (left side)"] },
  { id: cid(3), tenantId: TENANT, slug: "marcus-reed", displayName: "Marcus Reed", status: "active", lifecycleStage: "recurring", createdAt: daysFromNow(-360), tags: ["Active", "Weekly"], summary: "Weekly customer in Mullica Hill, highest lifetime value in the book." },
  { id: cid(4), tenantId: TENANT, slug: "the-porters", displayName: "The Porters", status: "lead", lifecycleStage: "quote", createdAt: daysFromNow(-6), tags: ["Lead", "Biweekly"], summary: "Quote sent for biweekly cleaning; viewed twice, no reply in 6 days." },
  { id: cid(5), tenantId: TENANT, slug: "rachel-owens", displayName: "Rachel Owens", status: "lead", lifecycleStage: "quote", createdAt: daysFromNow(-18), tags: ["Lead", "Move-out"], summary: "Selling her home, needs a move-out clean once she knows her closing date." },
  { id: cid(6), tenantId: TENANT, slug: "dwayne-foster", displayName: "Dwayne Foster", status: "lapsed", lifecycleStage: "recurring", createdAt: daysFromNow(-150), tags: ["Lapsed"], summary: "One-time deep clean customer from the spring; hasn't rebooked." },
  { id: cid(7), tenantId: TENANT, slug: "gina-alvarez", displayName: "Gina Alvarez", status: "active", lifecycleStage: "booked", referredByPartnerId: nid(2), createdAt: daysFromNow(-55), tags: ["Active"], summary: "Move-out clean customer; also sending us neighbor referrals." },
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

// Quotes = the pipeline. `createdAt` is spread across the trailing 90 days so
// the pipeline charts (open value, by-stage, new-over-30/60/90) have real shape.
export const quotes: QuoteIns[] = [
  { id: qid(1), tenantId: TENANT, customerId: cid(1), propertyId: pid(1), status: "draft", serviceType: "deep", frequency: "one-time", amountCents: 79500, priceUnit: "flat", signal: "cori", needsYou: false, detail: "First deep clean, then biweekly", createdAt: daysFromNow(-2), sentAt: null },
  { id: qid(2), tenantId: TENANT, customerId: cid(4), propertyId: pid(4), status: "sent", serviceType: "standard", frequency: "biweekly", amountCents: 22500, priceUnit: "per-visit", signal: "needs-you", needsYou: true, detail: "Biweekly · Mantua", createdAt: daysFromNow(-9), sentAt: daysFromNow(-6), validUntil: "2026-12-01" },
  { id: qid(3), tenantId: TENANT, customerId: cid(5), propertyId: pid(5), status: "follow-up", serviceType: "move-out", frequency: "one-time", amountCents: 32500, priceUnit: "flat", signal: "cori", needsYou: false, detail: "Move-out clean · Glassboro", createdAt: daysFromNow(-5), sentAt: daysFromNow(-3) },
  { id: qid(4), tenantId: TENANT, customerId: cid(7), propertyId: pid(7), status: "accepted", serviceType: "move-out", frequency: "one-time", amountCents: 28000, priceUnit: "flat", signal: "info", needsYou: false, detail: "Move-out clean · Pitman", createdAt: daysFromNow(-12), sentAt: daysFromNow(-10), decidedAt: daysFromNow(-8) },
  // More opportunities spread across the window, across statuses.
  { id: qid(5), tenantId: TENANT, customerId: cid(3), propertyId: pid(3), status: "sent", serviceType: "standard", frequency: "weekly", amountCents: 14000, priceUnit: "per-visit", signal: "info", needsYou: false, detail: "Weekly add-on · Mullica Hill", createdAt: daysFromNow(-18), sentAt: daysFromNow(-16) },
  { id: qid(6), tenantId: TENANT, customerId: cid(6), propertyId: pid(6), status: "declined", serviceType: "deep", frequency: "one-time", amountCents: 41000, priceUnit: "flat", signal: "info", needsYou: false, detail: "Quarterly deep · Sewell", createdAt: daysFromNow(-26), sentAt: daysFromNow(-24), decidedAt: daysFromNow(-20) },
  { id: qid(7), tenantId: TENANT, customerId: cid(1), propertyId: pid(1), status: "draft", serviceType: "standard", frequency: "biweekly", amountCents: 19500, priceUnit: "per-visit", signal: "cori", needsYou: false, detail: "Biweekly maintenance · Swedesboro", createdAt: daysFromNow(-38), sentAt: null },
  { id: qid(8), tenantId: TENANT, customerId: cid(2), propertyId: pid(2), status: "follow-up", serviceType: "deep", frequency: "one-time", amountCents: 36000, priceUnit: "flat", signal: "needs-you", needsYou: true, detail: "Seasonal deep clean · Swedesboro", createdAt: daysFromNow(-47), sentAt: daysFromNow(-44) },
  { id: qid(9), tenantId: TENANT, customerId: cid(5), propertyId: pid(5), status: "accepted", serviceType: "standard", frequency: "weekly", amountCents: 13500, priceUnit: "per-visit", signal: "info", needsYou: false, detail: "Weekly · Glassboro", createdAt: daysFromNow(-62), sentAt: daysFromNow(-60), decidedAt: daysFromNow(-57) },
  { id: qid(10), tenantId: TENANT, customerId: cid(4), propertyId: pid(4), status: "expired", serviceType: "move-out", frequency: "one-time", amountCents: 30000, priceUnit: "flat", signal: "info", needsYou: false, detail: "Move-out · Mantua (old)", createdAt: daysFromNow(-80), sentAt: daysFromNow(-78), validUntil: "2026-09-15" },
  { id: qid(11), tenantId: TENANT, customerId: cid(7), propertyId: pid(7), status: "sent", serviceType: "standard", frequency: "monthly", amountCents: 17000, priceUnit: "per-visit", signal: "cori", needsYou: false, detail: "Monthly upkeep · Pitman", createdAt: daysFromNow(-1), sentAt: daysFromNow(-1) },
];

// Completed jobs are spread across the trailing ~6 months so the revenue trend
// and job-mix charts have real shape. Recurring customers (Gloria weekly,
// Marcus weekly) get a steady cadence; one-offs land in specific months.
export const jobs: JobIns[] = [
  // ── Gloria — recurring weekly standard clean, ~26 weeks of history ──
  { id: jid(1), tenantId: TENANT, customerId: cid(2), propertyId: pid(2), planId: lid(1), status: "completed", serviceType: "standard", scheduledStart: daysFromNow(-7), completedAt: daysFromNow(-7), assigneeType: "team_member", assignedTeamMemberId: eid(1), priceCents: 12000 },
  { id: jid(2), tenantId: TENANT, customerId: cid(2), propertyId: pid(2), planId: lid(1), status: "completed", serviceType: "standard", scheduledStart: daysFromNow(0), completedAt: daysFromNow(0), assigneeType: "team_member", assignedTeamMemberId: eid(1), priceCents: 12000 },
  { id: jid(3), tenantId: TENANT, customerId: cid(2), propertyId: pid(2), planId: lid(1), status: "scheduled", serviceType: "standard", scheduledStart: daysFromNow(7), assigneeType: "team_member", assignedTeamMemberId: eid(1), priceCents: 12000 },
  { id: jid(10), tenantId: TENANT, customerId: cid(2), propertyId: pid(2), planId: lid(1), status: "completed", serviceType: "standard", scheduledStart: daysFromNow(-14), completedAt: daysFromNow(-14), assigneeType: "team_member", assignedTeamMemberId: eid(1), priceCents: 12000 },
  { id: jid(11), tenantId: TENANT, customerId: cid(2), propertyId: pid(2), planId: lid(1), status: "completed", serviceType: "standard", scheduledStart: daysFromNow(-21), completedAt: daysFromNow(-21), assigneeType: "team_member", assignedTeamMemberId: eid(1), priceCents: 12000 },
  { id: jid(12), tenantId: TENANT, customerId: cid(2), propertyId: pid(2), planId: lid(1), status: "completed", serviceType: "standard", scheduledStart: daysFromNow(-35), completedAt: daysFromNow(-35), assigneeType: "team_member", assignedTeamMemberId: eid(1), priceCents: 12000 },
  { id: jid(13), tenantId: TENANT, customerId: cid(2), propertyId: pid(2), planId: lid(1), status: "completed", serviceType: "standard", scheduledStart: daysFromNow(-49), completedAt: daysFromNow(-49), assigneeType: "team_member", assignedTeamMemberId: eid(1), priceCents: 12000 },
  { id: jid(14), tenantId: TENANT, customerId: cid(2), propertyId: pid(2), planId: lid(1), status: "completed", serviceType: "standard", scheduledStart: daysFromNow(-63), completedAt: daysFromNow(-63), assigneeType: "team_member", assignedTeamMemberId: eid(1), priceCents: 12000 },
  { id: jid(15), tenantId: TENANT, customerId: cid(2), propertyId: pid(2), planId: lid(1), status: "completed", serviceType: "standard", scheduledStart: daysFromNow(-84), completedAt: daysFromNow(-84), assigneeType: "team_member", assignedTeamMemberId: eid(1), priceCents: 12000 },
  { id: jid(16), tenantId: TENANT, customerId: cid(2), propertyId: pid(2), planId: lid(1), status: "completed", serviceType: "standard", scheduledStart: daysFromNow(-112), completedAt: daysFromNow(-112), assigneeType: "team_member", assignedTeamMemberId: eid(1), priceCents: 11500 },
  { id: jid(17), tenantId: TENANT, customerId: cid(2), propertyId: pid(2), planId: lid(1), status: "completed", serviceType: "standard", scheduledStart: daysFromNow(-140), completedAt: daysFromNow(-140), assigneeType: "team_member", assignedTeamMemberId: eid(1), priceCents: 11500 },
  { id: jid(18), tenantId: TENANT, customerId: cid(2), propertyId: pid(2), planId: lid(1), status: "completed", serviceType: "standard", scheduledStart: daysFromNow(-168), completedAt: daysFromNow(-168), assigneeType: "team_member", assignedTeamMemberId: eid(1), priceCents: 11500 },
  // ── Marcus — recurring weekly, higher price point ──
  { id: jid(4), tenantId: TENANT, customerId: cid(3), propertyId: pid(3), planId: lid(2), status: "completed", serviceType: "standard", scheduledStart: daysFromNow(-5), completedAt: daysFromNow(-5), assigneeType: "team_member", assignedTeamMemberId: eid(2), priceCents: 14000 },
  { id: jid(5), tenantId: TENANT, customerId: cid(3), propertyId: pid(3), planId: lid(2), status: "scheduled", serviceType: "standard", scheduledStart: daysFromNow(2), assigneeType: "team_member", assignedTeamMemberId: eid(2), priceCents: 14000 },
  { id: jid(20), tenantId: TENANT, customerId: cid(3), propertyId: pid(3), planId: lid(2), status: "completed", serviceType: "standard", scheduledStart: daysFromNow(-19), completedAt: daysFromNow(-19), assigneeType: "team_member", assignedTeamMemberId: eid(2), priceCents: 14000 },
  { id: jid(21), tenantId: TENANT, customerId: cid(3), propertyId: pid(3), planId: lid(2), status: "completed", serviceType: "standard", scheduledStart: daysFromNow(-40), completedAt: daysFromNow(-40), assigneeType: "team_member", assignedTeamMemberId: eid(2), priceCents: 14000 },
  { id: jid(22), tenantId: TENANT, customerId: cid(3), propertyId: pid(3), planId: lid(2), status: "completed", serviceType: "standard", scheduledStart: daysFromNow(-68), completedAt: daysFromNow(-68), assigneeType: "team_member", assignedTeamMemberId: eid(2), priceCents: 14000 },
  { id: jid(23), tenantId: TENANT, customerId: cid(3), propertyId: pid(3), planId: lid(2), status: "completed", serviceType: "standard", scheduledStart: daysFromNow(-96), completedAt: daysFromNow(-96), assigneeType: "team_member", assignedTeamMemberId: eid(2), priceCents: 13500 },
  { id: jid(24), tenantId: TENANT, customerId: cid(3), propertyId: pid(3), planId: lid(2), status: "completed", serviceType: "standard", scheduledStart: daysFromNow(-124), completedAt: daysFromNow(-124), assigneeType: "team_member", assignedTeamMemberId: eid(2), priceCents: 13500 },
  { id: jid(25), tenantId: TENANT, customerId: cid(3), propertyId: pid(3), planId: lid(2), status: "completed", serviceType: "standard", scheduledStart: daysFromNow(-152), completedAt: daysFromNow(-152), assigneeType: "team_member", assignedTeamMemberId: eid(2), priceCents: 13500 },
  // ── Dwayne — one lapsed one-time deep (contractor), ~4 months ago ──
  { id: jid(6), tenantId: TENANT, customerId: cid(6), propertyId: pid(6), status: "completed", serviceType: "deep", scheduledStart: daysFromNow(-120), completedAt: daysFromNow(-120), assigneeType: "partner", assignedPartnerId: nid(1), priceCents: 82000 },
  // ── Gina — accepted move-out, completed + upcoming recurring ──
  { id: jid(7), tenantId: TENANT, customerId: cid(7), propertyId: pid(7), quoteId: qid(4), status: "completed", serviceType: "move-out", scheduledStart: daysFromNow(-7), completedAt: daysFromNow(-7), assigneeType: "partner", assignedPartnerId: nid(1), priceCents: 28000 },
  { id: jid(8), tenantId: TENANT, customerId: cid(7), propertyId: pid(7), status: "scheduled", serviceType: "standard", scheduledStart: daysFromNow(5), assigneeType: "team_member", assignedTeamMemberId: eid(1), priceCents: 13000 },
  { id: jid(26), tenantId: TENANT, customerId: cid(7), propertyId: pid(7), status: "completed", serviceType: "standard", scheduledStart: daysFromNow(-30), completedAt: daysFromNow(-30), assigneeType: "team_member", assignedTeamMemberId: eid(1), priceCents: 13000 },
  // ── SparkClean Crew (contractor) — recurring overflow cleans, well reviewed ──
  { id: jid(30), tenantId: TENANT, customerId: cid(3), propertyId: pid(3), status: "completed", serviceType: "standard", scheduledStart: daysFromNow(-26), completedAt: daysFromNow(-26), assigneeType: "partner", assignedPartnerId: nid(3), priceCents: 14000 },
  { id: jid(31), tenantId: TENANT, customerId: cid(2), propertyId: pid(2), status: "completed", serviceType: "deep", scheduledStart: daysFromNow(-33), completedAt: daysFromNow(-33), assigneeType: "partner", assignedPartnerId: nid(3), priceCents: 21000 },
  { id: jid(32), tenantId: TENANT, customerId: cid(7), propertyId: pid(7), status: "completed", serviceType: "standard", scheduledStart: daysFromNow(-16), completedAt: daysFromNow(-16), assigneeType: "partner", assignedPartnerId: nid(3), priceCents: 13000 },
  // ── Upcoming partner-covered work (powers Partners → "Upcoming") ──
  { id: jid(33), tenantId: TENANT, customerId: cid(3), propertyId: pid(3), status: "scheduled", serviceType: "deep", scheduledStart: daysFromNow(3), assigneeType: "partner", assignedPartnerId: nid(3), priceCents: 21000 },
  { id: jid(34), tenantId: TENANT, customerId: cid(7), propertyId: pid(7), status: "scheduled", serviceType: "move-out", scheduledStart: daysFromNow(6), assigneeType: "partner", assignedPartnerId: nid(1), priceCents: 28000 },
];

export const reviews: ReviewIns[] = [
  { id: rid(1), tenantId: TENANT, jobId: jid(1), customerId: cid(2), rating: 5, reviewText: "Spotless as always, thank you Maria!", reviewer: "customer", wouldRecommend: true, reviewedTeamMemberId: eid(1) },
  { id: rid(2), tenantId: TENANT, jobId: jid(4), customerId: cid(3), rating: 5, reviewText: "Great job, on time.", reviewer: "customer", wouldRecommend: true, reviewedTeamMemberId: eid(2) },
  { id: rid(3), tenantId: TENANT, jobId: jid(7), customerId: cid(7), rating: 4, reviewText: "Move-out clean was thorough.", customerNote: "Ask about recurring", reviewer: "customer", wouldRecommend: true, reviewedPartnerId: nid(1) },
  { id: rid(4), tenantId: TENANT, jobId: jid(6), customerId: cid(6), rating: 3, customerNote: "Hasn't rebooked since; follow up.", reviewer: "staff" },
  // ── Team member reviews (Maria: Gloria's jobs; James: Marcus's jobs) ──
  { id: rid(5), tenantId: TENANT, jobId: jid(10), customerId: cid(2), rating: 5, reviewText: "Maria remembered I like the windows done on Fridays. Little touches like that matter.", reviewer: "customer", wouldRecommend: true, reviewedTeamMemberId: eid(1) },
  { id: rid(6), tenantId: TENANT, jobId: jid(11), customerId: cid(2), rating: 4, reviewText: "Great as always — just missed the top of the fridge this time.", reviewer: "customer", wouldRecommend: true, reviewedTeamMemberId: eid(1) },
  { id: rid(7), tenantId: TENANT, jobId: jid(12), customerId: cid(2), rating: 5, reviewText: "The kitchen has never been so spotless. Thank you!", reviewer: "customer", wouldRecommend: true, reviewedTeamMemberId: eid(1) },
  { id: rid(8), tenantId: TENANT, jobId: jid(20), customerId: cid(3), rating: 5, reviewText: "James is efficient and respectful of our home. Wouldn't trade him.", reviewer: "customer", wouldRecommend: true, reviewedTeamMemberId: eid(2) },
  { id: rid(9), tenantId: TENANT, jobId: jid(21), customerId: cid(3), rating: 4, reviewText: "Solid clean. Arrived a bit later than usual but let us know ahead of time.", reviewer: "customer", wouldRecommend: true, reviewedTeamMemberId: eid(2) },
  { id: rid(10), tenantId: TENANT, jobId: jid(22), customerId: cid(3), rating: 3, reviewText: "Fine overall, though the bathrooms needed a second pass.", reviewer: "customer", wouldRecommend: false, reviewedTeamMemberId: eid(2) },
  { id: rid(11), tenantId: TENANT, jobId: jid(26), customerId: cid(7), rating: 5, reviewText: "Maria did a wonderful job — will book her again.", reviewer: "customer", wouldRecommend: true, reviewedTeamMemberId: eid(1) },
  // ── SparkClean Crew reviews (contractor) ──
  { id: rid(12), tenantId: TENANT, jobId: jid(30), customerId: cid(3), rating: 5, reviewText: "The SparkClean crew was fantastic — thorough and friendly.", reviewer: "customer", wouldRecommend: true, reviewedPartnerId: nid(3) },
  { id: rid(13), tenantId: TENANT, jobId: jid(31), customerId: cid(2), rating: 5, reviewText: "That deep clean was next level. Every corner.", reviewer: "customer", wouldRecommend: true, reviewedPartnerId: nid(3) },
  { id: rid(14), tenantId: TENANT, jobId: jid(32), customerId: cid(7), rating: 4, reviewText: "Very good. Would use them again.", reviewer: "customer", wouldRecommend: true, reviewedPartnerId: nid(3) },
];

// Logged touchpoints — a mix of types/methods that tell a story per customer
// (a complaint that preceded a lapse, compliments from a loyal regular, etc.).
export const interactions: InteractionIns[] = [
  { id: U("8c0c", 1), tenantId: TENANT, customerId: cid(6), type: "complaint", method: "call", note: "Said the baseboards were missed after the deep clean. Offered a re-clean; declined.", occurredAt: daysFromNow(-112), handledByTeamMemberId: eid(1) },
  { id: U("8c0c", 2), tenantId: TENANT, customerId: cid(6), type: "unplanned", method: "text", note: "Asked about pricing for a quarterly clean, then went quiet.", occurredAt: daysFromNow(-70) },
  { id: U("8c0c", 3), tenantId: TENANT, customerId: cid(2), type: "compliment", method: "text", note: "Texted a thank-you after Maria's visit — 'best the house has looked'.", occurredAt: daysFromNow(-6), handledByTeamMemberId: eid(1) },
  { id: U("8c0c", 4), tenantId: TENANT, customerId: cid(2), type: "formal-meeting", method: "call", note: "Quarterly check-in. Interested in adding a seasonal deep clean.", occurredAt: daysFromNow(-40) },
  { id: U("8c0c", 5), tenantId: TENANT, customerId: cid(3), type: "compliment", method: "email", note: "Emailed praise for James's punctuality; asked to keep him as their regular.", occurredAt: daysFromNow(-12), handledByTeamMemberId: eid(2) },
  { id: U("8c0c", 6), tenantId: TENANT, customerId: cid(1), type: "unplanned", method: "call", note: "Inbound call asking about biweekly pricing and dog-friendly products.", occurredAt: daysFromNow(-2) },
  { id: U("8c0c", 7), tenantId: TENANT, customerId: cid(4), type: "unplanned", method: "dm", note: "Messaged on Instagram asking if the quote includes inside-the-oven.", occurredAt: daysFromNow(-4) },
  { id: U("8c0c", 8), tenantId: TENANT, customerId: cid(7), type: "complaint", method: "email", note: "Minor: a contractor arrived 30 min late to the move-out clean. Resolved with a discount.", occurredAt: daysFromNow(-7), handledByPartnerId: nid(1) },
];

export const appointments: InferInsertModel<typeof schema.appointments>[] = [
  { id: U("8c0b", 1), tenantId: TENANT, customerId: cid(2), propertyId: pid(2), jobId: jid(3), kind: "clean", status: "scheduled", title: "Gloria Hynes — weekly clean", detail: "Standard clean", startsAt: daysFromNow(7), durationMin: 120, assigneeType: "team_member", assignedTeamMemberId: eid(1) },
  { id: U("8c0b", 2), tenantId: TENANT, customerId: cid(3), propertyId: pid(3), jobId: jid(5), kind: "clean", status: "scheduled", title: "Marcus Reed — weekly clean", detail: "Standard clean", startsAt: daysFromNow(2), durationMin: 120, assigneeType: "team_member", assignedTeamMemberId: eid(2) },
  { id: U("8c0b", 3), tenantId: TENANT, customerId: cid(1), propertyId: pid(1), quoteId: qid(1), kind: "quote-visit", status: "scheduled", title: "Tom Becker — walkthrough", detail: "Quote visit for deep clean", startsAt: daysFromNow(1), durationMin: 45 },
  // ── Partner sync (powers Partners → "Upcoming") ──
  { id: U("8c0b", 4), tenantId: TENANT, kind: "call", status: "scheduled", title: "SparkClean Crew — sync", detail: "Onboarding check-in", startsAt: daysFromNow(4), durationMin: 30, assigneeType: "partner", assignedPartnerId: nid(3) },
];

// Notifications center inbox. `type` drives the CTA color. A realistic mix of
// action / success / info / alert, newest first, with a couple already read +
// one saved so the filters have something to show.
const nfid = (n: number) => U("8c0e", n);
export const notifications: NotificationIns[] = [
  { id: nfid(1), tenantId: TENANT, type: "action", title: "Quote needs your review", body: "The Porters' biweekly quote has been sitting in 'sent' for 6 days with two views and no reply. Cori suggests a gentle follow-up.", read: false, saved: false, ctaLabel: "Open pipeline", ctaHref: "/pipeline", createdAt: daysFromNow(0) },
  { id: nfid(2), tenantId: TENANT, type: "success", title: "New 5-star review", body: "Gloria Hynes left a 5-star review for Maria Santos: “best the house has looked”.", read: false, saved: true, ctaLabel: "View team", ctaHref: "/team", createdAt: daysFromNow(0) },
  { id: nfid(3), tenantId: TENANT, type: "alert", title: "Complaint logged", body: "A contractor arrived 30 minutes late to Gina Alvarez's move-out clean. Resolved with a discount — worth a personal follow-up.", read: false, saved: false, ctaLabel: "Open customer", ctaHref: "/customers", createdAt: daysFromNow(-1) },
  { id: nfid(4), tenantId: TENANT, type: "info", title: "Cori enriched a profile", body: "Cori built Tom Becker's profile from a 4m 12s call: biweekly cleaning, 2,400 sq ft, two dogs, prefers Thursday afternoons.", read: true, saved: false, ctaLabel: "View customer", ctaHref: "/customers", createdAt: daysFromNow(-2) },
  { id: nfid(5), tenantId: TENANT, type: "action", title: "Partner onboarding check-in", body: "SparkClean Crew's onboarding check-in is coming up in a few days. Confirm the time and scope.", read: false, saved: false, ctaLabel: "View partners", ctaHref: "/partners", createdAt: daysFromNow(-3) },
  { id: nfid(6), tenantId: TENANT, type: "info", title: "Weekly digest ready", body: "11 open quotes, 29 jobs on the schedule, and 3 new leads this week. Tap through for the full breakdown.", read: true, saved: false, ctaLabel: null, ctaHref: null, createdAt: daysFromNow(-5) },
];

// ── Tasks ("Your priorities") ──
const tkid = (n: number) => U("8c0b", n); // task
export const tasks: TaskIns[] = [
  { id: tkid(1), tenantId: TENANT, title: "Call back new caller · (856) 555-0187", detail: "Cori texted them back at 8:14 AM. No reply yet.", status: "open", bucket: "overdue", relatedType: "customer", relatedId: cid(1), createdAt: daysFromNow(-1) },
  { id: tkid(2), tenantId: TENANT, title: "Rachel Owens — move-out clean", detail: "She asked for a call this morning once she knew her closing date.", status: "open", bucket: "today", relatedType: "customer", relatedId: cid(5), createdAt: daysFromNow(0) },
  { id: tkid(3), tenantId: TENANT, title: "The Porters — biweekly cleaning", detail: "Viewed twice, no reply in 6 days.", status: "open", bucket: "overdue", relatedType: "customer", relatedId: cid(4), createdAt: daysFromNow(-2) },
  { id: tkid(4), tenantId: TENANT, title: "Linda Ferraro — inside-fridge request", detail: "“Can you do the inside of the fridge too?”", status: "open", bucket: "today", relatedType: "customer", relatedId: cid(3), createdAt: daysFromNow(0) },
  { id: tkid(5), tenantId: TENANT, title: "Confirm Maria's Thursday schedule", detail: "Check Maria Santos is set for the Swedesboro route.", status: "open", bucket: "upcoming", relatedType: "team-member", relatedId: eid(1), createdAt: daysFromNow(1) },
  { id: tkid(6), tenantId: TENANT, title: "SparkClean Crew onboarding check-in", detail: "Confirm scope + availability for overflow jobs.", status: "open", bucket: "upcoming", relatedType: "partner", relatedId: nid(3), createdAt: daysFromNow(2) },
];
