import { z } from "zod";

/**
 * Partner domain model — referral sources and contractor crews. Deliberately
 * distinct from Customer (different lifecycle + fields).
 */

export const PartnerType = z.enum(["lead-gen", "contractor", "both"]);
export const PartnerStage = z.enum(["prospect", "vetting", "onboarding", "active", "paused"]);

export const PartnerActivity = z.object({
  date: z.string(),
  text: z.string(),
});

export const Partner = z.object({
  id: z.string(),
  name: z.string(),
  contact: z.string(),
  location: z.string(),
  type: PartnerType,
  stage: PartnerStage,
  leadsGenerated: z.number(),
  jobsCovered: z.number(),
  value: z.number(),
  since: z.string(),
  summary: z.string(),
  employment: z.object({
    engagement: z.string(),
    rate: z.string(),
    coverage: z.string(),
    insurance: z.string(),
  }),
  activity: z.array(PartnerActivity),
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

export type Partner = z.infer<typeof Partner>;
export type PartnerListItem = z.infer<typeof PartnerListItem>;
export type PartnerType = z.infer<typeof PartnerType>;
export type PartnerStage = z.infer<typeof PartnerStage>;
