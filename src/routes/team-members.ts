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

    // Filter-tab counts + the review spotlight for the My Team screen.
    // Static route matched before :id so "stats" is never treated as an id.
    app.get("/team-members/stats", async () => repo.getTeamStats());

    // Full profile: identity + rollups + reviews + jobs + referred customers.
    app.get<{ Params: { id: string } }>("/team-members/:id", async (req, reply) => {
      const member = await repo.getTeamMember(req.params.id);
      if (!member) {
        return reply.code(404).send({ error: "not_found", message: "Team member not found" });
      }
      return member;
    });

    app.post("/team-members", async (req, reply) => {
      const input = parseBody(TeamMemberCreate, req.body, reply);
      if (!input) return;
      const teamMember = await repo.createTeamMember(input);
      return reply.code(201).send(teamMember);
    });
  };
}
