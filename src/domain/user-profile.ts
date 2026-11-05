import { z } from "zod";

/**
 * User profile — the current signed-in user's account record.
 *
 * Identity (sub, email, name, role, tenancy) comes from the auth provider's
 * ID-token claims (Cognito). The EDITABLE fields (first/last name, work +
 * mobile numbers, preferences) are stored server-side keyed by the Cognito
 * `sub`, so they survive across sessions and devices. Until the pool is live,
 * a stable dev `sub` is used (see routes/me.ts).
 */

export const UserRole = z.enum(["Customer", "Partner", "Team Member", "System Admin"]);

/** User-tweakable preferences. Kept small + additive; stored as JSON. */
export const UserPreferences = z.object({
  /** Light / dark / follow the OS. */
  theme: z.enum(["system", "light", "dark"]).default("system"),
  /** Email me about activity Cori and my team flag. */
  emailNotifications: z.boolean().default(true),
  /** Text me for urgent, time-sensitive items. */
  smsNotifications: z.boolean().default(false),
  /** Preferred channel when we reach out. */
  preferredContact: z.enum(["email", "mobile", "work"]).default("email"),
});

export const UserProfile = z.object({
  /** Cognito `sub` — the stable account id. */
  sub: z.string(),
  // ── From claims (read-only in the UI) ──
  email: z.string().nullable(),
  /** Display name from the IdP (full name). */
  name: z.string().nullable(),
  role: UserRole,
  tenantId: z.string(),
  tenantName: z.string(),
  // ── Editable (stored in user_profiles) ──
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  workNumber: z.string().nullable(),
  mobileNumber: z.string().nullable(),
  preferences: UserPreferences,
  updatedAt: z.string(),
});

/** Partial update for PATCH /me — only the editable fields. */
export const UserProfileUpdate = z.object({
  firstName: z.string().nullable().optional(),
  lastName: z.string().nullable().optional(),
  workNumber: z.string().nullable().optional(),
  mobileNumber: z.string().nullable().optional(),
  preferences: UserPreferences.partial().optional(),
});

/** The claim-derived identity the repo needs to assemble a profile. */
export const UserIdentity = z.object({
  sub: z.string(),
  email: z.string().nullable(),
  name: z.string().nullable(),
  role: UserRole,
});

export type UserRole = z.infer<typeof UserRole>;
export type UserPreferences = z.infer<typeof UserPreferences>;
export type UserProfile = z.infer<typeof UserProfile>;
export type UserProfileUpdate = z.infer<typeof UserProfileUpdate>;
export type UserIdentity = z.infer<typeof UserIdentity>;
