/**
 * Safe {{handlebars}}-style template rendering for SMS bodies.
 *
 * Supports dotted variable paths (e.g. {{customer.first_name}}). Missing values
 * render as an empty string rather than throwing, and the set of unresolved
 * variables is returned so callers can decide whether a required variable (like
 * review.url) was absent.
 */

export type TemplateContext = Record<string, unknown>;

const VAR_RE = /\{\{\s*([\w.]+)\s*\}\}/g;

function resolvePath(ctx: TemplateContext, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, ctx);
}

export function renderTemplate(
  template: string,
  ctx: TemplateContext,
): { body: string; missing: string[] } {
  const missing: string[] = [];
  const body = template.replace(VAR_RE, (_match, path: string) => {
    const value = resolvePath(ctx, path);
    if (value === undefined || value === null || value === "") {
      missing.push(path);
      return "";
    }
    return String(value);
  });
  return { body: body.replace(/\s+/g, " ").trim(), missing };
}

/** Default template bodies, used to seed per-tenant notification settings. */
export const DEFAULT_TEMPLATES: Record<string, string> = {
  job_scheduled:
    "Hi {{customer.first_name}}, your {{business.name}} service is scheduled for {{job.date}} at {{job.start_time}}. Questions? Reply here or call {{business.phone}}.",
  appointment_reminder:
    "Reminder from {{business.name}}: your service is scheduled for tomorrow, {{job.date}}, at {{job.start_time}}. Need to make a change? Call {{business.phone}}.",
  cleaner_en_route:
    "Hi {{customer.first_name}}, your {{business.name}} cleaner is on the way. Thank you!",
  job_completed_review:
    "Thanks for choosing {{business.name}}, {{customer.first_name}}! Your service is complete. We'd appreciate your feedback: {{review.url}}",
};
