# Changelog

All notable changes to **Pathways CRM API** are recorded here. Loosely based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); grouped by phase,
newest first. PR numbers reference `jeffcruz4/pathways-crm-api`.

---

## Unreleased — Unified inbox (backend)

### Added
- **Tenant-wide conversation reads + staff reply**, backing the native unified
  inbox. New `CommsRepository` methods: `listInboxConversations(filter)` (with
  status/unread/unmatched/channel/search filters + resolved customer names),
  `getConversationView(id)` (conversation + chronological messages),
  `markConversationRead(id)`, `associateConversationCustomer(id, customerId)`
  (links an unmatched conversation and backfills the customer on its messages),
  and `getConversationDispatchInfo(id)`.
- **Staff reply** (`CommsService.sendReply`, SMS-FR-022): sends on the
  conversation's channel to its counterparty with the `staff_conversation`
  purpose, through the same dispatch-time consent/suppression path. Replying to
  an unmatched conversation is refused until it's associated with a customer.
- **Routes**: `GET /inbox/conversations`, `GET /inbox/conversations/:id`,
  `POST /inbox/conversations/:id/read`, `POST /inbox/conversations/:id/messages`
  (reply), `POST /inbox/conversations/:id/associate-customer`. Namespaced under
  `/inbox` so they don't collide with the existing demo `/conversations` route.

### Fixed
- Inbox query-string booleans (`unread`/`unmatched`) now parse `"false"`
  correctly instead of coercing any non-empty string to true.

---

## Unreleased — Communications core refactor (Conversation layer + provider adapters)

Aligns the SMS feature with the Unified Communications architecture direction
(Pathways is the system of record; providers are interchangeable transport).

### Added
- **Conversation layer** (`conversations` + `conversation_participants`, migration
  `0008_*`): a channel-agnostic, Pathways-owned conversation record. Every SMS
  message now carries a `conversation_id`; SMS conversations are keyed
  deterministically by tenant + channel + connection + customer phone. Provider
  thread ids are stored as metadata, never as the primary key. Inbound replies
  thread into the same conversation and increment an unread counter.
- **Provider adapter contract** (`CommunicationProviderAdapter`): a provider-neutral
  interface (`validateConnection`, `getCapabilities`, `sendMessage`,
  `validateWebhook`, `normalizeInboundWebhook`) plus a `ChannelCapabilities`
  model (sets up the Facebook customer-initiated / 24h-window path). Twilio is
  now the first implementation behind this interface.
- **ChannelRouter**: selects an adapter by provider+channel and resolves the
  connection's sending context + credential (credential resolution moved out of
  the core and behind the router). Adding a channel = register an adapter.
- New `GET /customers/:id/conversations` (feeds the future unified inbox).

### Changed
- `CommsService` no longer imports Twilio functions directly — it dispatches via
  the router/adapter and normalizes inbound webhooks through the adapter's event
  model. Inbound normalization/persistence works even when sending isn't
  configured, so a valid inbound message is never discarded.

---

## Unreleased — Unified Communications: Twilio SMS (MVP)

### Added
- **Twilio SMS integration** implementing the Twilio SMS feature spec (MVP /
  Milestones 1–4). A provider-neutral communications layer with a Twilio adapter
  behind it, so email/voice/social channels can be added later.
- **New tables** (migration `0007_*`): `channel_connections` (Twilio config;
  Auth Token stored only as a secret *reference*, never raw), `sms_messages`
  (shared inbound/outbound store with provider SID + idempotency), `customer_comm_preferences`
  (purpose-specific consent), `sms_notification_settings` (per-purpose template +
  on/off), `scheduled_communications` (24h reminder queue), and `comm_audit_events`.
  Added `en-route` to the `job_status` enum.
- **Automated notifications** on job lifecycle: job scheduled (confirmation +
  24h reminder enqueue), cleaner en route, job completed (review request). Each
  send is idempotent (one message per job + purpose + schedule version); a
  Twilio outage never blocks a job write.
- **24-hour reminder scheduler** — an in-process tick worker that claims due
  reminders, re-verifies the job's schedule version + consent, and dispatches.
  Rescheduling recomputes the reminder; cancelling a job cancels pending sends.
- **Consent enforcement at dispatch time**: purpose enablement, per-purpose
  customer consent, and carrier-level suppression are all checked immediately
  before sending; suppressed sends are still recorded with a reason.
- **Webhooks**: inbound SMS (persist + customer association by E.164 +
  STOP/START/HELP keyword handling) and delivery status callbacks (idempotent,
  non-regressing), with Twilio request-signature validation.
- **Routes**: `GET/PUT /integrations/twilio`, `POST /integrations/twilio/{validate,disconnect,test}`,
  `PATCH /integrations/twilio/settings/:purpose`, `GET /customers/:id/messages`,
  `GET/PUT /customers/:id/comm-preferences`, `PATCH /customers/:id/jobs/:jobId`,
  and `POST /webhooks/twilio/{inbound,status}`.
- **Config**: `TWILIO_AUTH_TOKEN`, `PUBLIC_BASE_URL`, `TWILIO_SKIP_SIGNATURE_VALIDATION`
  (dev-only) added to the env schema and `.env.example`.

---

## Phase 2 — Postgres backend + dedicated RDS

### Added
- **`GET /api/v1/home`** — the Home ("Today") view (greeting + Needs-you task
  cards + handled/this-week/today's-cleans summaries), so the UI's last mock
  module could be dropped.
- **Postgres data backend:** a `PostgresRepository` (Drizzle) implementing the
  `Repository` interface, a `db/client`, `db:migrate` + `db:seed` scripts, and a
  generated migration (`drizzle/`). `DATA_BACKEND=postgres` + `DATABASE_URL`
  switches the service onto it. Core resources (customers, partners, deals,
  appointments, conversations) are table-backed; non-tabular aggregations (Home,
  digest, summary headers) are still seed-served (TD-2).
- **Dedicated RDS Terraform** (`infra/terraform`): an `rds` module (subnet
  group, DB security group, `db.t4g.micro` single-AZ Postgres 16 with gp3 +
  storage autoscaling, RDS-managed master secret) and a `dev` environment that
  **reuses the existing corvia VPC + private subnets** (discovered by tag; no
  network inputs required to apply) and reuses the shared state bucket under a
  `pathways-api/` key. Defaults to allowing the VPC CIDR so the first
  migrate/seed works. `fmt`/`validate` clean.
- **Turnkey DB migrator:** an `ecr` module (repo `pathways/api`, scan-on-push +
  lifecycle), a `migrator` module (a one-off Fargate task definition that runs
  the **same API image** with `MIGRATE_CMD` = `migrate` | `seed` |
  `migrate+seed`, assembling `DATABASE_URL` at start from the RDS-managed secret
  so no password lives in the task def/state), and a `github-oidc` module
  (least-privilege `pathways-dev-gha-deploy` role: ECR push + `ecs:RunTask`
  scoped to the cluster + `PassRole` scoped to the migrator roles + read logs).
  The migrator reuses the existing `corvia-dev-cluster` and gets its own SG,
  auto-allowed into the RDS SG. Zero-input apply.
- **GitHub Actions (OIDC, no long-lived keys):** `build-and-push.yml`
  (push-to-`main` → build + push image to ECR, tagged SHA + `dev`) and
  `migrate.yml` (`workflow_dispatch` with a `migrate`/`seed`/`migrate+seed`
  input → build/push, run the migrator task, wait, tail logs; the DB-changing
  job gated behind the `production` Environment).
- **Terraform CI/CD** (mirrors `corvia-digital-services`): `ci.yml`
  (`fmt -check` + `validate` + API typecheck/build on every PR/push) and
  `deploy.yml` (manual `workflow_dispatch`: always `terraform plan` + upload
  artifact, then `terraform apply` of the saved plan gated behind the
  `production` Environment; OIDC, `role-skip-session-tagging`).
- **Optional OIDC deploy role.** The `github-oidc` module is now gated by a
  `create` flag (env var `create_github_oidc_role`, default **false**) so you
  can reuse an existing deploy role instead of creating a duplicate. Added
  `infra/iam/github-oidc-trust-policy.json` — the GitHub OIDC trust statement
  (repo `jeffcruz4/pathways-crm-api`, `main` ref + `production` environment) to
  attach to that existing role.
- Dockerfile now copies the generated `drizzle/` migrations into the runtime
  image so the migrator can apply them.

### Changed
- **The running API now connects to Postgres via discrete `DB_*` parts** (same
  `createDbFromEnv()` path as the migrator), so an RDS-managed password needs no
  URL-encoding. `DATA_BACKEND=postgres` requires **either** `DB_HOST`
  (+ `DB_USER`/`DB_PASSWORD`/`DB_NAME`/`DB_PORT`/`DB_SSLMODE`) **or**
  `DATABASE_URL` (fallback). `src/config.ts` validates for either.
- **Turnkey local Postgres dev loop:** `docker-compose.dev.yml` + scripts
  `db:up` / `db:down` / `db:migrate` / `db:seed` (default to the local DB but
  honor exported `DB_*`) and `dev:pg` (API on :8081, `DATA_BACKEND=postgres`).
  Verified: migrate + seed load the sample dataset and the API serves every
  endpoint from Postgres (`/healthz` → `backend: postgres`).

### Fixed
- **Migrator `Invalid URL` crash with RDS-managed passwords.** The migrate/seed
  scripts now connect via a `createDbFromEnv()` helper that prefers discrete
  `DB_HOST`/`DB_PORT`/`DB_NAME`/`DB_USER`/`DB_PASSWORD`/`DB_SSLMODE` env vars and
  passes them to postgres-js as an options object, instead of interpolating the
  password into a `postgres://…` URL. RDS auto-generated passwords routinely
  contain URL-significant characters (`?`, `:`, `@`, `]`, `$`) that broke
  `new URL()`. The migrator task definition no longer assembles a `DATABASE_URL`;
  `DATABASE_URL` is still honored as a fallback (local dev + the running API).
  Verified end-to-end against local Postgres using the exact failing password.
- Infra README with the apply + turnkey migrate/seed (local `aws ecs run-task`
  and the GitHub workflow) + connect runbook; `.env.example` Postgres examples.

### Verified
- Local Docker Postgres: `db:migrate` + `db:seed` load 7 customers / 5 partners
  / 14 deals / 9 appointments / 1 conversation; the API with
  `DATA_BACKEND=postgres` serves all endpoints from the DB (`/healthz` reports
  `backend: postgres`), including a 404 path.

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
