import { z } from "zod";

/**
 * Task domain model — a to-do surfaced in "Your priorities". Optionally related
 * to a customer, team member, or partner. Completing a task requires a comment.
 */

export const TaskStatus = z.enum(["open", "done"]);
export const TaskBucket = z.enum(["today", "overdue", "upcoming"]);
export const TaskRelatedType = z.enum(["customer", "team-member", "partner"]);

/** The related entity, resolved to a display name for the UI. */
export const TaskRelated = z.object({
  type: TaskRelatedType,
  id: z.string(),
  name: z.string(),
});

export const Task = z.object({
  id: z.string(),
  title: z.string(),
  detail: z.string().nullable(),
  status: TaskStatus,
  bucket: TaskBucket,
  related: TaskRelated.nullable(),
  completionComment: z.string().nullable(),
  completedAt: z.string().nullable(),
  createdAt: z.string(),
});

export const TaskCreate = z.object({
  title: z.string().min(1),
  detail: z.string().optional(),
  bucket: TaskBucket.optional(),
  relatedType: TaskRelatedType.optional(),
  relatedId: z.string().optional(),
});

/**
 * Update a task. Completing it (status=done) requires a non-empty
 * completionComment — enforced at the route level so the 400 is explicit.
 */
export const TaskUpdate = z.object({
  title: z.string().min(1).optional(),
  detail: z.string().nullable().optional(),
  status: TaskStatus.optional(),
  bucket: TaskBucket.optional(),
  completionComment: z.string().nullable().optional(),
});

export type Task = z.infer<typeof Task>;
export type TaskRelated = z.infer<typeof TaskRelated>;
export type TaskCreate = z.infer<typeof TaskCreate>;
export type TaskUpdate = z.infer<typeof TaskUpdate>;
export type TaskStatus = z.infer<typeof TaskStatus>;
export type TaskBucket = z.infer<typeof TaskBucket>;
export type TaskRelatedType = z.infer<typeof TaskRelatedType>;
