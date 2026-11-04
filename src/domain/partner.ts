import { z } from "zod";
import { Money } from "./money.js";

/**
 * Partner domain model — referral sources and contractor crews. Deliberately
 * distinct from Customer (different lifecycle + fields).
 *
 * Rollups (leadsGenerated / jobsCovered / value) and the related customers/jobs
 * are DERIVED on read from the relational data (design Q6): a partner "generates
 * a lead" by being a customer's `referredByPartnerId`, and "covers a job" by
 * being a job's `assignedPartnerId`.
 */

export const PartnerType = z.enum(["lead-gen", "contractor", "both"]);
export const PartnerStage = z.enum(["prospect", "vetting", "onboarding", "active", "paused"]);

/** A customer linked to this partner (referred by them and/or served by them). */
export const PartnerCustomer = z.object({
  id: z.string(),
  name: z.string(),
  /** How they're linked: referral, jobs the partner covered, or both. */
  relationship: z.enum(["referred", "served", "both"]),
  status: z.enum(["active", "lead", "lapsed"]),
  jobsCovered: z.number(),
});

/** A job this partner covered (assignee = partner). */
export const PartnerJob = z.object({
  id: z.string(),
  customerName: z.string(),
  serviceType: z.string(),
  status: z.string(),
  date: z.string().nullable(),
  price: Money.nullable(),
});

export const Partner = z.object({
  id: z.string(),
  name: z.string(),
  contact: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  location: z.string(),
  type: PartnerType,
  stage: PartnerStage,
  skills: z.array(z.string()),
  commissionBps: z.number().nullable(),
  leadsGenerated: z.number(),
  jobsCovered: z.number(),
  value: z.number(),
  since: z.string(),
  summary: z.string(),
  notes: z.string().nullable(),
  // ── Related entities (derived) ──
  relatedCustomers: z.array(PartnerCustomer),
  relatedJobs: z.array(PartnerJob),
});

export const PartnerListItem = Partner.pick({
  id: true,
  name: true,
  contact: true,
  location: true,
  type: true,
  stage: true,
  leadsGenerated: true,
  jobsCovered: true,
  value: true,
});

/** Create-input for POST /partners (identity + engagement; rollups derived). */
export const PartnerCreate = z.object({
  name: z.string().min(1),
  type: PartnerType,
  stage: PartnerStage.optional(),
  contactName: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  location: z.string().optional(),
  since: z.string().optional(),
  skills: z.array(z.string()).optional(),
  commissionBps: z.number().int().optional(),
  summary: z.string().optional(),
  notes: z.string().optional(),
});

/** Partial update for PATCH /partners/:id. */
export const PartnerUpdate = z.object({
  name: z.string().min(1).optional(),
  type: PartnerType.optional(),
  stage: PartnerStage.optional(),
  contactName: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  since: z.string().nullable().optional(),
  skills: z.array(z.string()).optional(),
  commissionBps: z.number().int().nullable().optional(),
  summary: z.string().optional(),
  notes: z.string().nullable().optional(),
});

export type Partner = z.infer<typeof Partner>;
export type PartnerCreate = z.infer<typeof PartnerCreate>;
export type PartnerUpdate = z.infer<typeof PartnerUpdate>;
export type PartnerListItem = z.infer<typeof PartnerListItem>;
export type PartnerCustomer = z.infer<typeof PartnerCustomer>;
export type PartnerJob = z.infer<typeof PartnerJob>;
export type PartnerType = z.infer<typeof PartnerType>;
export type PartnerStage = z.infer<typeof PartnerStage>;
