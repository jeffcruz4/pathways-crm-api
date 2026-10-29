import type { FastifyInstance } from "fastify";
import type { Repository } from "../data/index.js";

export function pipelineRoutes(repo: Repository) {
  return async function (app: FastifyInstance) {
    app.get("/pipeline", async () => repo.getPipeline());
  };
}
