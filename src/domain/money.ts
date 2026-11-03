import { z } from "zod";

/**
 * Money is stored as integer cents in the DB (design Q7). At the API boundary
 * we expose both the raw cents (for math/sorting on the client) and a
 * preformatted display string (so the UI doesn't re-implement currency rules).
 */
export const Money = z.object({
  cents: z.number().int(),
  currency: z.string().default("USD"),
  display: z.string(),
});
export type Money = z.infer<typeof Money>;

/** Format integer cents as a display string, e.g. 324000 -> "$3,240". */
export function formatMoney(cents: number | null | undefined, currency = "USD"): Money {
  const c = cents ?? 0;
  const whole = c / 100;
  const display = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    // Hide cents when whole (the UI shows "$3,240", not "$3,240.00").
    minimumFractionDigits: Number.isInteger(whole) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(whole);
  return { cents: c, currency, display };
}
