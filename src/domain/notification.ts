import { z } from "zod";

/**
 * Notification — an item in the user's Notifications center. Notifications are
 * tenant-scoped (shared team inbox for now; a per-user `sub` column can be
 * added later). `type` drives the CTA color in the UI (action/success/info/
 * alert). `read` and `saved` are mutated via PATCH.
 */

export const NotificationType = z.enum(["action", "success", "info", "alert"]);

export const Notification = z.object({
  id: z.string(),
  type: NotificationType,
  title: z.string(),
  /** Short body shown in the inline preview + full read. */
  body: z.string(),
  read: z.boolean(),
  saved: z.boolean(),
  createdAt: z.string(),
  /** Optional call-to-action: label + in-app route. */
  ctaLabel: z.string().nullable(),
  ctaHref: z.string().nullable(),
});

/** Partial update for PATCH /notifications/:id — toggle read / saved. */
export const NotificationUpdate = z.object({
  read: z.boolean().optional(),
  saved: z.boolean().optional(),
});

/** Which slice of the inbox to return. */
export const NotificationFilter = z.enum(["all", "unread", "saved"]);

export const NotificationList = z.object({
  items: z.array(Notification),
  /** Unread count across the whole inbox (for the nav badge). */
  unreadCount: z.number().int(),
});

export type NotificationType = z.infer<typeof NotificationType>;
export type Notification = z.infer<typeof Notification>;
export type NotificationUpdate = z.infer<typeof NotificationUpdate>;
export type NotificationFilter = z.infer<typeof NotificationFilter>;
export type NotificationList = z.infer<typeof NotificationList>;
