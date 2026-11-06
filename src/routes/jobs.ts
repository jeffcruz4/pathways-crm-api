import type { FastifyInstance } from "fastify";
import type { Repository } from "../data/index.js";

/**
 * Flat, cross-customer jobs list for the Jobs table screen. Returns every job
 * with its resolved customer name, property address, and assignee so the UI can
 * display and filter without extra lookups. Filtering is done client-side today
 * (the dataset is small); a `status` query hint is accepted for future use.
 */
export function jobRoutes(repo: Repository) {
  return async function (app: FastifyInstance) {
    app.get("/jobs", async () => {
      const items = await repo.listJobs();
      return { items };
    });
  };
}
