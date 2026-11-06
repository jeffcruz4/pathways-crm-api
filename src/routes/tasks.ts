import type { FastifyInstance } from "fastify";
import type { Repository } from "../data/index.js";
import { parseBody } from "./validate.js";
import { TaskCreate, TaskUpdate } from "../domain/task.js";

/**
 * Tasks for "Your priorities". Completing a task (status -> done) requires a
 * non-empty completionComment; the route rejects a completion without one so
 * the UI's "require a comment" rule is enforced server-side too.
 */
export function taskRoutes(repo: Repository) {
  return async function (app: FastifyInstance) {
    app.get("/tasks", async () => {
      const items = await repo.listTasks();
      return { items };
    });

    app.post("/tasks", async (req, reply) => {
      const input = parseBody(TaskCreate, req.body, reply);
      if (!input) return;
      const task = await repo.createTask(input);
      return reply.code(201).send(task);
    });

    app.patch<{ Params: { id: string } }>("/tasks/:id", async (req, reply) => {
      const input = parseBody(TaskUpdate, req.body, reply);
      if (!input) return;
      // Completing a task requires a comment.
      if (input.status === "done" && !input.completionComment?.trim()) {
        return reply.code(400).send({
          error: "comment_required",
          message: "A comment is required to complete a task.",
        });
      }
      const task = await repo.updateTask(req.params.id, input);
      if (!task) {
        return reply.code(404).send({ error: "not_found", message: "Task not found" });
      }
      return task;
    });
  };
}
