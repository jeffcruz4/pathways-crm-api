# GoHighLevel Phase 2 — Contacts + Pipeline Repository

Status: **design / blocked on OPEN-1.** Scope: Phase 2 of the GHL migration
(`gohighlevel-migration.md` §7) — back the **customer/contact** and
**quote/pipeline** reads and writes with GoHighLevel, behind the existing
`Repository` seam (`src/data/repository.ts`), without changing routes, domain
schemas, or the UI's `@pathways/api-client` contract.

> **Prerequisites:** Phase 1 (GHL SMS adapter) proven, and **OPEN-1 resolved** —
> GHL contact/opportunity API shapes confirmed against a live account via the
> MCP/API. Everything below maps to GHL concepts that are documented but not yet
> verified here; treat field-level mappings as proposals until OPEN-1 clears.

---

## 1. Strategy — a third Repository implementation, partial by design

`createRepository(config)` (`src/data/index.ts`) selects `memory` or
`postgres`. Phase 2 adds a third path, but with a twist: **GHL only owns a
subset of the `Repository` surface** (contacts/customers + quotes/pipeline).
The proprietary entities (interactions, partners, reviews, team, Cori,
dashboards) stay local until later phases.

Two viable shapes:

- **(A) Composite repository (recommended).** A `CompositeRepository` that
  delegates customer/quote/pipeline methods to a `GoHighLevelRepository` and
  everything else to the existing `PostgresRepository` (or memory). One object
  satisfies the full `Repository` interface; each method routes to the backend
  that owns that data. This lets Phase 2 ship **without** having ported the 🔴
  entities, and makes the DB-collapse (Phase 4) a gradual re-pointing of methods.
- **(B) Full GHL repository.** A single `GoHighLevelRepository` implementing the
  whole interface, with custom-objects behind the proprietary methods. Only
  viable once OPEN-1 confirms custom objects — i.e. Phase 4, not Phase 2.

**Decision: go with (A).** It matches the phased, reversible approach and
isolates risk to the two domains GHL clearly supports.

```
createRepository(config):
  "memory"    -> MemoryRepository
  "postgres"  -> PostgresRepository
  "ghl"       -> new CompositeRepository({
                   customers: new GoHighLevelRepository(ghlClient),
                   pipeline:  new GoHighLevelRepository(ghlClient),
                   rest:      new PostgresRepository(db),  // or memory
                 })
```

A new `GHL_*` config block (location id, token/credential ref, API version)
joins the existing `DATA_BACKEND` switch in `src/config.ts`. Credential
resolution reuses the Phase 1 pattern (PIT or OAuth token; env/secret ref).

---

## 2. Methods GHL takes over in Phase 2

From the `Repository` interface (`src/data/repository.ts`):

| Repository method | GHL operation (VERIFY) | Notes |
|---|---|---|
| `listCustomers()` | Contacts search/list | Map GHL contact → `CustomerListItem`. Pagination + tenant(location) scoping. |
| `getCustomer(id)` | Get contact + related | The **360° assembly** — see §3. Multiple GHL calls. |
| `createCustomer(input)` | Create/upsert contact | `CustomerCreate` → contact fields + custom fields for Pathways-only attributes. |
| `updateCustomer(id, input)` | Update contact | `CustomerUpdate` → partial contact update. |
| `getCustomerStats()` | derived | Compute from contacts/opportunities; likely needs precompute/caching (quota). |
| `addContact(customerId, input)` | contact phone/email fields | Pathways "contacts" (phones/emails) are GHL contact attributes, not separate records. Mapping shift — see §4. |
| `createQuote(customerId, input)` | Create opportunity | `QuoteCreate` → opportunity in the mapped pipeline/stage. |
| `updateQuote(id, input)` | Update opportunity | Pipeline drag-drop status → opportunity stage change. |
| `getPipeline()` | List pipelines + opportunities | Group opportunities by stage → `Pipeline`. |
| `getPipelineStats()` | derived | Aggregate opportunities; compute on read (Q6 carries over). |

**Stays local in Phase 2** (delegated to Postgres/memory by the composite):
`addProperty`/`updateProperty`, `createPlan`, `createJob`/`updateJob`,
`addJobReview`, `listAppointments`/`createAppointment`, `addInteraction`,
service offerings, partners, team members, tasks, notifications, profile,
search, calendar/digest, home, and the entire `comms` sub-repository (Phase 1
handles comms via the adapter, not this repo path).

---

## 3. The 360° customer record — the central challenge

`getCustomer(id)` today returns a fully-assembled `Customer` (identity +
contacts + properties + plans + quotes + jobs + interactions + reviews +
appointments, with on-read rollups like `lifetimeValue`). Postgres does this in
a few queries against one DB. Over GHL it becomes **N API calls across two
backends**:

- identity + contact fields + tags + custom fields → GHL contact
- quotes → GHL opportunities (filter by contact)
- properties / plans / jobs / interactions / reviews / appointments → **local
  Postgres** (still local in Phase 2), joined by a stored `ghlContactId`

This has three consequences to design for:

1. **A stable cross-backend key.** Each local record that belongs to a customer
   needs the customer's **GHL contactId** (or a mapping table `localCustomerId
   ⇄ ghlContactId`). Recommendation: a thin `customer_identity_map` table
   (tenant, localId?, ghlContactId, slug) owned by the composite — the one bit
   of local state that survives until Phase 4. Keeps URLs/slugs working.
2. **Latency + quota.** Several GHL calls per record view. Mitigate with:
   per-request batching, a short-TTL cache on contact reads, and computing
   rollups from already-fetched data rather than extra calls. Treat GHL rate
   limits as a first-class concern (retry/backoff in the GHL client).
3. **Partial-failure semantics.** If GHL is up but Postgres is down (or vice
   versa), decide whether `getCustomer` returns a partial record or errors.
   Recommendation: fail the whole read (consistency) but log which backend
   failed; the composite is the natural place for this policy.

---

## 4. Field-mapping notes (proposals — confirm in OPEN-1)

- **Customer identity.** `displayName`/`firstName`/`lastName`/`companyName` →
  GHL contact name fields. `status` (lead/active/lapsed) and `lifecycleStage`
  → GHL contact custom fields or tags (GHL's own "status" is not our enum).
- **Contacts (phones/emails).** Pathways models multiple `customer_contacts`
  rows with per-contact consent. GHL contacts have primary phone/email + a DND
  model. **Mapping shift:** the richest Pathways consent data may not fully fit
  GHL's contact model; some consent state stays local (ties to OPEN-2). The
  `addContact` method may become "set/replace contact fields" rather than
  "append a row."
- **Tags / goodToKnow / summary / provenance.** → GHL tags + custom fields.
  `provenance`/Cori fields are proprietary → custom fields (or local).
- **Quotes → Opportunities.** `amountCents`/currency → opportunity
  `monetary_value` (GHL expects a decimal; the mapping layer converts from
  integer cents, preserving our internal contract). **Stage/status: see §4a —
  Pathways adopts GHL's stages as the source of truth (Option 2, decided
  2026-11-06), replacing the fixed status enum.** `signal`/`needsYou`/`coriNotes`
  are proprietary → opportunity custom fields or local.
- **Money.** Keep the Q7 integer-cents contract internally; convert at the GHL
  boundary only. Never let GHL's representation leak into the domain types the
  UI consumes.

---

## 4a. Pipeline = GHL stages (Option 2, decided 2026-11-06)

**Decision.** Rather than keep Pathways' small hardcoded stage vocabularies and
flatten GHL's richer funnel onto them (lossy), **Pathways adopts GHL's pipeline
stages as the source of truth.** The pipeline board renders the stages GHL
actually defines; dragging a card sets the opportunity's real stage. This honors
the funnel already built in GHL and avoids lossy round-trips.

**Why (grounded in the live account + the code):**
- The GHL "Client Sales Pipeline" (`j6sBTFNd1C6RHfZQryAg`) has **14 stages** —
  far richer than Pathways' models. Verified live 2026-11-06.
- Pathways currently carries **two** competing stage vocabularies that this
  decision unifies onto GHL:
  - `quoteStatus` (6): draft, sent, follow-up, accepted, declined, expired
    (`src/domain/crm.ts` / db enum).
  - `DealStageId` (5): new, needs-quote, quote-sent, follow-up, booked
    (`src/domain/deal.ts`, the pipeline board).
- Collapsing both onto GHL stage ids removes the double-vocabulary and the
  round-trip data loss Option 1 would have caused.

**Live stage map — Client Sales Pipeline `j6sBTFNd1C6RHfZQryAg`:**

| pos | GHL stage | stage id | GHL `status` on entry |
|---|---|---|---|
| 0 | New Lead | `c5b200f3-1c91-458e-b68c-bcd894a4b868` | open |
| 1 | Contacted - No Response | `0fc97370-b131-49ed-9f19-de4d1f08b01f` | open |
| 2 | Contacted - Call Back OR Pending Action | `0eaa2621-dec5-4fba-b227-00bb99b40dd2` | open |
| 3 | Sent Quote + Interested | `a3bacf24-f957-4ed3-ab0a-b742bda5d1c0` | open |
| 4 | Sent Quote + Interested FU 1 | `bee29f8e-833b-400d-933e-5c8cf6d4babb` | open |
| 5 | Sent Quote + Interested FU 2 | `30f6e5b2-e00b-4763-acbb-5379d5669a50` | open |
| 6 | Sent Quote + Interested FU 3 | `01715748-c051-4871-9c0d-325eda20d72d` | open |
| 7 | Sent Quote + Interested FU 4 | `2b5400b4-f56a-4185-a4d1-5df46f746d71` | open |
| 8 | Booked | `e14fa785-fea8-403d-a0ef-20a7f0302368` | won |
| 9 | Cancelled Booking | `1b717791-9d77-4f28-a682-5a7f1532b3a8` | lost |
| 10 | Lost Lead | `5316b35c-0c5b-49e3-81f7-4cded2b8284c` | lost |
| 11 | Junk/No Contact Lead | `4c37a76c-ec3a-4b20-8ce2-af34875300b5` | abandoned |
| 12 | Went With Other Company | `57850473-47e7-4d0a-855c-586fd8598b4a` | lost |
| 13 | Too Expensive | `73995d27-d28f-4ea0-8b7a-e385dab384b0` | lost |

GHL also has an **opportunity `status`** (open/won/lost/abandoned) independent of
stage; the "GHL status on entry" column above is the sensible default status to
set when a card lands on that stage (confirm/adjust the won/lost/abandoned
mappings with the business — e.g. whether "Too Expensive" should be `lost` vs
`abandoned`). Stages are the primary driver; status is derived.

**Fetch stages dynamically — do not hardcode the 14.** Stage ids are per-pipeline
and will change if the funnel is edited. The GHL repo must read
`GET /opportunities/pipelines` at startup (or on a short TTL) and build the
stage list for the configured `GHL_PIPELINE_ID`. Config carries only the
**pipeline id** (+ optional stage→status override map), not the stage ids
themselves. This keeps Pathways in sync when the business re-orders/renames
stages.

**Impact — this is bigger than Phase 2 alone (cross-repo):**
- **API domain (`pathways-crm-api`):** `src/domain/deal.ts` `DealStageId` and
  `src/domain/crm.ts` `quoteStatus` change from fixed enums to a **dynamic
  stage** shape — `{ stageId: string; stageName: string; position: number;
  ghlStatus: "open"|"won"|"lost"|"abandoned" }`. The pipeline + quote domain
  types, and the `Pipeline`/`PipelineStage` shapes, carry GHL stage ids/labels.
  This is a **breaking domain change** (hence a dedicated migration task).
- **Pipeline routes:** `GET /pipeline` returns GHL-derived stages;
  `PATCH /quotes/:id` (drag-drop) sets `pipeline_stage_id` on the opportunity.
- **UI (`pathways-crm`):** the pipeline board must render **N dynamic lanes**
  from the API (not the 5 hardcoded `DealStageId` lanes), and the quote-status
  chips/filters follow suit. Drag-drop persists a `stageId`. This is a real UI
  change — tracked for the UI repo, sequenced after the API exposes dynamic
  stages. (See the #24/#26 pipeline work in the UI change log — those assumed
  fixed lanes and will need revisiting.)
- **Lifecycle derivation (Q3):** `customers.lifecycleStage` was derived from
  quote status; re-derive it from GHL stage/status instead.

**Non-sales pipelines (note for later phases):** the account also has a **Client
Retention Pipeline** (`CRrwWviGbTqT8fh3hqZn`, 13 stages: New Bookings →
recurring 3/6/9/12mo → Canceled) and a **Cleaner Hiring Pipeline**
(`fkBRCh6egVtFSWJjQoPQ`). The retention pipeline likely maps to Pathways'
**plans/recurring** concept (Phase 3), and hiring maps to team-member
recruitment — out of scope for the quote pipeline but confirms GHL already
models these lifecycles.

---

## 4b. Field-by-field mapping (grounded in live records, 2026-11-06)

Verified against real records on location `Gq6PAsaOatm3iOcpoXAX`: a contact
(`KpwTz7STxYSqRwb0t1Fy`) and opportunities in pipeline `j6sBTFNd1C6RHfZQryAg`
(25 live opportunities). GHL field names below are the **actual** camelCase keys
returned by the v2 API, not assumptions.

### 4b.1 Customer → GHL Contact

Pathways domain: `src/domain/customer.ts` (`Customer`, `CustomerCreate`,
`CustomerUpdate`). GHL object: `contact`.

| Pathways field | GHL contact field | Mapping | Notes |
|---|---|---|---|
| `id` | `id` | via identity map | Pathways id ⇄ GHL `contactId` in `customer_identity_map` (OPEN-7). |
| `name` | `firstName` + `lastName` (`contactName`/`name` on read) | split/join | GHL also maintains `fullNameLowerCase` etc. for search — read-only helpers. |
| `firstName` / `lastName` | `firstName` / `lastName` | direct | — |
| `companyName` | `companyName` | direct | Nullable on both. |
| `phone` | `phone` | direct (E.164) | Live data is already `+1…` E.164. |
| `email` | `email` | direct | Can be null (live lead had null email). |
| *(multiple contacts)* `contacts[]` | `phone`/`email` + **`additionalPhones[]`** / **`additionalEmails[]`** | **RESOLVES prior concern** | GHL *does* support multiple phones/emails per contact — earlier doc assumed primary-only. Pathways `customer_contacts` rows map onto primary + additional arrays. |
| `status` (active/lead/lapsed) | `type` (`lead`/`customer`) + custom field | partial | GHL `type` covers lead vs customer; "lapsed" has no native equivalent → custom field or tag. |
| `stage` (new-lead/quote/booked/recurring) | derived from opportunity stage | derived | Don't store on contact; derive from the opportunity (Q3 + §4a). |
| `tags` | `tags[]` | direct | Live contact had `["fb conversion"]`. |
| `source` | `attributionSource.sessionSource` / `createdBy.sourceId` | read from attribution | GHL auto-captures rich attribution (medium, mediumId, UTM). **Bonus for Cori.** On create, set via contact `source`. |
| `summary` / `goodToKnow[]` / `provenance` | `customFields[]` | custom fields | Proprietary; `customFields` is an array of `{id, value}` on the contact (empty on the live lead — available). `goodToKnow[]` → a MULTIPLE_OPTIONS or serialized TEXT custom field. |
| `preferredContact` | custom field | custom field | No native equivalent. |
| `referredBy` (team/partner) | custom field / association | custom field now; association once partners are custom objects (Phase 4). |
| `notes` | `customFields` or GHL notes API | choose | GHL has a separate notes sub-resource; decide whether `notes` is a field or a note record. |
| `lifetimeValue`, `lastService`, `nextService` | — (derived) | computed on read | Q6 — compute from opportunities/jobs, never stored. |
| `country` | `country` | direct | Live = `"US"`. |
| DND / consent | `dnd` + `dndSettings` (per channel) | see OPEN-2/OPEN-9 | GHL owns suppression; Pathways consent reconciles to it. |

### 4b.2 Quote → GHL Opportunity

Pathways domain: `src/domain/crm.ts` (`Quote`, `QuoteCreate`, `QuoteUpdate`).
GHL object: `opportunity`. Stage handling per §4a (Option 2).

| Pathways field | GHL opportunity field | Mapping | Notes |
|---|---|---|---|
| `id` | `id` | via mapping / direct | GHL opp id. |
| *(owner)* `customerId` | `contactId` (+ `relations[]`) | association | `OPPORTUNITIES_CONTACTS_ASSOCIATION`; `relations[]` carries the linked contact with name/phone/tags inline — useful for list assembly without an extra call. |
| `status` (6-enum) | `pipelineStageId` + `status` | **§4a — stage-driven** | Replace the enum with GHL stage; `status` ∈ open/won/lost/abandoned derived from stage. Live opp: stage `c5b200f3…` (New Lead), status `open`. |
| `amount` (Money, cents) | `monetaryValue` (decimal number) | **cents ↔ decimal convert** | GHL returns a plain number (live = `0`), NOT cents. Convert `cents/100` out, `*100` in. Keep integer-cents internal (Q7, OPEN-11). |
| `detail` | `customFields` | custom field | Proprietary free text. |
| `serviceType` / `frequency` | `customFields` | custom fields | No native opp equivalent; SINGLE_OPTIONS custom fields. |
| `priceUnit` (per-visit/flat) | `customFields` | custom field | — |
| `validUntil` | `customFields` or `forecastExpectedCloseDate` | choose | GHL has a native `forecast_expected_close_date` (DATE) — reasonable home for `validUntil`. |
| `signal` (cori/needs-you/info) | `customFields` | custom field | Proprietary Cori signal. |
| `needsYou` | `customFields` | custom field | Proprietary. |
| `name` | `name` | derive | GHL requires `opportunity.name` (live = contact's name). Compose from customer + service. |
| `source` | `source` | direct | Live = `"Facebook Chat"`. |
| *(assignee)* | `assignedTo` | direct (GHL userId) | Maps to the opportunity owner. |
| *(lost reason)* | `lostReasonId` | optional | GHL has native lost-reason records; could back a declined-quote reason. |
| — | `effectiveProbability` / `forecastProbability` | read-only bonus | GHL computes per-stage win probability (live = 6.67% at New Lead). Available for Cori/forecasting; no Pathways field today. |
| — | `attributions[]` | read-only bonus | UTM/source attribution per opportunity. |

### 4b.3 Shapes & behaviors confirmed live (affect the GHL client)

- **Field casing is camelCase** on opportunities (`monetaryValue`, `pipelineStageId`,
  `contactId`), but the **search endpoint query params are snake_case**
  (`pipeline_id`, `location_id`) and it **rejects** a `locationId` query param.
  The `GhlApiClient` must use the right casing per endpoint.
- **Pagination is cursor-based**: `meta.startAfter` + `meta.startAfterId` +
  `nextPageUrl` (not page numbers). List/assembly code must follow cursors.
- **`monetaryValue` is a decimal number, not cents** — reaffirms OPEN-11.
- **`relations[]` / embedded `contact`** on an opportunity give the linked
  contact inline — the list view can avoid an extra contact fetch per card
  (helps the §3 latency concern).
- **`customFields` is an array** of `{id, value}` on both contact and
  opportunity, and is empty on current records — i.e. all proprietary fields we
  add are greenfield (no collision risk).
- **Attribution is auto-captured** (source/medium/UTM) — richer provenance than
  Pathways tracks today; feed it into `source`/Cori.

---

## 5. What stays the same vs what Option 2 changes

**Stays the same (the win):**
- **Most domain schemas** (`src/domain/customer.ts`, `crm.ts` customer/property/
  plan/job shapes) — unchanged; the GHL repo returns the same Zod-typed shapes.
- **Customer + most routes** (`src/routes/customers.ts`) — unchanged. They call
  `repo.*`; the composite decides the backend.
- **Customer writes** (`createCustomer`, `updateCustomer`) — same methods, so
  the global "New" menu keeps working.

**Changes because of Option 2 (§4a) — do NOT under-sell these:**
- **Pipeline/quote domain types** (`src/domain/deal.ts`, the `quoteStatus` in
  `crm.ts`) move from fixed enums to a **dynamic GHL-stage** shape. Breaking
  change to the contract the UI consumes.
- **Pipeline routes** (`pipeline.ts`, `quotes.ts` PATCH) return/accept GHL stage
  ids instead of the fixed enum values.
- **UI pipeline board** (`pathways-crm`) renders dynamic lanes from the API, not
  the 5 hardcoded `DealStageId` lanes; drag-drop persists a `stageId`. Real UI
  work, sequenced after the API change.

So Option 2 trades a bigger, honest one-time change (unifying the two stage
vocabularies onto GHL) for no round-trip data loss and fidelity to the funnel
already built in GHL. The composite-seam win still holds for everything *except*
the pipeline contract, which intentionally changes.

---

## 6. New surface this phase introduces

1. **`GhlApiClient`** — a small typed wrapper over the GHL v2 REST API
   (contacts, opportunities, pipelines), with auth-header injection, API
   versioning, retry/backoff, and rate-limit handling. The sibling of the
   Phase 1 adapter's low-level functions; consider sharing one GHL HTTP core.
2. **`GoHighLevelRepository`** — implements the §2 methods against `GhlApiClient`
   + the mapping layer.
3. **`CompositeRepository`** — routes each `Repository` method to the owning
   backend; holds the partial-failure policy.
4. **`customer_identity_map`** — the minimal local mapping table (localId ⇄
   ghlContactId ⇄ slug), the only new persistence until Phase 4.
5. **Config** — `GHL_LOCATION_ID`, `GHL_TOKEN`/credential ref, `GHL_API_VERSION`,
   `GHL_PIPELINE_ID` (the sales pipeline to use; `j6sBTFNd1C6RHfZQryAg` on the
   current account) + an optional **stage→GHL-status override map**. Stage ids
   themselves are fetched live from GHL, not configured (§4a).

---

## 7. Risks specific to Phase 2

- **Dynamic-stage contract change (Option 2).** Adopting GHL stages (§4a) is a
  breaking change to the pipeline/quote domain types and the UI board. Sequence
  it as its own migration task: API emits dynamic stages first, then the UI
  switches to dynamic lanes. Validate the configured `GHL_PIPELINE_ID` resolves
  and has stages at startup; fail loud if not.
- **Stage drift.** Because stages are fetched live, a business edit to the GHL
  funnel changes the board automatically — good for fidelity, but any
  Pathways-side logic keyed on a specific stage (e.g. "Booked" → won) must key
  on a stable signal (the stage→status map), not a stage name/id that can move.
- **Search.** `search()` stays local in Phase 2 (delegated), but once customers
  live in GHL, global search over customers needs GHL contact search — flag for
  Phase 3/4.
- **Stats endpoints.** `getCustomerStats`/`getPipelineStats` become API-side
  aggregation over GHL data; naive implementations will blow quota. Precompute
  or cache.
- **Idempotency on create.** Avoid duplicate GHL contacts/opportunities on
  retry — use GHL upsert semantics (VERIFY) keyed on email/phone, and record the
  mapping before returning.
- **Dual-write drift (transition).** If any customer data is briefly written to
  both backends during cutover, define the source of truth per field up front.

---

## 8. Open items (Phase 2-specific; see migration doc for OPEN-1..5)

| ID | Item | Status |
|---|---|---|
| OPEN-6 | Confirm GHL contact + opportunity + pipeline API shapes, upsert semantics, and rate limits. | **🟡 READ confirmed live; WRITE documented-not-verified (2026-11-06).** Read shapes verified live (§4b). Write bodies + upsert dedupe documented from GHL's published v2 docs in `gohighlevel-phase2-scaffolding.md` §6a, **not** live-tested — no sandbox on the current single-account GHL plan, and writing to the live account risks firing create-triggered workflows at real customers. **Still open:** live write verification (run the sandbox probe via `tools/ghl-mcp/server-write.mjs` after a plan upgrade) + published rate limits. |
| OPEN-7 | Decide the customer↔contact key strategy (mapping table vs storing ghlContactId on local rows). | Open — leaning mapping table (`customer_identity_map`) per §3. |
| OPEN-8 | Lock the quote-status → GHL stage map and the pipeline to use. | **✅ RESOLVED (2026-11-06): Option 2** — adopt GHL stages as source of truth; use Client Sales Pipeline `j6sBTFNd1C6RHfZQryAg`; fetch the 14 stages live (don't hardcode); see §4a. Remaining sub-item: confirm the per-stage won/lost/abandoned status map with the business. |
| OPEN-9 | Consent data that doesn't fit GHL's contact/DND model — keep local or drop (ties to OPEN-2). | Open — note (2026-11-06): GHL contacts have native `additionalPhones[]`/`additionalEmails[]` + `dnd`/`dndSettings`, so more of `customer_contacts` fits than first assumed; per-purpose Pathways consent is the part that may stay local. |
| OPEN-10 | Partial-failure policy for cross-backend reads in `CompositeRepository`. | Open |

---

## 9. Suggested build order (within Phase 2)

1. `GhlApiClient` (contacts read-only first) + config + startup validation of
   the pipeline/stage map.
2. `CompositeRepository` wrapping the existing Postgres repo, delegating
   everything (no behavior change) — a safe no-op refactor to land the seam.
3. Route `listCustomers` + `getCustomer` (read path) through
   `GoHighLevelRepository`, backed by the identity map; keep local sub-resources.
4. Add customer writes (`createCustomer`/`updateCustomer`) with upsert +
   idempotency.
5. Quotes/pipeline read, then write (drag-drop stage change).
6. Stats (cached/precomputed) last.

Each step is independently shippable and reversible by re-pointing the composite
back to Postgres.

---

## References

- Seam: `src/data/repository.ts`, `src/data/index.ts`,
  `src/data/postgresRepository.ts` (assembly pattern to mirror).
- Domain contracts: `src/domain/customer.ts`, `src/domain/crm.ts`,
  `src/domain/deal.ts`.
- Routes unchanged: `src/routes/customers.ts`, `quotes.ts`, `pipeline.ts`.
- Phase 1: `gohighlevel-adapter-sketch.ts`. Overview: `gohighlevel-migration.md`.
- Scaffolding (GhlApiClient + CompositeRepository + routing table):
  `gohighlevel-phase2-scaffolding.md`.
