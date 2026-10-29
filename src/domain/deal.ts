import { z } from "zod";

/** Pipeline deal model. `signal` drives the UI's Cori/needs-you/info chips. */

export const DealSignal = z.enum(["cori", "needs-you", "info"]);
export const DealStageId = z.enum(["new", "needs-quote", "quote-sent", "follow-up", "booked"]);

export const Deal = z.object({
  id: z.string(),
  stageId: DealStageId,
  name: z.string(),
  price: z.number().optional(),
  priceUnit: z.enum(["visit", "flat"]).optional(),
  detail: z.string(),
  signal: DealSignal,
  chip: z.string(),
  needsYou: z.boolean().optional(),
});

/** A stage with its deals, as returned by the pipeline endpoint. */
export const PipelineStage = z.object({
  id: DealStageId,
  label: z.string(),
  dot: z.string(),
  deals: z.array(Deal),
});

export const Pipeline = z.object({
  summary: z.object({
    openCount: z.number(),
    openValue: z.string(),
    movedByCori: z.number(),
  }),
  stages: z.array(PipelineStage),
});

export type Deal = z.infer<typeof Deal>;
export type PipelineStage = z.infer<typeof PipelineStage>;
export type Pipeline = z.infer<typeof Pipeline>;
export type DealSignal = z.infer<typeof DealSignal>;
export type DealStageId = z.infer<typeof DealStageId>;
