/**
 * Reminder scheduler — a lightweight in-process interval worker that dispatches
 * due ScheduledCommunications (the 24h appointment reminder).
 *
 * MVP note: this runs inside the single Fastify process on a timer. It is the
 * simplest thing that fits the current single-process deployment. For
 * horizontal scaling / durability guarantees, replace with an external
 * scheduler (EventBridge + queue, a cron-triggered endpoint, etc.) — the
 * claim/mark repository methods are already written to support that.
 */
import type { FastifyBaseLogger } from "fastify";
import type { Repository } from "../data/repository.js";
import type { CommsService } from "./commsService.js";
import type {
  NotificationTrigger,
  CustomerForNotification,
  JobForNotification,
} from "./notifications.js";

export type SchedulerDeps = {
  repo: Repository;
  comms: CommsService;
  trigger: NotificationTrigger;
  logger: FastifyBaseLogger;
  /** Re-resolve a customer for building the message context. */
  getCustomer: (customerId: string) => Promise<CustomerForNotification | undefined>;
  /** Re-resolve the job to verify its schedule version still matches. */
  getJob: (jobId: string) => Promise<JobForNotification | undefined>;
  getCustomerPhone: (customerId: string) => Promise<string | null>;
  intervalMs?: number;
  batchSize?: number;
};

export class ReminderScheduler {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly deps: SchedulerDeps) {}

  start(): void {
    const interval = this.deps.intervalMs ?? 60_000;
    this.timer = setInterval(() => void this.tick(), interval);
    // Don't keep the event loop alive solely for the scheduler.
    this.timer.unref?.();
    this.deps.logger.info({ interval }, "SMS reminder scheduler started");
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Process one batch of due reminders. Exposed for tests / manual trigger. */
  async tick(): Promise<void> {
    if (this.running) return; // avoid overlap
    this.running = true;
    try {
      const due = await this.deps.repo.comms.claimDueScheduled(new Date(), this.deps.batchSize ?? 50);
      for (const item of due) {
        try {
          await this.processOne(item);
        } catch (err) {
          this.deps.logger.error({ err, id: item.id }, "Failed to process scheduled reminder");
          await this.deps.repo.comms.markScheduledResult(item.id, "failed", {
            lastError: (err as Error).message,
          });
        }
      }
    } finally {
      this.running = false;
    }
  }

  private async processOne(item: {
    id: string;
    customerId: string;
    jobId: string | null;
    scheduleVersion: string | null;
  }): Promise<void> {
    const customer = await this.deps.getCustomer(item.customerId);
    const job = item.jobId ? await this.deps.getJob(item.jobId) : undefined;

    if (!customer || !job) {
      await this.deps.repo.comms.markScheduledResult(item.id, "cancelled", {
        lastError: "Customer or job no longer exists.",
      });
      return;
    }
    // Skip if the job was rescheduled (version changed) or cancelled.
    if (job.scheduledStart !== item.scheduleVersion || job.status === "cancelled") {
      await this.deps.repo.comms.markScheduledResult(item.id, "cancelled", {
        lastError: "Job schedule changed since reminder was queued.",
      });
      return;
    }

    const to = await this.deps.getCustomerPhone(customer.id);
    if (!to) {
      await this.deps.repo.comms.markScheduledResult(item.id, "suppressed", {
        lastError: "No usable phone number.",
      });
      return;
    }

    const { buildReminderContext } = await import("./reminderContext.js");
    const context = await buildReminderContext(this.deps.repo, customer, job);
    const outcome = await this.deps.comms.dispatch({
      customerId: customer.id,
      jobId: job.id,
      purpose: "appointment_reminder",
      to,
      context,
      idempotencyKey: `job:${job.id}:appointment_reminder:${job.scheduledStart}`,
    });
    await this.deps.repo.comms.markScheduledResult(
      item.id,
      outcome.ok ? "sent" : outcome.status === "suppressed" ? "suppressed" : "failed",
      { messageId: outcome.messageId, lastError: outcome.ok ? null : outcome.message },
    );
  }
}
