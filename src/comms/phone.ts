/**
 * Minimal phone-number normalization to E.164 for SMS matching and sending.
 *
 * This is intentionally lightweight (no libphonenumber dependency) and assumes
 * a US/NANP default when no country code is present — adequate for the current
 * single-region use case. Replace with libphonenumber if international support
 * is needed.
 */

/** Normalize a loosely-formatted phone string to E.164, or null if unusable. */
export function toE164(input: string | null | undefined, defaultCountry = "US"): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Already E.164-ish.
  if (/^\+[1-9]\d{6,14}$/.test(trimmed.replace(/[\s()-]/g, ""))) {
    return trimmed.replace(/[\s()-]/g, "");
  }

  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;

  if (defaultCountry === "US") {
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  }
  // Fallback: if it looks like it already carries a country code, prefix "+".
  if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return null;
}

/** Mask a phone number for display, keeping the last 4 digits. */
export function maskPhone(e164: string | null | undefined): string | null {
  if (!e164) return null;
  const last4 = e164.slice(-4);
  return `•••• ${last4}`;
}
