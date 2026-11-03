import type { FastifyInstance } from "fastify";
import type { Repository } from "../data/index.js";
import { parseBody } from "./validate.js";
import { ServiceOfferingCreate, ServiceOfferingUpdate } from "../domain/crm.js";

export function serviceOfferingRoutes(repo: Repository) {
  return async function (app: FastifyInstance) {
    app.get("/service-offerings", async () => {
      const items = await repo.listServiceOfferings();
      return { items };
    });

    app.post("/service-offerings", async (req, reply) => {
      const input = parseBody(ServiceOfferingCreate, req.body, reply);
      if (!input) return;
      const offering = await repo.createServiceOffering(input);
      return reply.code(201).send(offering);
    });

    app.patch<{ Params: { id: string } }>("/service-offerings/:id", async (req, reply) => {
      const input = parseBody(ServiceOfferingUpdate, req.body, reply);
      if (!input) return;
      const updated = await repo.updateServiceOffering(req.params.id, input);
      return updated
        ? updated
        : reply.code(404).send({ error: "not_found", message: "Service offering not found" });
    });
  };
}
