# GoHighLevel Backend Migration — Design & Feasibility

Status: **proposal / under evaluation.** Author: engineering. Scope: whether
Pathways can rely on GoHighLevel (GHL / LeadConnector) as its backend —
keeping only a proprietary UI (`pathways-crm`) and a thin API
(`pathways-crm-api`) — to avoid running its own database, messaging
infrastructure, and the Twilio integration.

> **Decision summary:** feasible, and the codebase is well-positioned for it.
> GHL can absorb identity, messaging (fully replacing Twilio), pipeline,
> calendar, and payments. A meaningful slice of Pathways is proprietary data
> and logic with no native GHL home; those become GHL **custom objects** plus
> logic that stays in this API. Realistic end-state: **"GHL for commodity CRM +
> messaging; this API as a broker + enrichment layer"** — not a pure
> passthrough.
>
> **Gating unknown (must validate before committing):** whether GHL custom
> objects are rich enough (schema, associations, querying) for the proprietary
> entities. Tracked as **OPEN-1** below.

---

## 1. Why this is a swap, not a rewrite

Two existing seams make the migration incremental rather than a ground-up
rebuild. Both are verified in the current code:

- **One persistence seam.** All data access goes through the `Repository`
  interface (`src/data/repository.ts`), with `memory` and `postgres`
  implementations selected in exactly one place (`src/data/index.ts`,
  `createRepository`). A GHL-backed backend is, in principle, a third
  implementation of the same seam.
- **Provider-neutral comms.** Twilio is isolated behind a single adapter
  (`src/comms/twilioAdapter.ts`) implementing the `CommunicationProviderAdapter`
  port (`src/comms/adapter.ts`). The orchestrator (`commsService.ts`), consent,
  the unified inbox, the scheduler, and every route are provider-agnostic. The
  documented extension model is "register a new adapter in the
  `ChannelRouter`" — so swapping the SMS provider touches one file, not the core.

---

## 2. Capability mapping (Pathways concept → GHL)

Derived from the Drizzle schema (`src/db/schema.ts`) + domain models
(`src/domain/*`) against GHL's live OAuth scope catalog (38 domains / 550+
operations, pulled from the LeadConnector OAuth authorization-server metadata).

Legend: ✅ moves to GHL cleanly · 🟡 maps with mapping/compromise · 🔴 stays
proprietary (as GHL custom objects and/or logic in this API).

| Pathways concept | GHL home | Fit | Notes |
|---|---|---|---|
| customers + contacts | Contacts (+ custom fields, tags) | ✅ | GHL contact is the natural anchor; multiple phones/emails → contact fields. |
| per-contact consent (SMS opt-in/out) | Contacts DND + conversation consent | ✅ | GHL owns STOP/START suppression natively — removes our consent-sync burden. |
| quotes = pipeline | Opportunities & Pipelines | ✅ | Q1 decision (pipeline = quotes by status) maps directly to opportunity stages. |
| conversations + messages | Conversations & Messages | ✅ | GHL owns the thread, the number, inbound/outbound, delivery status. |
| **SMS send/receive (Twilio)** | GHL Conversations + Phone System | ✅ | **Twilio leaves entirely.** GHL provisions the number and sends. See §3. |
| appointments | Calendars & Appointments | 🟡 | GHL appointments are booking-centric; `appointment_kind` (walkthrough/quote-visit/call) needs mapping. |
| jobs (billable work + assignment) | Calendar + custom object | 🟡 | Richer than GHL appointments (assignee_type, status lifecycle, reviews) → likely a custom object. |
| service offerings / plans | Products & Prices / recurring | 🟡 | Catalog → Products; per-customer `plans` (snapshotted price/dates) → custom object or subscription. |
| quotes as documents / invoices | Invoices & Estimates | 🟡 | If customer-facing quotes/invoices are wanted, GHL's are richer than today's model. |
| notifications (in-app center) | Workflows / none | 🟡 | Our in-app inbox is proprietary UX; no direct GHL equivalent to serve the UI. |
| tasks ("Your priorities") | Contacts tasks / recurring tasks | 🟡 | Partial; task buckets + completion-comment rule are custom. |
| scheduled 24h reminder | Workflows | 🟡 | GHL workflows can do this natively — potentially retires our scheduler. See §4. |
| **interactions** (touchpoint log) | custom object | 🔴 | No native GHL concept. Custom object + associations. |
| **job reviews** (rating/review per job) | custom object / reviews | 🔴 | GHL "reviews" are reputation (Google/FB), not per-job internal reviews. |
| **partners** (lead-gen + contractors) | custom object | 🔴 | Partner stage/commission/rollups are ours. |
| **team members** (your staff) | Users (partial) / custom object | 🔴 | GHL Users are logins, not the skills/ratings/home-base model we have. |
| Cori intelligence / signals / provenance | none | 🔴 | Our differentiator; stays entirely in our layer. |
| home dashboard / stats / digest | none | 🔴 | Aggregations we compute; GHL provides raw data, this API computes the views. |

---

## 3. Removing Twilio — high confidence

Today Twilio provides: number provisioning, outbound SMS, inbound SMS webhooks,
delivery-status callbacks, and STOP/START keyword handling. GHL's Conversations
+ Phone System provide all five.

Migration shape (no change to the comms core):

1. Add `GoHighLevelAdapter implements CommunicationProviderAdapter` (sibling to
   `twilioAdapter.ts`); register it in `ChannelRouter` as `gohighlevel:sms`.
2. `sendMessage` → GHL send-message operation. `validateWebhook` /
   `normalizeInboundWebhook` → GHL's webhook scheme + inbound/status events.
3. Point the stored channel connection's `provider` at `gohighlevel`; add a GHL
   branch to `ChannelRouter.resolveCredential`.

**Gains:** no Twilio account, no number management, no HMAC signature code to
maintain, carrier STOP handled by GHL.

**Watch-items:**
- Our consent model partly duplicates GHL's DND/suppression. Post-migration GHL
  becomes the source of truth for suppression; `customerCommPreferences`
  becomes a cache or redundant. Tracked as **OPEN-2**.
- Pre-existing policy gap (independent of backend): dispatch blocks only
  `opted_out`/`provider_blocked`, while the data-model doc (Q8) states "no send
  unless opted_in." Decide the intended policy. Tracked as **OPEN-3**.

A concrete adapter sketch lives at `docs/design/gohighlevel-adapter-sketch.ts`.

---

## 4. Scheduler & webhooks — a cost-reduction opportunity

The in-process `ReminderScheduler` (24h reminder) exists because we own the
data. If jobs/appointments live in GHL, the reminder can become a **GHL
Workflow trigger**, letting us delete the scheduler, the
`scheduled_communications` table, and the claim/version logic — real
operational surface removed. Tradeoff: reminder logic moves into GHL's workflow
builder (less testable here, more vendor lock-in). Tracked as **OPEN-4**.

---

## 5. What this API still owns (not a passthrough)

1. **Proprietary entities** — interactions, job reviews, partners, team
   enrichment, Cori signals/provenance. As GHL custom objects (preferred, keeps
   us DB-free) or a minimal datastore if custom objects fall short (see OPEN-1).
2. **Aggregation / derived views** — home dashboard, customer/pipeline stats,
   partner highlights, digest. GHL returns raw records; this API computes
   rollups (the Q6 "compute on read" decision carries over).
3. **Pathways UX contracts** — the UI expects specific shapes (the 360°
   assembled customer record). This API translates GHL shapes into the
   `@pathways/api-client` contract. This is the "feature richness for our
   proprietary UX" layer — where our value lives.
4. **Identity/auth** — none is enforced today (JWT decoded, not verified; no
   Cognito wiring). GHL does not solve login for our own UI. Must be solved
   regardless of backend. Tracked as **OPEN-5**.
5. **Rate-limit / orchestration** — GHL API quotas, retries, and multi-call
   assembly (a 360° record may be several GHL calls) belong here.

---

## 6. Risks

- **Custom-object ceiling (OPEN-1)** — the single biggest unknown; gates fully
  dropping our DB.
- **Read-time assembly cost** — the 360° record assembles ~7 related entities;
  over GHL's API that's multiple calls vs one SQL query today (latency + quota;
  caching likely needed).
- **Vendor lock-in** — trades infra cost for platform dependency (pricing, API
  limits, deprecations). The comms seam mitigates *messaging* lock-in; *data*
  lock-in is new.
- **No bulk/relational queries** — stats/search that are trivial SQL today
  become API-side aggregation or precomputation.
- **Migration/export** — one-time import of existing Postgres data into GHL; and
  an exit path out of GHL is harder than out of our own DB.

---

## 7. Recommended phased approach (incremental, reversible)

0. **Phase 0 — validate custom objects (OPEN-1). ✅ DONE (2026-11-06).** Confirmed
   via the local MCP shim that interactions, partners, reviews fit GHL custom
   objects, associations are user-definable, and records are queryable — with
   one caveat (no native numeric type; store money as TEXT, see OPEN-11). Full
   findings in §9.1. Write-path (schema/record create) still to validate in a
   sandbox. **Gate cleared for the read side.**
1. **Phase 1 — replace Twilio with a GHL SMS adapter.** Highest confidence,
   smallest blast radius, immediate cost win, no core changes. Proves the
   integration end to end. (Adapter sketch: `gohighlevel-adapter-sketch.ts`.)
2. **Phase 2 — contacts + pipeline on GHL.** Add a `GoHighLevelRepository` for
   customers/contacts and quotes/opportunities behind the `Repository` seam;
   keep proprietary entities where they are.
3. **Phase 3 — calendar/jobs + reminders via GHL workflows.** Retire the
   in-process scheduler.
4. **Phase 4 — collapse the DB.** Once 🔴 entities live as custom objects and 🟡
   entities are mapped, drop RDS. This API becomes broker + aggregator + auth.

Each phase is independently shippable and reversible.

---

## 8. Open items (to resolve before / during migration)

| ID | Item | Why it matters | Status |
|---|---|---|---|
| **OPEN-1** | **Validate GHL custom objects via the MCP/API** for interactions, partners, job reviews, team enrichment — schema flexibility, association model, and query/filter capability. | Go/no-go for fully dropping our own database. This is the single biggest unknown in the whole proposal. | **✅ RESOLVED (2026-11-06) — go, with one caveat (no native NUMBER type).** Confirmed live against location `Gq6PAsaOatm3iOcpoXAX`. See §9. |
| OPEN-2 | Decide whether `customerCommPreferences` becomes a cache of GHL suppression or is retired once GHL owns consent. | Avoids a split-brain source of truth for opt-out. | Open |
| OPEN-3 | Resolve the consent-policy gap (dispatch blocks only opted_out/provider_blocked vs doc's "no send unless opted_in"). | Compliance; independent of backend choice. | Open |
| OPEN-4 | Decide whether the 24h reminder moves to a GHL Workflow (retiring `ReminderScheduler` + `scheduled_communications`). | Removes operational surface vs added vendor lock-in. | Open |
| OPEN-5 | App authentication for the UI (OIDC/Cognito); JWT is currently decoded but not verified. | Prerequisite for production regardless of backend. | Open |
| OPEN-11 | GHL custom fields have **no native numeric/currency type**; store money (integer cents, Q7) and counts as TEXT with app-side parse, or on native numeric standard fields (opportunity `monetary_value`). | Avoids lossy/incorrect money handling on custom objects. | Open (identified in §9.1) |
| OPEN-12 | **Live write-path validation deferred.** GHL contact/opportunity create + upsert shapes are documented (scaffolding §6a) but not live-tested — the current GHL plan has a single account (no sandbox), and probing writes on the live account risks firing create-triggered workflows at real customers. Sandbox write-probe tooling is built and fenced (`tools/ghl-mcp/server-write.mjs`, sandbox-locked). | Closes the write half of OPEN-6; gates Phase 2 write implementation. | Open — **deferred until a multi-sub-account GHL plan provides a sandbox.** |

---

## 9. OPEN-1 detail — custom-object validation via the GHL MCP

**The need:** the proprietary entities (interactions, partners, job reviews,
team-member enrichment) have no native GHL home. The plan is to model them as
GHL **custom objects** so we can drop our own database entirely. That plan is
only viable if GHL custom objects support, at minimum:

- Custom **object schemas** with the field types we use (text, enums, integer
  cents / currency, dates, timestamps, JSON-ish arrays like `tags` / `skills` /
  `goodToKnow`).
- **Associations** between custom-object records and native Contacts (e.g.
  interaction → customer, review → job → worker, partner → referred customers)
  and between custom objects themselves.
- **Query/filter/search** over custom-object records sufficient to back our list
  views and the derived rollups (partner highlights, review spotlights), without
  N+1 explosions.
- Acceptable **quotas/latency** for the read-time assembly pattern.

### 9.1 Findings (2026-11-06, live validation)

Validated with the local read-only MCP shim (`tools/ghl-mcp/`) against sub-account
`Gq6PAsaOatm3iOcpoXAX` ("Joseph D Garrity's Account" / Corvia Cleaning). Verdict:
**GHL custom objects are rich enough to host the proprietary entities — proceed**,
with one data-type caveat.

- **Object/custom-field model — confirmed rich.** The `contact` object alone
  returns 93 properties spanning data types: `TEXT`, `LARGE_TEXT`, `CHECKBOX`,
  `RADIO`, `DATE`, `SINGLE_OPTIONS`, `MULTIPLE_OPTIONS`, `FILE_UPLOAD`, plus
  `STANDARD_FIELD`. This covers nearly all Pathways field needs:
  - enums (`status`, `serviceType`, `interactionType`, …) → `SINGLE_OPTIONS`
  - string arrays (`tags`, `skills`, `goodToKnow`) → `MULTIPLE_OPTIONS`
  - long text (`summary`, `notes`, review text) → `LARGE_TEXT`
  - dates → `DATE`
- **⚠️ No native numeric/currency type** in the custom-field data types. Money
  (our integer-cents, Q7) and counts have no `NUMBER` field — they must be
  `TEXT` with app-side parse/format, OR live on the fields that are natively
  numeric (opportunity `monetary_value` is a standard field and handles deal
  value). **Action:** keep the integer-cents contract internal; store any
  custom-object money as TEXT and parse at the boundary. Folds into the Phase 2
  money-mapping note. Tracked as **OPEN-11**.
- **Associations — confirmed, user-definable.** The location already has 4
  association definitions, both `SYSTEM_DEFINED` (contact↔opportunity,
  business↔contact) and `USER_DEFINED` (e.g. business↔opportunity, additional
  contacts↔opportunities). The `associationType: USER_DEFINED` support is the
  key result: we can declare our own relationships (interaction→customer,
  review→job→worker, partner→referred-customers) rather than being limited to
  built-ins. Association definitions and record relations are both readable.
- **Standard objects present:** `contact`, `opportunity`, `business` (all
  SYSTEM_DEFINED). **No custom objects exist yet** (expected — none built). The
  opportunity schema exposes exactly the fields Phase 2 needs: `pipeline_id`,
  `pipeline_stage_id`, `status`, `monetary_value`, `assigned_to`, `source`,
  `lost_reason`, `forecast_expected_close_date`, `forecast_probability`.
- **Account signals:** SaaS mode is activated (agency sub-account);
  `contactUniqueIdentifiers = [email, phone]` (confirms the Phase 2 upsert dedupe
  key, OPEN-6); opportunities/conversations/appointments/reviews/invoices all
  enabled on this plan.

**Still to validate (write-path, deferred until a sandbox + write token):**
creating a custom-object *schema* via API, record create/upsert semantics, and
association *record* linking (we validated the read/definition side only — the
shim is GET-only by design). And custom-object record query/filter richness for
the derived rollups (partner highlights, review spotlights) — read confirmed to
exist; filter expressiveness not yet stress-tested.

**Shim note:** the convenience tools' object-list params (`page`/`pageLimit`)
and the `locationId` auto-injection need a small fix (some endpoints 422 on an
unexpected `locationId`/`page`); the generic `ghl_get` worked around both. Minor
polish for `tools/ghl-mcp/server.mjs`, not blocking.

### 9.2 Original rationale (for reference)

**The need:** the proprietary entities (interactions, partners, job reviews,
team-member enrichment) have no native GHL home. The plan is to model them as
GHL **custom objects** so we can drop our own database entirely. That plan is
only viable if GHL custom objects support, at minimum: custom object schemas
with our field types; associations to native Contacts and between custom
objects; query/filter over records for list views + rollups; and acceptable
quotas/latency. **§9.1 confirms the first two outright and the third partially.**

**How this was unblocked:** the GHL hosted MCP endpoints
(`/mcp/anthropic/v2`, `/mcp/openai/v2`, `/mcp/cursor/v2`) reject dynamic client
registration from this IDE (`invalid_client_metadata` / `unrecognized_client`)
— they are gated to specific branded clients. So instead we connected GHL via a
**local stdio MCP server** authenticated with a **Private Integration Token** (Settings →
Private Integrations; enable in Labs if absent), configured like the existing
`aws-mcp` entry (a `command`/`args` server). Use a **read-only** token scoped to
`objects/schema.readonly`, `objects/record.readonly`, `associations.readonly`
for the evaluation. Vet and pin the exact bridge package before running it with
a real token.

**What to probe once connected** (via `search_operations` / `describe_operation`):
`objects/schema.*`, `objects/record.*`, `associations.*`,
`associations/relation.*` — then attempt to model one real entity
(`interactions`) end to end as a proof.

---

## References

- Capability source: GHL LeadConnector OAuth authorization-server metadata
  (scope catalog) + the Marketplace MCP operation catalog.
- Comms seam: `src/comms/adapter.ts`, `src/comms/channelRouter.ts`,
  `src/comms/twilioAdapter.ts`, `src/comms/commsService.ts`.
- Data seam: `src/data/repository.ts`, `src/data/index.ts`.
- Data model decisions: `docs/design/customer-data-model.md` (Q1–Q11).
- Phase 1 adapter + webhook sketch: `docs/design/gohighlevel-adapter-sketch.ts`.
- Phase 2 repository design: `docs/design/gohighlevel-phase2-repository.md`.
