import type { FastifyInstance } from "fastify";
import type { Repository } from "../data/index.js";
import { parseBody } from "./validate.js";
import { QuoteUpdate } from "../domain/crm.js";

/**
 * Quote edits used by the pipeline board. `PATCH /quotes/:id` sets the status
 * when a card is dragged to another swim lane (and supports inline detail /
 * amount / needs-you edits from the slide-out).
 */
export function quoteRoutes(repo: Repository) {
  return async function (app: FastifyInstance) {
    app.patch<{ Params: { id: string } }>("/quotes/:id", async (req, reply) => {
      const input = parseBody(QuoteUpdate, req.body, reply);
      if (!input) return;
      const updated = await repo.updateQuote(req.params.id, input);
      return updated
        ? updated
        : reply.code(404).send({ error: "not_found", message: "Quote not found" });
    });
  };
}
