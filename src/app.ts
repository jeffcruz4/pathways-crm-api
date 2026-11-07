import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import type { AppConfig } from "./config.js";
import { createRepository, type Repository } from "./data/index.js";
import { CommsService } from "./comms/commsService.js";
import { NotificationTrigger } from "./comms/notifications.js";
import { ReminderScheduler } from "./comms/scheduler.js";
import { commsRoutes } from "./routes/comms.js";
import { toE164 } from "./comms/phone.js";
import { homeRoutes } from "./routes/home.js";
import { customerRoutes } from "./routes/customers.js";
import { partnerRoutes } from "./routes/partners.js";
import { teamMemberRoutes } from "./routes/team-members.js";
import { meRoutes } from "./routes/me.js";
import { notificationRoutes } from "./routes/notifications.js";
import { serviceOfferingRoutes } from "./routes/service-offerings.js";
import { searchRoutes } from "./routes/search.js";
import { pipelineRoutes } from "./routes/pipeline.js";
import { quoteRoutes } from "./routes/quotes.js";
import { conversationRoutes } from "./routes/conversations.js";
import { calendarRoutes } from "./routes/calendar.js";
import { jobRoutes } from "./routes/jobs.js";
import { taskRoutes } from "./routes/tasks.js";

/**
 * Build the Fastify app. Separated from server start so it can be imported in
 * tests. Read-only API for the first milestone; auth (JWT verification) will be
 * added as a preHandler hook here later.
 */
export async function buildApp(config: AppConfig): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.env === "production" ? "info" : "debug",
    },
  });

  await app.register(cors, {
    origin: config.corsOrigins.length ? config.corsOrigins : true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });

  // Twilio webhooks post application/x-www-form-urlencoded. Parse it into an
  // object so route handlers (and signature validation) can read the params.
  app.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "string" },
    (_req, body, done) => {
      try {
        const params: Record<string, string> = {};
        for (const [k, v] of new URLSearchParams(body as string)) params[k] = v;
        done(null, params);
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );

  // NOTE (GoHighLevel webhooks, Phase 1): GHL posts application/json and signs
  // the raw body. Fastify's default JSON parser discards the raw bytes, so
  // byte-exact signature verification is NOT available here yet — the GHL
  // webhook routes reconstruct an approximate body and the adapter fails
  // signature verification CLOSED until the real scheme is confirmed on a
  // sandbox (OPEN-6/OPEN-12). When implementing real verification, add a
  // raw-body plugin (e.g. fastify-raw-body) SCOPED to the GHL webhook routes so
  // the rest of the API keeps the default parsed-object JSON behavior. Do NOT
  // replace the global JSON parser — every existing route relies on it.

  const repo = createRepository(config);

  // ── Unified Communications (Twilio SMS) wiring ──
  const comms = new CommsService(repo, config);

  // Resolve a customer's primary SMS-capable number (E.164) for notifications.
  const getCustomerPhone = async (customerId: string): Promise<string | null> => {
    const customer = await repo.getCustomer(customerId);
    if (!customer) return null;
    const mobile = customer.contacts.find((c) => c.kind === "mobile" && c.isPrimary)
      ?? customer.contacts.find((c) => c.kind === "mobile");
    return toE164(mobile?.value ?? customer.phone ?? null);
  };

  const trigger = new NotificationTrigger(repo, comms, getCustomerPhone);

  // Health check for the ALB target group.
  app.get("/healthz", async () => ({ status: "ok", env: config.env, backend: config.dataBackend }));

  // Resource routes under /api/v1.
  const apiPrefix = "/api/v1";
  await app.register(homeRoutes(repo), { prefix: apiPrefix });
  await app.register(customerRoutes(repo, trigger), { prefix: apiPrefix });
  await app.register(partnerRoutes(repo), { prefix: apiPrefix });
  await app.register(teamMemberRoutes(repo), { prefix: apiPrefix });
  await app.register(meRoutes(repo), { prefix: apiPrefix });
  await app.register(notificationRoutes(repo), { prefix: apiPrefix });
  await app.register(serviceOfferingRoutes(repo), { prefix: apiPrefix });
  await app.register(searchRoutes(repo), { prefix: apiPrefix });
  await app.register(pipelineRoutes(repo), { prefix: apiPrefix });
  await app.register(quoteRoutes(repo), { prefix: apiPrefix });
  await app.register(conversationRoutes(repo), { prefix: apiPrefix });
  await app.register(calendarRoutes(repo), { prefix: apiPrefix });
  await app.register(jobRoutes(repo), { prefix: apiPrefix });
  await app.register(taskRoutes(repo), { prefix: apiPrefix });
  await app.register(commsRoutes(repo, config, comms), { prefix: apiPrefix });

  // Start the in-process reminder scheduler once the app is ready. It is a tick
  // worker (see scheduler.ts) suitable for the single-process MVP deployment.
  const scheduler = new ReminderScheduler({
    repo,
    comms,
    trigger,
    logger: app.log,
    getCustomerPhone,
    getCustomer: async (customerId) => {
      const c = await repo.getCustomer(customerId);
      if (!c) return undefined;
      return { id: c.id, firstName: null, displayName: c.name };
    },
    getJob: async (jobId) => {
      // Resolve the job through its customer bundle (no single-job getter yet).
      // We scan customers lazily only when a reminder is due, which is rare.
      return findJob(repo, jobId);
    },
  });
  app.addHook("onReady", async () => {
    scheduler.start();
  });
  app.addHook("onClose", async () => {
    scheduler.stop();
  });

  return app;
}

/**
 * Locate a job (and its customer) by id across the repository. There is no
 * single-job getter today; the scheduler needs the job's current schedule to
 * verify the reminder is still valid. Kept here to avoid widening the
 * Repository interface for an infrequent lookup.
 */
async function findJob(
  repo: Repository,
  jobId: string,
): Promise<{ id: string; customerId: string; status: string; scheduledStart: string | null } | undefined> {
  const customers = await repo.listCustomers();
  for (const item of customers) {
    const full = await repo.getCustomer(item.id);
    const job = full?.jobs.find((j) => j.id === jobId);
    if (job) {
      return {
        id: job.id,
        customerId: full!.id,
        status: job.status,
        scheduledStart: job.scheduledStart ?? null,
      };
    }
  }
  return undefined;
}
