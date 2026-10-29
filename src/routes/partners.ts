import type { FastifyInstance } from "fastify";
import type { Repository } from "../data/index.js";

export function partnerRoutes(repo: Repository) {
  return async function (app: FastifyInstance) {
    app.get("/partners", async () => {
      const items = await repo.listPartners();
      return { items };
    });

    app.get<{ Params: { id: string } }>("/partners/:id", async (req, reply) => {
      const partner = await repo.getPartner(req.params.id);
      if (!partner) {
        return reply.code(404).send({ error: "not_found", message: "Partner not found" });
      }
      return partner;
    });
  };
}
