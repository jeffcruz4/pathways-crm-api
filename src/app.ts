import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import type { AppConfig } from "./config.js";
import { createRepository } from "./data/index.js";
import { customerRoutes } from "./routes/customers.js";
import { partnerRoutes } from "./routes/partners.js";
import { pipelineRoutes } from "./routes/pipeline.js";
import { conversationRoutes } from "./routes/conversations.js";
import { calendarRoutes } from "./routes/calendar.js";

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
    methods: ["GET", "OPTIONS"],
  });

  const repo = createRepository(config);

  // Health check for the ALB target group.
  app.get("/healthz", async () => ({ status: "ok", env: config.env, backend: config.dataBackend }));

  // Resource routes under /api/v1.
  const apiPrefix = "/api/v1";
  await app.register(customerRoutes(repo), { prefix: apiPrefix });
  await app.register(partnerRoutes(repo), { prefix: apiPrefix });
  await app.register(pipelineRoutes(repo), { prefix: apiPrefix });
  await app.register(conversationRoutes(repo), { prefix: apiPrefix });
  await app.register(calendarRoutes(repo), { prefix: apiPrefix });

  return app;
}
