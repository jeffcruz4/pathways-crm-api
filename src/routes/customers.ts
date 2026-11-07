import type { FastifyInstance } from "fastify";
import type { Repository } from "../data/index.js";
import { parseBody } from "./validate.js";
import { CustomerCreate, CustomerUpdate } from "../domain/customer.js";
import {
  ContactCreate,
  PropertyCreate,
  PropertyUpdate,
  PlanCreate,
  QuoteCreate,
  JobCreate,
  JobUpdate,
  ReviewCreate,
  AppointmentCreate,
  InteractionCreate,
} from "../domain/crm.js";
import type { NotificationTrigger, JobForNotification, CustomerForNotification } from "../comms/notifications.js";
import type { Job } from "../domain/crm.js";

/**
 * Fire-and-persist SMS lifecycle notifications off a job write. Errors are
 * swallowed (and logged by the service) so SMS never blocks a job update — a
 * Twilio outage must not stop a job from being created/updated (spec §13).
 */
async function notifyJobChange(
  repo: Repository,
  trigger: NotificationTrigger,
  customerId: string,
  job: Job,
  event: "created" | "status",
  previousStatus?: string,
): Promise<void> {
  const full = await repo.getCustomer(customerId);
  if (!full) return;
  const customer: CustomerForNotification = { id: full.id, firstName: null, displayName: full.name };
  const jobN: JobForNotification = {
    id: job.id,
    customerId: full.id,
    status: job.status,
    scheduledStart: job.scheduledStart ?? null,
  };
  try {
    if (event === "created") {
      if (job.status === "scheduled") await trigger.onJobScheduled(customer, jobN);
      return;
    }
    // Status transition — only act when the status actually changed.
    if (job.status === previousStatus) {
      // A reschedule (same status, new time) still updates the reminder.
      if (job.status === "scheduled") await trigger.enqueueReminder(customer, jobN);
      return;
    }
    switch (job.status) {
      case "scheduled":
        await trigger.onJobScheduled(customer, jobN);
        break;
      case "en-route":
        await trigger.onCleanerEnRoute(customer, jobN);
        break;
      case "completed":
        await trigger.onJobCompleted(customer, jobN);
        break;
      case "cancelled":
        await trigger.onJobCancelled(jobN);
        break;
    }
  } catch {
    /* SMS failures must not break the job write; service logs the detail. */
  }
}

export function customerRoutes(repo: Repository, trigger: NotificationTrigger) {
  return async function (app: FastifyInstance) {
    // ── List / detail ──
    app.get("/customers", async () => {
      const items = await repo.listCustomers();
      return { items };
    });

    // Aggregate dashboard stats. Static route is matched before `/customers/:id`
    // by Fastify's router, so "stats" is never treated as an id.
    app.get("/customers/stats", async () => {
      return repo.getCustomerStats();
    });

    app.get<{ Params: { id: string } }>("/customers/:id", async (req, reply) => {
      const customer = await repo.getCustomer(req.params.id);
      if (!customer) {
        return reply.code(404).send({ error: "not_found", message: "Customer not found" });
      }
      return customer;
    });

    // ── Create a customer (identity + optional first contacts) ──
    app.post("/customers", async (req, reply) => {
      const input = parseBody(CustomerCreate, req.body, reply);
      if (!input) return;
      const customer = await repo.createCustomer(input);
      return reply.code(201).send(customer);
    });

    // ── Edit a customer (identity + presentation fields) ──
    app.patch<{ Params: { id: string } }>("/customers/:id", async (req, reply) => {
      const input = parseBody(CustomerUpdate, req.body, reply);
      if (!input) return;
      const updated = await repo.updateCustomer(req.params.id, input);
      return updated
        ? updated
        : reply.code(404).send({ error: "not_found", message: "Customer not found" });
    });

    // ── Sub-resources: build the 360° record ──
    const notFound = (reply: import("fastify").FastifyReply) =>
      reply.code(404).send({ error: "not_found", message: "Customer not found" });

    app.post<{ Params: { id: string } }>("/customers/:id/contacts", async (req, reply) => {
      const input = parseBody(ContactCreate, req.body, reply);
      if (!input) return;
      const created = await repo.addContact(req.params.id, input);
      return created ? reply.code(201).send(created) : notFound(reply);
    });

    app.post<{ Params: { id: string } }>("/customers/:id/properties", async (req, reply) => {
      const input = parseBody(PropertyCreate, req.body, reply);
      if (!input) return;
      const created = await repo.addProperty(req.params.id, input);
      return created ? reply.code(201).send(created) : notFound(reply);
    });

    app.patch<{ Params: { id: string; propertyId: string } }>(
      "/customers/:id/properties/:propertyId",
      async (req, reply) => {
        const input = parseBody(PropertyUpdate, req.body, reply);
        if (!input) return;
        const updated = await repo.updateProperty(req.params.id, req.params.propertyId, input);
        return updated
          ? updated
          : reply.code(404).send({ error: "not_found", message: "Customer or property not found" });
      },
    );

    app.post<{ Params: { id: string } }>("/customers/:id/plans", async (req, reply) => {
      const input = parseBody(PlanCreate, req.body, reply);
      if (!input) return;
      const created = await repo.createPlan(req.params.id, input);
      return created ? reply.code(201).send(created) : notFound(reply);
    });

    app.post<{ Params: { id: string } }>("/customers/:id/quotes", async (req, reply) => {
      const input = parseBody(QuoteCreate, req.body, reply);
      if (!input) return;
      const created = await repo.createQuote(req.params.id, input);
      return created ? reply.code(201).send(created) : notFound(reply);
    });

    app.post<{ Params: { id: string } }>("/customers/:id/jobs", async (req, reply) => {
      const input = parseBody(JobCreate, req.body, reply);
      if (!input) return;
      const created = await repo.createJob(req.params.id, input);
      if (!created) return notFound(reply);
      await notifyJobChange(repo, trigger, req.params.id, created, "created");
      return reply.code(201).send(created);
    });

    // Update a job (status / schedule). Status transitions drive SMS:
    // en-route → "cleaner en route", completed → "review request",
    // cancelled → cancel pending reminders, (re)scheduled → reminder recompute.
    app.patch<{ Params: { id: string; jobId: string } }>(
      "/customers/:id/jobs/:jobId",
      async (req, reply) => {
        const input = parseBody(JobUpdate, req.body, reply);
        if (!input) return;
        // Capture the prior status so we only notify on a real transition.
        const before = await repo.getCustomer(req.params.id);
        const prev = before?.jobs.find((j) => j.id === req.params.jobId)?.status;
        const updated = await repo.updateJob(req.params.id, req.params.jobId, input);
        if (!updated) {
          return reply.code(404).send({ error: "not_found", message: "Customer or job not found" });
        }
        await notifyJobChange(repo, trigger, req.params.id, updated, "status", prev);
        return updated;
      },
    );

    app.post<{ Params: { id: string; jobId: string } }>(
      "/customers/:id/jobs/:jobId/review",
      async (req, reply) => {
        const input = parseBody(ReviewCreate, req.body, reply);
        if (!input) return;
        const created = await repo.addJobReview(req.params.id, req.params.jobId, input);
        return created
          ? reply.code(201).send(created)
          : reply.code(404).send({ error: "not_found", message: "Customer or job not found" });
      },
    );

    app.get<{ Params: { id: string } }>("/customers/:id/appointments", async (req, reply) => {
      const items = await repo.listAppointments(req.params.id);
      return items ? { items } : notFound(reply);
    });

    app.post<{ Params: { id: string } }>("/customers/:id/appointments", async (req, reply) => {
      const input = parseBody(AppointmentCreate, req.body, reply);
      if (!input) return;
      const created = await repo.createAppointment(req.params.id, input);
      return created ? reply.code(201).send(created) : notFound(reply);
    });

    // Log a customer interaction (type + method + note). The list comes back on
    // the customer record itself (`interactions`, newest first).
    app.post<{ Params: { id: string } }>("/customers/:id/interactions", async (req, reply) => {
      const input = parseBody(InteractionCreate, req.body, reply);
      if (!input) return;
      const created = await repo.addInteraction(req.params.id, input);
      return created ? reply.code(201).send(created) : notFound(reply);
    });
  };
}
