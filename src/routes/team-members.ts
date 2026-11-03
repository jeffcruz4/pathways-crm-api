import type { FastifyInstance } from "fastify";
import type { Repository } from "../data/index.js";
import { parseBody } from "./validate.js";
import { TeamMemberCreate } from "../domain/team-member.js";

export function teamMemberRoutes(repo: Repository) {
  return async function (app: FastifyInstance) {
    app.get("/team-members", async () => {
      const items = await repo.listTeamMembers();
      return { items };
    });

    app.post("/team-members", async (req, reply) => {
      const input = parseBody(TeamMemberCreate, req.body, reply);
      if (!input) return;
      const teamMember = await repo.createTeamMember(input);
      return reply.code(201).send(teamMember);
    });
  };
}
