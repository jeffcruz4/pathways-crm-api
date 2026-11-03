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
