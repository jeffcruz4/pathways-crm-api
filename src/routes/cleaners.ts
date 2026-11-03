import type { FastifyInstance } from "fastify";
import type { Repository } from "../data/index.js";
import { parseBody } from "./validate.js";
import { CleanerCreate } from "../domain/cleaner.js";

export function cleanerRoutes(repo: Repository) {
  return async function (app: FastifyInstance) {
    app.get("/cleaners", async () => {
      const items = await repo.listCleaners();
      return { items };
    });

    app.post("/cleaners", async (req, reply) => {
      const input = parseBody(CleanerCreate, req.body, reply);
      if (!input) return;
      const cleaner = await repo.createCleaner(input);
      return reply.code(201).send(cleaner);
    });
  };
}
