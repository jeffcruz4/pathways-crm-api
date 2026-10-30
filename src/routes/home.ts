import type { FastifyInstance } from "fastify";
import type { Repository } from "../data/index.js";

export function homeRoutes(repo: Repository) {
  return async function (app: FastifyInstance) {
    app.get("/home", async () => repo.getHome());
  };
}
