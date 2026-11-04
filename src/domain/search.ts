import { z } from "zod";

/**
 * Global keyword search across every object type. Keyword-only for now
 * (case-insensitive substring match over a few fields per entity); semantic
 * search (pgvector/Bedrock) comes later behind the same contract.
 *
 * Every hit resolves to a navigable record. Work entities that have no
 * standalone route (jobs/quotes/plans/properties/appointments) resolve to the
 * customer record they belong to via `href`.
 */

export const SearchEntityType = z.enum([
  "customer",
  "partner",
  "team-member",
  "catalog",
  "job",
  "quote",
  "plan",
  "property",
  "appointment",
]);
export type SearchEntityType = z.infer<typeof SearchEntityType>;

export const SearchHit = z.object({
  /** Entity type (drives the group header + icon in the UI). */
  type: SearchEntityType,
  /** The entity's own id (customer id for customer-scoped work entities). */
  id: z.string(),
  /** Primary line, e.g. the customer/partner name or offering name. */
  title: z.string(),
  /** Secondary line giving context, e.g. "Move-out · Gina Alvarez · $280". */
  subtitle: z.string(),
  /** In-app route to open when the hit is selected. */
  href: z.string(),
  /** The substring/field that matched (for a subtle "matched on …" hint). */
  matchedOn: z.string().optional(),
});
export type SearchHit = z.infer<typeof SearchHit>;

/** A group of hits of one entity type, in UI display order. */
export const SearchGroup = z.object({
  type: SearchEntityType,
  label: z.string(),
  hits: z.array(SearchHit),
});
export type SearchGroup = z.infer<typeof SearchGroup>;

export const SearchResults = z.object({
  query: z.string(),
  total: z.number().int(),
  groups: z.array(SearchGroup),
});
export type SearchResults = z.infer<typeof SearchResults>;
