import { z } from "zod";
import { Money } from "./money.js";
import {
  Contact,
  Property,
  Plan,
  Quote,
  Job,
  Interaction,
  ContactChannel,
} from "./crm.js";

/**
 * Customer domain model. The customer row holds identity; the richer 360° view
 * (contacts, properties, plans, quotes, jobs+reviews) is assembled from related
 * tables, and the presentation fields the UI already renders (summary, home
 * details, next step, activity, lifetimeValue, last/next service) are DERIVED
 * on read (design Q6) — kept here so existing screens keep working.
 */

export const CustomerStatus = z.enum(["active", "lead", "lapsed"]);
export const CustomerStage = z.enum(["new-lead", "quote", "booked", "recurring"]);

export const HomeDetail = z.object({
  icon: z.string(),
  value: z.string(),
  label: z.string(),
  meta: z.string().optional(),
});

export const ActivityItem = z.object({
  icon: z.enum(["cori", "call"]).optional(),
  text: z.string(),
  time: z.string(),
});

export const NextStep = z.object({
  title: z.string(),
  lineItems: z.array(z.object({ label: z.string(), value: z.string() })),
  cta: z.string(),
});

export const Customer = z.object({
  id: z.string(),
  name: z.string(),
  phone: z.string(),
  location: z.string(),
  plan: z.string(),
  status: CustomerStatus,
  stage: CustomerStage,
  lifetimeValue: z.number(),
  lastService: z.string(),
  nextService: z.string().optional(),
  tags: z.array(z.string()),
  summary: z.string(),
  provenance: z.string(),
  homeDetails: z.array(HomeDetail),
  nextStep: NextStep.optional(),
  goodToKnow: z.array(z.string()),
  activity: z.array(ActivityItem),

  // ── 360° relational collections (assembled from related tables) ──
  lifetimeValueMoney: Money,
  contacts: z.array(Contact),
  properties: z.array(Property),
  plans: z.array(Plan),
  quotes: z.array(Quote),
  jobs: z.array(Job),
  /** Logged touchpoints, newest first. */
  interactions: z.array(Interaction),
});

/** Lightweight shape returned by the list endpoint (no heavy detail fields). */
export const CustomerListItem = Customer.pick({
  id: true,
  name: true,
  location: true,
  plan: true,
  status: true,
  stage: true,
  lifetimeValue: true,
  lastService: true,
  nextService: true,
  tags: true,
});

/** Create-input for POST /customers. Identity + an optional first contact. */
export const CustomerCreate = z.object({
  name: z.string().min(1),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  companyName: z.string().optional(),
  status: CustomerStatus.optional(),
  stage: CustomerStage.optional(),
  preferredContact: ContactChannel.optional(),
  source: z.string().optional(),
  summary: z.string().optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional(),
  // Optional conveniences so a single POST can create a usable customer.
  mobile: z.string().optional(),
  email: z.string().optional(),
});

/** Partial update for PATCH /customers/:id (identity + presentation fields). */
export const CustomerUpdate = z.object({
  name: z.string().min(1).optional(),
  firstName: z.string().nullable().optional(),
  lastName: z.string().nullable().optional(),
  companyName: z.string().nullable().optional(),
  status: CustomerStatus.optional(),
  stage: CustomerStage.optional(),
  preferredContact: ContactChannel.nullable().optional(),
  source: z.string().nullable().optional(),
  summary: z.string().optional(),
  tags: z.array(z.string()).optional(),
  goodToKnow: z.array(z.string()).optional(),
  notes: z.string().nullable().optional(),
});

export type Customer = z.infer<typeof Customer>;
export type CustomerListItem = z.infer<typeof CustomerListItem>;
export type CustomerCreate = z.infer<typeof CustomerCreate>;
export type CustomerUpdate = z.infer<typeof CustomerUpdate>;
export type CustomerStatus = z.infer<typeof CustomerStatus>;
export type CustomerStage = z.infer<typeof CustomerStage>;
