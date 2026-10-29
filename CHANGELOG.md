# Changelog

All notable changes to **Pathways CRM API** are recorded here. Loosely based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); grouped by phase,
newest first. PR numbers reference `jeffcruz4/pathways-crm-api`.

---

## Phase 1 — Read-only API scaffold

Stand up the service and read endpoints that back the existing UI screens, so
the UI can replace its mock data with real API calls. Auth and writes are
deferred by decision.

### Added
- **Fastify + TypeScript** service: config-first (`src/config.ts`, env + Zod),
  CORS, health check, graceful shutdown, logging.
- **Domain models** (`src/domain/*`) as Zod schemas (the contract + inferred
  types): customer, partner, deal/pipeline, conversation, calendar/digest.
- **Read-only endpoints** under `/api/v1`: customers (list + detail), partners
  (list + detail), pipeline, conversations (list + detail), calendar week, and
  the daily digest. 404s on missing records.
- **Repository seam** (`src/data/`): a `Repository` interface with a
  `MemoryRepository` serving seeded sample data (the same content the UI mock
  modules used). `DATA_BACKEND` selects the backend; `postgres` is reserved for
  the future RDS swap and fails loud until implemented.
- **Drizzle schema** (`src/db/schema.ts`): the intended RDS Postgres model
  (customers, partners, deals, appointments, conversations + entries), with
  Cori's extractions (summaries, record updates, chips) stored as first-class
  data. Not yet wired to the running service.
- **Containerization:** multi-stage `Dockerfile` (build → slim runtime) for the
  shared ECS cluster; `.env.example`, `README.md`, `tech_debt.md`.

### Verified
- Typecheck + build clean; dev server serves all endpoints (200s + a 404 path)
  against the memory backend.
