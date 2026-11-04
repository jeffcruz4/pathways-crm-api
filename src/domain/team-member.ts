import { z } from "zod";

/**
 * Team member domain model — your staff who perform jobs.
 * Distinct from Partner (which holds sales partners and 1099 contractors).
 */

export const TeamMemberStatus = z.enum(["active", "inactive", "on-leave"]);
export const EmploymentType = z.enum(["full-time", "part-time"]);

export const TeamMember = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  status: TeamMemberStatus,
  employmentType: EmploymentType,
  hiredOn: z.string().nullable(),
  skills: z.array(z.string()),
  homeBase: z.string().nullable(),
});

export const TeamMemberListItem = TeamMember.pick({
  id: true,
  name: true,
  status: true,
  employmentType: true,
  skills: true,
  homeBase: true,
}).extend({
  // Rollups derived from jobs + reviews (design Q6) so cards/tables can show
  // performance without extra calls.
  jobsCompleted: z.number().int(),
  reviewCount: z.number().int(),
  /** Mean of review ratings (1–5), rounded to 1 decimal; null with no ratings. */
  avgRating: z.number().nullable(),
});

/** A recent review attributed to a team member (review → job → team member). */
export const TeamSpotlightReview = z.object({
  id: z.string(),
  teamMemberId: z.string(),
  teamMemberName: z.string(),
  customerId: z.string(),
  customerName: z.string(),
  rating: z.number().nullable(),
  reviewText: z.string().nullable(),
  serviceType: z.string(),
  /** ISO date of the job's completion (falls back to the review's creation). */
  date: z.string(),
});

/** Per-status counts for the filter tabs. */
export const TeamStatusCounts = z.object({
  total: z.number().int(),
  active: z.number().int(),
  onLeave: z.number().int(),
  inactive: z.number().int(),
});

export const TeamStats = z.object({
  counts: TeamStatusCounts,
  /** Most recent reviews across the team, newest first. */
  spotlightReviews: z.array(TeamSpotlightReview),
});

export const TeamMemberCreate = z.object({
  name: z.string().min(1),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  status: TeamMemberStatus.optional(),
  employmentType: EmploymentType.optional(),
  hiredOn: z.string().optional(),
  skills: z.array(z.string()).optional(),
  homeBase: z.string().optional(),
  notes: z.string().optional(),
});

export type TeamMember = z.infer<typeof TeamMember>;
export type TeamMemberListItem = z.infer<typeof TeamMemberListItem>;
export type TeamMemberCreate = z.infer<typeof TeamMemberCreate>;
export type TeamMemberStatus = z.infer<typeof TeamMemberStatus>;
export type EmploymentType = z.infer<typeof EmploymentType>;
export type TeamSpotlightReview = z.infer<typeof TeamSpotlightReview>;
export type TeamStatusCounts = z.infer<typeof TeamStatusCounts>;
export type TeamStats = z.infer<typeof TeamStats>;
