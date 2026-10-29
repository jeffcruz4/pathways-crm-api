import type { FastifyInstance } from "fastify";
import type { Repository } from "../data/index.js";

export function conversationRoutes(repo: Repository) {
  return async function (app: FastifyInstance) {
    app.get("/conversations", async () => {
      const items = await repo.listConversations();
      return { items };
    });

    app.get<{ Params: { id: string } }>("/conversations/:id", async (req, reply) => {
      const convo = await repo.getConversation(req.params.id);
      if (!convo) {
        return reply.code(404).send({ error: "not_found", message: "Conversation not found" });
      }
      return convo;
    });
  };
}
