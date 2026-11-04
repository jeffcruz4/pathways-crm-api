# Change Log — Pathways CRM API

A PR-by-PR ledger of what shipped, newest first. This complements the curated
`CHANGELOG.md` (grouped by phase) with a flat, chronological record of every
merged pull request. PR numbers reference `jeffcruz4/pathways-crm-api`.

---

## Session — Oct 30 → Nov 3, 2026

Stood the API up from a read-only `/home` scaffold to a relational,
multi-tenant CRM backend with create endpoints, a dedicated RDS instance, and a
turnkey deploy + local-dev story.

### #22 · team spotlight + partner highlights stats
*(pending)*
- `GET /team-members/stats`: filter-tab counts (total / active / on-leave /
  inactive) + a **spotlight** of the most recent reviews attributed to team
  members (review → job → assigned team member, newest first).
- `GET /team-members` items gain derived rollups: `jobsCompleted`,
  `reviewCount`, `avgRating` (1 decimal) for the profile cards / table.
- `GET /partners/stats`: highlights — **top producer** (revenue brought in via
  covered jobs + referred customers, each job counted once per partner),
  **top rated** (best average review rating among contractors), and **total
  revenue** through partner relationships (de-duplicated by job across
  partners), plus how many partners are producing.
- Pure helpers in `assemble.ts` (`teamMemberRollups`, `assembleTeamStats`,
  `assemblePartnerHighlights`) shared by both backends. Static `/stats` paths
  are matched ahead of `/partners/:id`.
- Seed: a second contractor (SparkClean Crew) with jobs, plus 10 more reviews
  with varied ratings/text so the spotlight and "highest rated" are real.

### #21 · customer interactions log (table + endpoint)
*(pending)*
- New `interactions` table (migration `0001_volatile_veda`): `type`
  (`unplanned | formal-meeting | complaint | compliment`), `method`
  (`call | text | email | dm`), optional `note`, `occurredAt`, and an optional
  handler (team member or partner). Indexed by customer and by tenant+time.
- Contracts: `Interaction` / `InteractionCreate` (+ enums) in `domain/crm.ts`;
  `Customer.interactions` (newest first) so the 360° record carries the log.
- Repository (both backends): `addInteraction`; interactions load into the
  customer bundle and handler names resolve like job assignees.
- Route: `POST /customers/:id/interactions` (Zod-validated; 400 on a bad
  enum, 404 on an unknown customer).
- Seed: 8 sample interactions telling realistic stories (a complaint that
  preceded a lapse, compliments from regulars, unplanned inbound inquiries).

### #20 · global keyword search endpoint
*(pending)*
- `domain/search.ts`: `SearchResults` (grouped `SearchHit`s with a `type`
  discriminator, title/subtitle, and an in-app `href`); `SearchEntityType`
  spans all objects.
- `assemble.ts`: pure `searchCorpus(corpus, query)` — case-insensitive substring
  match across customers (name/tags/summary/contacts), partners, team members,
  catalog, jobs, quotes, plans, properties, appointments. Work entities resolve
  to their customer record via `href`; per-group cap of 8.
- Repository (both backends): `search(query)` gathers the corpus and delegates
  to the shared matcher.
- Route: `GET /search?q=` (empty query → empty results, not an error).
- Keyword-only; the contract is stable so semantic search can slot in later.

### #19 · partner record — real rollups, related entities, edit
*(pending)*
- `domain/partner.ts`: dropped the non-DB-backed `employment` block and the
  empty `activity` array; exposed `email`/`phone`/`skills`/`commissionBps`/
  `notes`; added derived `relatedCustomers` (referred ∪ served, with per-customer
  jobs-covered + relationship) and `relatedJobs`; added `PartnerUpdate`.
- `assemble.ts`: `partnerRelations(referred, covered, customerById)` — one pure
  helper computing rollups (leadsGenerated = referred count, jobsCovered =
  covered count, value = Σ completed covered-job prices) + the related lists.
  `partnerListItem`/`partnerDetail` now take the computed values.
- Repository (both backends): `listPartners`/`getPartner`/`createPartner` derive
  rollups; added `updatePartner`.
- Routes: `PATCH /partners/:id` (Zod-validated, 404 when missing).
- Fix: guard partner/customer id lookups with a UUID check (`isUuid`) so a
  non-UUID path param returns 404 instead of a Postgres 500 ("invalid input
  syntax for type uuid").

### #18 · edit customer + edit property (PATCH)
*(pending)*
- `domain/customer.ts`: `CustomerUpdate` (partial — identity + status/stage,
  summary, tags, goodToKnow, notes).
- `domain/crm.ts`: `PropertyUpdate` (partial — address + home facts + primary).
- Repository (both backends): `updateCustomer(id, input)` and
  `updateProperty(customerId, propertyId, input)`. Property edits are scoped to
  the customer (can't edit another customer's property); promoting a property to
  primary demotes the customer's other properties so exactly one stays primary.
- Routes: `PATCH /customers/:id` and `PATCH /customers/:id/properties/:propertyId`
  (Zod-validated, 404 when the customer/property isn't found).
- Unblocks the Customer Record restructure: hero edit-customer action and the
  Home Details "Edit" → edit-property flow.

### #17 · customer dashboard stats endpoint + seed date-spread
*(pending)*
- `domain/customer-stats.ts`: `CustomerStats` contract — per-status counts
  (total/active/lead/lapsed), lifetime + average LTV (`Money`), 90-day signups
  trend (one zero-filled point per day), 6-month revenue trend (completed-job
  revenue by month), and pending-vs-completed job mix.
- `assemble.ts`: pure `assembleCustomerStats(customers, jobs, now)` so both
  backends share one implementation (fetch rows, reduce in JS — existing
  convention).
- Repository (both backends): `getCustomerStats()`.
- Route: `GET /customers/stats` — registered before `/customers/:id` and matched
  ahead of it by Fastify's router, so "stats" is never read as an id.
- `memoryRepository`: honor the seed's explicit `createdAt` on customers (was
  always overwriting with `now()`), so signups-trend parity matches Postgres.
- Seed: customers get `createdAt` spread across ~6 months; recurring customers
  get a steady weekly cadence of completed jobs (24 jobs total) so the trend
  and revenue charts have real shape.

### #11 · cleaners CRUD + partner create + worker list endpoints
*(merged 2026-11-03)*
- `domain/cleaner.ts`: `Cleaner` / `CleanerListItem` / `CleanerCreate`.
- `domain/partner.ts`: add `PartnerCreate`.
- Repository (both backends): `listCleaners`, `createCleaner`, `createPartner`;
  shared `partnerListItem` / `partnerDetail` mappers in `assemble.ts`.
- Routes: `GET`/`POST /cleaners`, `POST /partners` (Zod-validated).
- Memory backend keeps mutable cleaner/partner stores so created workers persist
  in-process and resolve as job assignee names.
- Unblocks the UI's worker picker and worker creation. (Job assignment itself
  already worked via `createJob` + the DB CHECK.)

### #10 · 360° customer record + create endpoints
*(merged 2026-11-03)*
- Contracts: `domain/money.ts` (integer-cents `Money` + formatter), `domain/crm.ts`
  (Contact/Property/Plan/Quote/Job+Review output + `*Create` inputs); `Customer`
  extended with `contacts`/`properties`/`plans`/`quotes`/`jobs` +
  `lifetimeValueMoney`, with presentation fields (phone/location/plan/last-next
  service/home details) now **derived on read**.
- Repository rewritten onto the relational schema: assembles the record from
  related tables (`assemble.ts`), resolves worker names, pipeline = quotes
  grouped by status, calendar from appointments; memory backend keeps an
  in-memory relational store with the same assembly.
- Routes: `POST /customers` + nested `POST /customers/:id/{contacts,properties,
  plans,quotes,jobs}` and `/jobs/:jobId/review`; CORS now allows writes.
- Seed: `data/seedRelational.ts` (7 customers with contacts/properties/plans/
  quotes/jobs/reviews, 2 cleaners, 2 partners, offerings); `db/seed-db.ts`
  inserts it FK-safe.

### #9 · relational customer data model — schema + migration
*(merged 2026-11-03)*
- `src/db/schema.ts` rewritten to the approved 12-table model: `tenants`,
  `customers`, `customer_contacts`, `properties`, `service_offerings`, `plans`,
  `quotes`, `jobs`, `appointments`, `job_reviews`, `cleaners`, `partners`.
- UUID PKs + per-tenant slug, `tenant_id` everywhere, integer cents, real
  date/timestamptz, consent on contacts, quotes replace deals, appointments
  separate from jobs, worker assignment via `assignee_type` + two nullable FKs
  (CHECK-enforced), one review per job (CHECK rating 1–5).
- Regenerated Drizzle migration; verified it applies to a fresh Postgres and the
  CHECK constraints enforce. Design doc: `docs/design/customer-data-model.md`.

### #8 · one-command local stack script
*(merged 2026-11-03)*
- `scripts/run-local-stack.sh`: Postgres (compose) → migrate + seed → DB-backed
  API on :8080 → UI on :5173, then returns (hook-friendly). `stop`/`down`
  subcommands; re-runs are idempotent.

### #7 · discrete `DB_*` connection + turnkey local Postgres dev loop
*(merged 2026-11-03)*
- Running API connects via discrete `DB_*` parts (`createDbFromEnv`), falling
  back to `DATABASE_URL`; `DATA_BACKEND=postgres` accepts either.
- `docker-compose.dev.yml` + `db:up`/`db:down`/`dev:pg` scripts.

### #6 · fix migrator `Invalid URL` on RDS passwords
*(merged 2026-11-02)*
- migrate/seed connect via discrete `DB_*` (postgres-js options object) instead
  of interpolating an RDS-managed password into a URL (which broke `new URL()`).

### #5 · strip whitespace from ECR/migrator repo vars
*(merged 2026-11-02)*
- Fixed the `Invalid format ':<sha>'` build failure caused by a trailing newline
  in the `ECR_REPOSITORY` GitHub variable; strip `[:space:]` before use.

### #4 · fix build-and-push output error + tidy deploy inputs
*(merged 2026-11-02)*
- `build-and-push.yml` fails fast with a clear message on a missing
  `ECR_REPOSITORY`; dropped the unused OIDC-provider input from `deploy.yml`.

### #3 · Terraform validate + approval-gated apply workflows
*(merged 2026-11-02)*
- `ci.yml` (`fmt`/`validate` + API build) and `deploy.yml` (plan always, apply
  gated behind the `production` environment); OIDC auth. Made the stack's OIDC
  deploy role optional so an existing role can be reused; added
  `infra/iam/github-oidc-trust-policy.json`.

### #2 · Postgres backend + dedicated RDS + turnkey migrator/CI
*(merged 2026-11-02)*
- `PostgresRepository` (Drizzle) + migrations/seed; dedicated RDS Terraform
  reusing the corvia VPC/subnets/cluster (zero-input apply); one-off ECS
  migrator task; ECR; GitHub OIDC deploy role; `build-and-push.yml` +
  `migrate.yml` workflows.

### #1 · `/home` endpoint + read-only API scaffold
*(merged 2026-10-30)*
- Fastify + TypeScript service (config-first, CORS, health, graceful shutdown);
  Zod domain models; read-only `/api/v1` endpoints (customers, partners,
  pipeline, conversations, calendar, digest, home); `MemoryRepository`; Drizzle
  schema; Dockerfile.
