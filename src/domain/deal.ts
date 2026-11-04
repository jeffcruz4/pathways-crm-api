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

// ── Pipeline stats (top-of-page charts) ──
import { Money } from "./money.js";

/** Count of opportunities (quotes) in a given UI stage. */
export const PipelineStageCount = z.object({
  stageId: DealStageId,
  label: z.string(),
  count: z.number().int(),
});

/** One day of new-opportunity creation (for the 30/60/90 toggle). */
export const PipelinePoint = z.object({
  date: z.string(),
  count: z.number().int(),
});

export const PipelineStats = z.object({
  /** Sum of amounts for open quotes (not accepted/declined/expired). */
  openValue: Money,
  openCount: z.number().int(),
  /** Opportunities grouped by stage (for the status chart). */
  byStage: z.array(PipelineStageCount),
  /** New opportunities per day for the trailing 90 days; UI slices to 30/60/90. */
  newTrend: z.array(PipelinePoint),
});

export type Deal = z.infer<typeof Deal>;
export type PipelineStage = z.infer<typeof PipelineStage>;
export type Pipeline = z.infer<typeof Pipeline>;
export type PipelineStats = z.infer<typeof PipelineStats>;
export type PipelineStageCount = z.infer<typeof PipelineStageCount>;
export type PipelinePoint = z.infer<typeof PipelinePoint>;
export type DealSignal = z.infer<typeof DealSignal>;
export type DealStageId = z.infer<typeof DealStageId>;
