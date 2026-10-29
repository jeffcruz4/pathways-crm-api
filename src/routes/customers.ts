import type { FastifyInstance } from "fastify";
import type { Repository } from "../data/index.js";

export function customerRoutes(repo: Repository) {
  return async function (app: FastifyInstance) {
    app.get("/customers", async () => {
      const items = await repo.listCustomers();
      return { items };
    });

    app.get<{ Params: { id: string } }>("/customers/:id", async (req, reply) => {
      const customer = await repo.getCustomer(req.params.id);
      if (!customer) {
        return reply.code(404).send({ error: "not_found", message: "Customer not found" });
      }
      return customer;
    });
  };
}
