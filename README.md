# Pathways CRM API

The read-first backend API for **Pathways CRM** (the "touchless CRM"). A light,
low-cost TypeScript service (Fastify) that serves the resources the Pathways CRM
UI renders. Built to share data shapes with the UI and to run cheaply as a
container on the shared AWS footprint.

> Companion to the UI repo (`pathways-crm`). Auth and write operations come
> later; this milestone is **read-only** and serves seeded sample data.

## Stack (and why)

- **Fastify + TypeScript** — minimal, fast, tiny footprint; lighter than Spring
  Boot. TS lets us keep the API's domain shapes aligned with the UI's.
- **Zod** — one source for request/response schemas + inferred types + runtime
  validation.
- **Drizzle ORM (Postgres/RDS)** — the intended data store; the schema is
  authored in `src/db/schema.ts` but **not yet wired** (see Data backend).
- **Containerized** — a slim multi-stage Docker image to run on the shared ECS
  cluster, same low-cost pattern as the UI.

## Endpoints (read-only, under `/api/v1`)

| Method | Path | Returns |
|---|---|---|
| GET | `/healthz` | liveness + active data backend |
| GET | `/api/v1/customers` | `{ items: CustomerListItem[] }` |
| GET | `/api/v1/customers/:id` | full `Customer` (404 if missing) |
| GET | `/api/v1/partners` | `{ items: PartnerListItem[] }` |
| GET | `/api/v1/partners/:id` | full `Partner` (404 if missing) |
| GET | `/api/v1/pipeline` | `{ summary, stages[] }` with deals |
| GET | `/api/v1/conversations` | `{ items: ConvoListItem[] }` |
| GET | `/api/v1/conversations/:id` | `ConversationDetail` (404 if missing) |
| GET | `/api/v1/calendar/week` | `CalendarWeek` |
| GET | `/api/v1/digest` | `Digest` (daily digest aggregation) |

Domain models live in `src/domain/` as Zod schemas (the contract).

## Data backend

A `Repository` interface (`src/data/repository.ts`) is the seam:

- **`memory`** (default) — serves the seeded sample data in `src/data/seed.ts`
  (the same content the UI mock modules used). No database required.
- **`postgres`** — Drizzle over RDS. The schema exists (`src/db/schema.ts`);
  the Postgres repository implementation is **not built yet** (fails loud if
  selected). This is the planned swap once RDS is provisioned.

Set via `DATA_BACKEND` (see `.env.example`).

## Run locally

```sh
corepack pnpm install
cp .env.example .env
corepack pnpm run dev        # tsx watch, http://localhost:8080
# or:
corepack pnpm run build && corepack pnpm start
```

Smoke test:

```sh
curl http://localhost:8080/healthz
curl http://localhost:8080/api/v1/customers
curl http://localhost:8080/api/v1/customers/c-tom-becker
```

## Docker

```sh
docker build -t pathways-crm-api:local .
docker run --rm -p 8080:8080 -e CORS_ORIGINS=http://localhost:5173 pathways-crm-api:local
```

## Postgres / RDS

The Postgres path is built and proven (see `infra/terraform/README.md` for the
full runbook):

```sh
# local Docker Postgres
docker run --rm --name pathways-pg -e POSTGRES_PASSWORD=pathways \
  -e POSTGRES_USER=pathways -e POSTGRES_DB=pathways -p 5433:5432 postgres:16-alpine
export DATABASE_URL="postgres://pathways:pathways@localhost:5433/pathways"
pnpm db:generate   # emit migrations from src/db/schema.ts (committed)
pnpm db:migrate    # apply migrations
pnpm db:seed       # load sample data
DATA_BACKEND=postgres pnpm dev   # /healthz -> "backend":"postgres"
```

A dedicated RDS instance is defined in `infra/terraform` (apply it, then point
`DATABASE_URL` at the RDS endpoint using the master secret).

## Not built yet (tracked)

- Apply the RDS Terraform + run migrations against it (needs a VPC; see infra
  README).
- Auth: JWT verification (Cognito) as a Fastify `preHandler` — a clear seam in
  `src/app.ts`.
- Write endpoints (POST/PATCH) — this milestone is read-only.
- Compute module (ECR + ECS service + ALB) + CI for the API service.
