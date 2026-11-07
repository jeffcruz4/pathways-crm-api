/**
 * Shared template-context builder for job notifications, used by both the
 * lifecycle trigger and the scheduler.
 */
import type { Repository } from "../data/repository.js";
import type { TemplateContext } from "./template.js";
import type { CustomerForNotification, JobForNotification } from "./notifications.js";

function firstName(c: CustomerForNotification): string {
  return c.firstName || c.displayName.split(" ")[0] || "there";
}

export async function buildReminderContext(
  repo: Repository,
  customer: CustomerForNotification,
  job: JobForNotification,
): Promise<TemplateContext> {
  const conn = await repo.comms.getConnection();
  const start = job.scheduledStart ? new Date(job.scheduledStart) : null;
  return {
    customer: { first_name: firstName(customer) },
    business: {
      name: conn?.businessName ?? "Pathways",
      phone: conn?.businessPhone ?? "",
    },
    job: {
      date: start ? start.toLocaleDateString("en-US", { month: "long", day: "numeric" }) : "",
      start_time: start ? start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "",
    },
    review: { url: conn?.reviewUrl ?? "" },
  };
}
