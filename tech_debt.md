# Tech Debt — Pathways CRM API

Shortcuts/gaps taken to deliver the read-only API fast. Explicit, cheap to
reverse, resolved before real traffic.

## TD-1 · HIGH · No auth yet (endpoints are open)
**State:** all endpoints are unauthenticated. Acceptable while behind a dev
network and before Cognito is wired.
**Fix:** add a Fastify `preHandler` in `src/app.ts` that verifies the Cognito
JWT (signature via JWKS, `iss`/`aud`/`exp`), and a per-tenant scope check. The
UI already sends a bearer token via `@pathways/auth`.

## TD-2 · PARTIALLY RESOLVED · Postgres path built; RDS not yet applied
**Done:** `PostgresRepository` (Drizzle) implements `Repository`; `db:generate`
emits migrations, `db:migrate`/`db:seed` run them; `DATA_BACKEND=postgres` wires
it via `DATABASE_URL`. Proven end-to-end against local Docker Postgres
(`/healthz` reports `backend: postgres`). Terraform for a **dedicated RDS
instance** lives in `infra/terraform` (validated).
**Remaining:**
- Apply the RDS Terraform (zero-input — reuses the corvia VPC/subnets/cluster),
  run the **turnkey migrator** (`aws ecs run-task` or the `migrate.yml` GitHub
  workflow) to `migrate+seed`, then flip the service to postgres.
- Some non-tabular aggregations (Home, Daily Digest, and the pipeline/calendar
  *summary* headers, conversation list previews, the conversation's linked-
  customer snapshot) are still served from the seed constants inside
  `PostgresRepository`. Model/compute these from tables in a later pass.

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

## TD-6 · MED · Deploy infra: RDS + ECR + migrator + CI done; API service (ECS/ALB) still needed
**State:** `infra/terraform` now provisions the dedicated RDS instance, an ECR
repo (`pathways/api`), a one-off **migrator** Fargate task (reusing the corvia
cluster), and a GitHub OIDC deploy role. CI exists for the image +
migration (`build-and-push.yml`, `migrate.yml`). What's missing is the
**long-running API service** itself: an ECS service + ALB (or API Gateway) and
its task SG, plus a deploy workflow that rolls the service.
**Fix:** add a Fargate service module (mirroring the UI repo's `web` module) +
ALB that runs the same image as the API (`CMD node dist/server.js`,
`DATA_BACKEND=postgres` + `DATABASE_URL` from the secret), wire its task SG into
the RDS module's `allowed_security_group_ids` (and tighten the DB off the VPC
CIDR), and add an approval-gated deploy workflow. The OIDC role will need
`ecs:UpdateService`/`DescribeServices` added for that.

## TD-7 · LOW · No tests
**State:** none. The repository + route handlers are the highest-value targets.
**Fix:** add a test runner (node:test or vitest); cover list/detail/404 per
resource against the memory backend, and config validation.
