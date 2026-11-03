import { z } from "zod";
import { Money } from "./money.js";

/**
 * Relational CRM domain contracts (design: docs/design/customer-data-model.md).
 * These are the API-boundary shapes for the normalized entities that hang off a
 * customer — assembled from the DB tables, with money exposed as {cents,display}
 * and dates as ISO strings. Each entity has an output shape and a create-input
 * shape (the latter used to validate POST bodies).
 */

// ── Enums (mirror the DB pgEnums) ──
export const ServiceType = z.enum(["standard", "deep", "move-out", "one-time"]);
export const PlanFrequency = z.enum(["weekly", "biweekly", "monthly", "one-time"]);
export const PlanStatus = z.enum(["active", "paused", "cancelled"]);
export const QuoteStatus = z.enum(["draft", "sent", "follow-up", "accepted", "declined", "expired"]);
export const PriceUnit = z.enum(["per-visit", "flat"]);
export const QuoteSignal = z.enum(["cori", "needs-you", "info"]);
export const JobStatus = z.enum(["scheduled", "in-progress", "completed", "cancelled", "no-show"]);
export const AssigneeType = z.enum(["cleaner", "partner"]);
export const ContactKind = z.enum(["mobile", "landline", "email"]);
export const ContactChannel = z.enum(["sms", "email", "call"]);
export const ConsentStatus = z.enum(["unknown", "opted_in", "opted_out"]);
export const PropertyType = z.enum(["house", "apartment", "commercial"]);
export const ReviewSource = z.enum(["customer", "staff"]);

// ── Contacts ──
export const Contact = z.object({
  id: z.string(),
  kind: ContactKind,
  value: z.string(),
  label: z.string().nullable(),
  isPrimary: z.boolean(),
  consentStatus: ConsentStatus,
});
export const ContactCreate = z.object({
  kind: ContactKind,
  value: z.string().min(1),
  label: z.string().optional(),
  isPrimary: z.boolean().optional(),
  consentStatus: ConsentStatus.optional(),
  consentSource: z.string().optional(),
});

// ── Properties ──
export const Property = z.object({
  id: z.string(),
  label: z.string().nullable(),
  addressLine1: z.string(),
  addressLine2: z.string().nullable(),
  city: z.string(),
  region: z.string(),
  postalCode: z.string(),
  country: z.string(),
  propertyType: PropertyType.nullable(),
  bedrooms: z.number().nullable(),
  bathrooms: z.number().nullable(),
  squareFeet: z.number().nullable(),
  accessNotes: z.string().nullable(),
  isPrimary: z.boolean(),
  /** One-line address for display. */
  addressLine: z.string(),
});
export const PropertyCreate = z.object({
  label: z.string().optional(),
  addressLine1: z.string().min(1),
  addressLine2: z.string().optional(),
  city: z.string().min(1),
  region: z.string().min(1),
  postalCode: z.string().min(1),
  country: z.string().length(2).optional(),
  propertyType: PropertyType.optional(),
  bedrooms: z.number().int().optional(),
  bathrooms: z.number().int().optional(),
  squareFeet: z.number().int().optional(),
  accessNotes: z.string().optional(),
  isPrimary: z.boolean().optional(),
});

// ── Plans ──
export const Plan = z.object({
  id: z.string(),
  propertyId: z.string(),
  offeringId: z.string().nullable(),
  name: z.string(),
  description: z.string().nullable(),
  serviceType: ServiceType,
  frequency: PlanFrequency,
  status: PlanStatus,
  price: Money,
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
});
export const PlanCreate = z.object({
  propertyId: z.string().min(1),
  offeringId: z.string().optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  serviceType: ServiceType,
  frequency: PlanFrequency,
  status: PlanStatus.optional(),
  priceCents: z.number().int().nonnegative(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

// ── Quotes (= pipeline) ──
export const Quote = z.object({
  id: z.string(),
  propertyId: z.string().nullable(),
  status: QuoteStatus,
  serviceType: ServiceType,
  frequency: PlanFrequency.nullable(),
  amount: Money,
  priceUnit: PriceUnit,
  validUntil: z.string().nullable(),
  signal: QuoteSignal,
  needsYou: z.boolean(),
  detail: z.string().nullable(),
});
export const QuoteCreate = z.object({
  propertyId: z.string().optional(),
  status: QuoteStatus.optional(),
  serviceType: ServiceType,
  frequency: PlanFrequency.optional(),
  amountCents: z.number().int().nonnegative(),
  priceUnit: PriceUnit.optional(),
  validUntil: z.string().optional(),
  signal: QuoteSignal.optional(),
  needsYou: z.boolean().optional(),
  detail: z.string().optional(),
});

// ── Job reviews ──
export const Review = z.object({
  id: z.string(),
  rating: z.number().nullable(),
  reviewText: z.string().nullable(),
  customerNote: z.string().nullable(),
  reviewer: ReviewSource,
  wouldRecommend: z.boolean().nullable(),
});
export const ReviewCreate = z.object({
  rating: z.number().int().min(1).max(5).optional(),
  reviewText: z.string().optional(),
  customerNote: z.string().optional(),
  reviewer: ReviewSource.optional(),
  wouldRecommend: z.boolean().optional(),
});

// ── Jobs (with embedded review + worker label) ──
export const Job = z.object({
  id: z.string(),
  propertyId: z.string(),
  planId: z.string().nullable(),
  quoteId: z.string().nullable(),
  status: JobStatus,
  serviceType: ServiceType,
  scheduledStart: z.string().nullable(),
  scheduledEnd: z.string().nullable(),
  durationMin: z.number().nullable(),
  completedAt: z.string().nullable(),
  assigneeType: AssigneeType.nullable(),
  assigneeName: z.string().nullable(),
  price: Money.nullable(),
  notes: z.string().nullable(),
  review: Review.nullable(),
});
export const JobCreate = z.object({
  propertyId: z.string().min(1),
  planId: z.string().optional(),
  quoteId: z.string().optional(),
  status: JobStatus.optional(),
  serviceType: ServiceType,
  scheduledStart: z.string().optional(),
  scheduledEnd: z.string().optional(),
  durationMin: z.number().int().optional(),
  completedAt: z.string().optional(),
  assigneeType: AssigneeType.optional(),
  assignedCleanerId: z.string().optional(),
  assignedPartnerId: z.string().optional(),
  priceCents: z.number().int().optional(),
  notes: z.string().optional(),
});

export type Contact = z.infer<typeof Contact>;
export type ContactCreate = z.infer<typeof ContactCreate>;
export type Property = z.infer<typeof Property>;
export type PropertyCreate = z.infer<typeof PropertyCreate>;
export type Plan = z.infer<typeof Plan>;
export type PlanCreate = z.infer<typeof PlanCreate>;
export type Quote = z.infer<typeof Quote>;
export type QuoteCreate = z.infer<typeof QuoteCreate>;
export type Review = z.infer<typeof Review>;
export type ReviewCreate = z.infer<typeof ReviewCreate>;
export type Job = z.infer<typeof Job>;
export type JobCreate = z.infer<typeof JobCreate>;
