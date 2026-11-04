import type { FastifyInstance } from "fastify";
import type { Repository } from "../data/index.js";

/**
 * Global keyword search. `GET /search?q=<terms>` returns hits grouped by entity
 * type across every object (customers, partners, team members, catalog, jobs,
 * quotes, plans, properties, appointments). Keyword-only for now; the response
 * contract is stable so semantic search can slot in behind it later.
 */
export function searchRoutes(repo: Repository) {
  return async function (app: FastifyInstance) {
    app.get<{ Querystring: { q?: string } }>("/search", async (req) => {
      const q = (req.query.q ?? "").trim();
      // Empty query → empty results (no error) so the UI can call freely.
      return repo.search(q);
    });
  };
}
