import type { FastifyInstance } from "fastify";
import type { Repository } from "../data/index.js";
import { parseBody } from "./validate.js";
import { NotificationFilter, NotificationUpdate } from "../domain/notification.js";

export function notificationRoutes(repo: Repository) {
  return async function (app: FastifyInstance) {
    // List, optionally filtered: ?filter=all|unread|saved (default all).
    app.get<{ Querystring: { filter?: string } }>("/notifications", async (req, reply) => {
      const parsed = NotificationFilter.safeParse(req.query.filter ?? "all");
      if (!parsed.success) {
        return reply.code(400).send({ error: "bad_request", message: "filter must be all, unread, or saved" });
      }
      return repo.listNotifications(parsed.data);
    });

    // Mark everything read. Static path declared before `/notifications/:id`.
    app.post("/notifications/read-all", async () => repo.markAllNotificationsRead());

    // Toggle read / saved on one notification.
    app.patch<{ Params: { id: string } }>("/notifications/:id", async (req, reply) => {
      const input = parseBody(NotificationUpdate, req.body, reply);
      if (!input) return;
      const updated = await repo.updateNotification(req.params.id, input);
      return updated
        ? updated
        : reply.code(404).send({ error: "not_found", message: "Notification not found" });
    });
  };
}
