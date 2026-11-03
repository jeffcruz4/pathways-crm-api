import { z } from "zod";
import { Money } from "./money.js";

/**
 * Aggregate stats for the Customers screen dashboard. Computed on read from
 * customers + jobs (design Q6 — no stored aggregates). Powers:
 *   - filter-tab counts (total + per status)
 *   - new-customers trend (last 90 days, by day)
 *   - status mix pie (active / leads / lapsed)
 *   - revenue trend (last 6 months, from completed jobs)
 *   - job mix (pending vs completed)
 */

/** Per-status customer counts; `total` is the sum (= All tab). */
export const CustomerStatusCounts = z.object({
  total: z.number().int(),
  active: z.number().int(),
  lead: z.number().int(),
  lapsed: z.number().int(),
});
export type CustomerStatusCounts = z.infer<typeof CustomerStatusCounts>;

/** A single day in the signups trend. `date` is an ISO date (YYYY-MM-DD). */
export const SignupPoint = z.object({
  date: z.string(),
  count: z.number().int(),
});
export type SignupPoint = z.infer<typeof SignupPoint>;

/** A single month in the revenue trend. `month` is "YYYY-MM"; `label` is e.g. "May". */
export const RevenuePoint = z.object({
  month: z.string(),
  label: z.string(),
  revenue: Money,
});
export type RevenuePoint = z.infer<typeof RevenuePoint>;

/** Pending (scheduled/in-progress) vs completed job counts. */
export const JobMix = z.object({
  pending: z.number().int(),
  completed: z.number().int(),
});
export type JobMix = z.infer<typeof JobMix>;

export const CustomerStats = z.object({
  counts: CustomerStatusCounts,
  lifetimeValue: Money,
  averageLifetimeValue: Money,
  signupsTrend: z.array(SignupPoint),
  revenueTrend: z.array(RevenuePoint),
  jobMix: JobMix,
});
export type CustomerStats = z.infer<typeof CustomerStats>;
