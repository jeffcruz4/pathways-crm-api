import type { FastifyInstance } from "fastify";
import type { Repository } from "../data/index.js";

export function calendarRoutes(repo: Repository) {
  return async function (app: FastifyInstance) {
    app.get("/calendar/week", async () => repo.getCalendarWeek());
    app.get("/digest", async () => repo.getDigest());
  };
}
