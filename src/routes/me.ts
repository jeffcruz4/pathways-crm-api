import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Repository } from "../data/index.js";
import { parseBody } from "./validate.js";
import { UserProfileUpdate, type UserIdentity, type UserRole } from "../domain/user-profile.js";
import { DEV_USER_SUB } from "../data/seedRelational.js";

/**
 * Current-user routes (the Settings screen).
 *
 * Identity comes from the Cognito ID-token claims. Until the pool is live and a
 * verifying preHandler is added (see app.ts), this reads the **unverified**
 * payload of a `Authorization: Bearer <jwt>` when present, and otherwise falls
 * back to a stable dev identity so the preview works. When token verification
 * lands, only `identityFrom` changes — the repo contract stays the same.
 */

const DEV_IDENTITY: UserIdentity = {
  sub: DEV_USER_SUB,
  email: "joe.garrity@corvia.example",
  name: "Joe Garrity",
  role: "Team Member",
};

/** Decode a JWT payload without verifying the signature (dev only). */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const json = Buffer.from(parts[1], "base64url").toString("utf8");
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Map Cognito groups / custom:role claim to a product role. */
function roleFromClaims(claims: Record<string, unknown>): UserRole {
  const norm = (s: string): UserRole | null => {
    const v = s.toLowerCase().replace(/[_-]/g, " ").trim();
    if (v === "system admin" || v === "admin" || v === "systemadmin") return "System Admin";
    if (v === "team member" || v === "teammember" || v === "staff") return "Team Member";
    if (v === "partner") return "Partner";
    if (v === "customer") return "Customer";
    return null;
  };
  const groups = claims["cognito:groups"];
  if (Array.isArray(groups)) {
    for (const g of groups) {
      const r = typeof g === "string" ? norm(g) : null;
      if (r) return r;
    }
  }
  const custom = claims["custom:role"] ?? claims["role"];
  if (typeof custom === "string") {
    const r = norm(custom);
    if (r) return r;
  }
  return "Team Member";
}

function identityFrom(req: FastifyRequest): UserIdentity {
  const auth = req.headers.authorization;
  if (auth && auth.toLowerCase().startsWith("bearer ")) {
    const claims = decodeJwtPayload(auth.slice(7).trim());
    if (claims && typeof claims.sub === "string") {
      return {
        sub: claims.sub,
        email: typeof claims.email === "string" ? claims.email : null,
        name: typeof claims.name === "string" ? claims.name : null,
        role: roleFromClaims(claims),
      };
    }
  }
  return DEV_IDENTITY;
}

export function meRoutes(repo: Repository) {
  return async function (app: FastifyInstance) {
    app.get("/me", async (req) => repo.getMyProfile(identityFrom(req)));

    app.patch("/me", async (req, reply) => {
      const input = parseBody(UserProfileUpdate, req.body, reply);
      if (!input) return;
      return repo.updateMyProfile(identityFrom(req), input);
    });
  };
}
