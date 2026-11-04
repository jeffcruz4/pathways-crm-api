import type { FastifyInstance } from "fastify";
import type { Repository } from "../data/index.js";
import { parseBody } from "./validate.js";
import { PartnerCreate, PartnerUpdate } from "../domain/partner.js";

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

    app.post("/partners", async (req, reply) => {
      const input = parseBody(PartnerCreate, req.body, reply);
      if (!input) return;
      const partner = await repo.createPartner(input);
      return reply.code(201).send(partner);
    });

    app.patch<{ Params: { id: string } }>("/partners/:id", async (req, reply) => {
      const input = parseBody(PartnerUpdate, req.body, reply);
      if (!input) return;
      const updated = await repo.updatePartner(req.params.id, input);
      return updated
        ? updated
        : reply.code(404).send({ error: "not_found", message: "Partner not found" });
    });
  };
}
