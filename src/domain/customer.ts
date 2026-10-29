import { z } from "zod";

/**
 * Customer domain model. Mirrors the UI's customer record shape, including the
 * Cori-built profile fields (summary, provenance, home details, activity) that
 * are first-class data in this product.
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

export type Customer = z.infer<typeof Customer>;
export type CustomerListItem = z.infer<typeof CustomerListItem>;
export type CustomerStatus = z.infer<typeof CustomerStatus>;
export type CustomerStage = z.infer<typeof CustomerStage>;
