import { z } from "zod";

/**
 * Cleaner domain model — full-time (W-2) cleaning staff who perform jobs.
 * Distinct from Partner (which holds sales partners and 1099 contractors).
 */

export const CleanerStatus = z.enum(["active", "inactive", "on-leave"]);
export const EmploymentType = z.enum(["full-time", "part-time"]);

export const Cleaner = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  status: CleanerStatus,
  employmentType: EmploymentType,
  hiredOn: z.string().nullable(),
  skills: z.array(z.string()),
  homeBase: z.string().nullable(),
});

export const CleanerListItem = Cleaner.pick({
  id: true,
  name: true,
  status: true,
  employmentType: true,
  skills: true,
  homeBase: true,
});

export const CleanerCreate = z.object({
  name: z.string().min(1),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  status: CleanerStatus.optional(),
  employmentType: EmploymentType.optional(),
  hiredOn: z.string().optional(),
  skills: z.array(z.string()).optional(),
  homeBase: z.string().optional(),
  notes: z.string().optional(),
});

export type Cleaner = z.infer<typeof Cleaner>;
export type CleanerListItem = z.infer<typeof CleanerListItem>;
export type CleanerCreate = z.infer<typeof CleanerCreate>;
export type CleanerStatus = z.infer<typeof CleanerStatus>;
export type EmploymentType = z.infer<typeof EmploymentType>;
