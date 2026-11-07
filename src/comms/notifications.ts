/**
 * Job-lifecycle → SMS notification wiring.
 *
 * Translates job lifecycle transitions into SMS dispatches / scheduled
 * reminders. Each automated send carries a deterministic idempotency key so a
 * replayed or duplicate lifecycle event never produces a second message
 * (spec §6, §10). The 24h reminder is enqueued as a ScheduledCommunication and
 * dispatched later by the scheduler worker.
 */
import type { Repository } from "../data/repository.js";
import type { CommsService } from "./commsService.js";
import type { CommPurpose } from "../domain/comms.js";
import { buildReminderContext } from "./reminderContext.js";

const REMINDER_LEAD_MS = 24 * 60 * 60 * 1000;

/** Minimal shape of a job the trigger needs; mapped from the job domain/row. */
export type JobForNotification = {
  id: string;
  customerId: string;
  status: string;
  scheduledStart: string | null; // ISO
};

export type CustomerForNotification = {
  id: string;
  firstName: string | null;
  displayName: string;
};

/** A stable per-event key: one message per (job, purpose, schedule instant). */
function idempotencyKey(job: JobForNotification, purpose: CommPurpose): string {
  const version = job.scheduledStart ?? "none";
  return `job:${job.id}:${purpose}:${version}`;
}

export class NotificationTrigger {
  constructor(
    private readonly repo: Repository,
    private readonly comms: CommsService,
    private readonly getCustomerPhone: (customerId: string) => Promise<string | null>,
  ) {}

  private async dispatch(
    customer: CustomerForNotification,
    job: JobForNotification,
    purpose: CommPurpose,
  ): Promise<void> {
    const to = await this.getCustomerPhone(customer.id);
    if (!to) return;
    const context = await buildReminderContext(this.repo, customer, job);
    await this.comms.dispatch({
      customerId: customer.id,
      jobId: job.id,
      purpose,
      to,
      context,
      idempotencyKey: idempotencyKey(job, purpose),
    });
  }

  /** A job was confirmed/scheduled: send confirmation + enqueue 24h reminder. */
  async onJobScheduled(customer: CustomerForNotification, job: JobForNotification): Promise<void> {
    await this.dispatch(customer, job, "job_scheduled");
    await this.enqueueReminder(customer, job);
  }

  /** Recompute/replace the pending 24h reminder for a (re)scheduled job. */
  async enqueueReminder(customer: CustomerForNotification, job: JobForNotification): Promise<void> {
    // Cancel any pending reminder tied to a prior schedule version.
    await this.repo.comms.cancelScheduledForJob(job.id, "appointment_reminder");
    if (!job.scheduledStart) return;
    const startMs = new Date(job.scheduledStart).getTime();
    const dueMs = startMs - REMINDER_LEAD_MS;
    // Jobs booked inside the 24h window: skip the reminder (MVP late-booking policy).
    if (dueMs <= Date.now()) return;
    await this.repo.comms.scheduleCommunication({
      customerId: customer.id,
      jobId: job.id,
      purpose: "appointment_reminder",
      scheduledFor: new Date(dueMs),
      idempotencyKey: idempotencyKey(job, "appointment_reminder"),
      scheduleVersion: job.scheduledStart,
    });
  }

  async onCleanerEnRoute(customer: CustomerForNotification, job: JobForNotification): Promise<void> {
    await this.dispatch(customer, job, "cleaner_en_route");
  }

  async onJobCompleted(customer: CustomerForNotification, job: JobForNotification): Promise<void> {
    await this.dispatch(customer, job, "job_completed_review");
  }

  /** A job was cancelled: cancel all pending lifecycle notifications. */
  async onJobCancelled(job: JobForNotification): Promise<void> {
    await this.repo.comms.cancelScheduledForJob(job.id);
  }
}
