# Tech Debt — Pathways CRM API

Shortcuts/gaps taken to deliver the read-only API fast. Explicit, cheap to
reverse, resolved before real traffic.

## TD-1 · HIGH · No auth yet (endpoints are open)
**State:** all endpoints are unauthenticated. Acceptable while behind a dev
network and before Cognito is wired.
**Fix:** add a Fastify `preHandler` in `src/app.ts` that verifies the Cognito
JWT (signature via JWKS, `iss`/`aud`/`exp`), and a per-tenant scope check. The
UI already sends a bearer token via `@pathways/auth`.

## TD-2 · HIGH · Serving in-memory seed data, not Postgres
**State:** `DATA_BACKEND=memory` serves `src/data/seed.ts`. The Drizzle schema
(`src/db/schema.ts`) is authored but there is no Postgres repository, migrations
run, or RDS instance.
**Fix:** implement a `PostgresRepository` (Drizzle) satisfying `Repository`,
generate + run migrations (`pnpm db:generate`), load the seed into RDS, and flip
`DATA_BACKEND=postgres`. RDS can be the shared `corvia-dev` Postgres (new DB/
schema) or a dedicated instance.

## TD-3 · MED · Response validation not enforced at the boundary
**State:** domain Zod schemas exist but handlers return repository objects
directly without re-validating against the response schema.
**Fix:** wrap responses with `Schema.parse(...)` (or Fastify response schemas)
so the contract is enforced and drift is caught.

## TD-4 · MED · Multi-tenancy not modeled
**State:** no `tenant_id` on records; single-tenant sample data.
**Fix:** add `tenant_id` to every table + repository filter, and derive the
tenant from the authenticated principal (ties to TD-1).

## TD-5 · MED · Read-only; no write endpoints
**State:** only GETs. Approvals, edits, and the "Cori proposes" actions aren't
writable via the API yet.
**Fix:** add POST/PATCH endpoints with validation + auth once the data store is
real. Honor the product's "AI proposes, deterministic code disposes" rule.

## TD-6 · LOW · No deploy infra in this repo
**State:** Dockerfile only. No ECR/ECS/ALB Terraform or CI.
**Fix:** mirror the UI repo's `infra/terraform` (ECR + web-style service module
on the shared cluster, `pathways-api-*` prefix, isolated state key) + CI
(fmt/validate, build-and-push, approval-gated deploy).

## TD-7 · LOW · No tests
**State:** none. The repository + route handlers are the highest-value targets.
**Fix:** add a test runner (node:test or vitest); cover list/detail/404 per
resource against the memory backend, and config validation.
