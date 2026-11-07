# GoHighLevel Phase 2 — Scaffolding Design (GhlApiClient + CompositeRepository)

Status: **design, execution-ready for the read path.** Companion to
`gohighlevel-phase2-repository.md` (strategy + field mapping). This doc makes the
§9 build order concrete: the `GhlApiClient` surface, the `CompositeRepository`
method-routing table, the identity map, config, and startup validation. Grounded
in the live-verified shapes in that doc's §4b and the real `Repository` interface
(`src/data/repository.ts`).

> Scope guard: the **read path is fully specified** from confirmed live data.
> The **write path** (create/update/upsert) is specified from documented
> conventions but marked `VERIFY` — it is gated on the OPEN-6 sandbox check
> (this repo's "B" task). Do not implement writes against production until that
> clears.

---

## 1. Module layout (new files under `src/data/ghl/`)

```
src/data/ghl/
  GhlApiClient.ts        # typed, auth-injecting HTTP wrapper (the only fetch surface)
  ghlConfig.ts           # GHL_* config parse/validate (joins src/config.ts)
  mapContact.ts          # Customer ⇄ GHL contact (field mapping §4b.1)
  mapOpportunity.ts      # Quote ⇄ GHL opportunity (field mapping §4b.2)
  stageCatalog.ts        # fetch + cache pipeline stages; stage⇄status (§4a)
  GoHighLevelRepository.ts  # implements the GHL-owned Repository methods
src/data/
  CompositeRepository.ts    # routes each Repository method to the owning backend
  identityMap.ts            # customer_identity_map accessor (local table)
```

The GHL HTTP core can be **shared with the Phase 1 adapter** (both need
auth-header injection + versioning + retry). If sharing, lift the fetch core to
`src/comms/ghlHttp.ts` or a neutral `src/ghl/http.ts` and have both the adapter
and `GhlApiClient` depend on it. Recommendation: extract when Phase 1 lands;
until then `GhlApiClient` owns its own core to avoid a premature abstraction.

---

## 2. `GhlApiClient` — surface

A thin typed wrapper. **The only place `fetch` touches GHL** (mirrors the
single-primitive discipline of the read-only shim). Handles: base URL, auth
header, `Version` header, per-endpoint param casing, cursor pagination,
retry/backoff on 429/5xx, and never leaks the token into logs/errors.

```ts
type GhlClientConfig = {
  baseUrl: string;            // https://services.leadconnectorhq.com
  version: string;            // e.g. "2021-07-28"
  locationId: string;         // GHL_LOCATION_ID
  resolveToken: () => string; // PIT or OAuth access token (never stored in client)
};

interface GhlApiClient {
  // ── Contacts ──
  getContact(contactId: string): Promise<GhlContact>;
  searchContacts(params: { query?: string; limit?: number; startAfter?: Cursor }):
    Promise<GhlPage<GhlContact>>;
  createContact(input: GhlContactWrite): Promise<GhlContact>;            // VERIFY (write)
  updateContact(contactId: string, input: Partial<GhlContactWrite>): Promise<GhlContact>; // VERIFY
  upsertContact(input: GhlContactWrite): Promise<{ contact: GhlContact; new: boolean }>;   // VERIFY

  // ── Opportunities ──
  searchOpportunities(params: {
    pipelineId: string; stageId?: string; contactId?: string;
    limit?: number; startAfter?: Cursor;
  }): Promise<GhlPage<GhlOpportunity>>;
  getOpportunity(id: string): Promise<GhlOpportunity>;
  createOpportunity(input: GhlOpportunityWrite): Promise<GhlOpportunity>; // VERIFY (write)
  updateOpportunity(id: string, input: Partial<GhlOpportunityWrite>): Promise<GhlOpportunity>; // VERIFY

  // ── Pipelines (stage catalog) ──
  listPipelines(): Promise<GhlPipeline[]>;

  // ── Custom fields (to resolve customFields[] ids ⇄ keys) ──
  listCustomFields(model: "contact" | "opportunity"): Promise<GhlCustomFieldDef[]>; // VERIFY path
}

type Cursor = { startAfter: number; startAfterId: string };
type GhlPage<T> = { items: T[]; next?: Cursor; total: number };
```

**Endpoint + param facts locked from live validation (§4b.3):**

| Client method | HTTP | Path | Param casing / notes |
|---|---|---|---|
| `getContact` | GET | `/contacts/:id` | no `locationId` query param |
| `searchContacts` | GET | `/contacts/` (or `/contacts/search`) | **VERIFY exact search path**; location via query |
| `searchOpportunities` | GET | `/opportunities/search` | **snake_case**: `pipeline_id`, `location_id`, `limit`, `startAfter`, `startAfterId`; **rejects** `locationId` |
| `listPipelines` | GET | `/opportunities/pipelines` | `locationId` query param OK |
| `getOpportunity` | GET | `/opportunities/:id` | — |
| `createOpportunity` | POST | `/opportunities/` | **VERIFY** body shape (write) |
| `updateOpportunity` | PUT | `/opportunities/:id` | **VERIFY** |
| `createContact` / `upsertContact` | POST | `/contacts/` or `/contacts/upsert` | **VERIFY**; dedupe on email/phone (`contactUniqueIdentifiers`) |

**Behaviors the client must implement (all observed live):**
- **Cursor pagination** — responses carry `meta.startAfter` + `meta.startAfterId`
  + `meta.nextPageUrl`. `searchOpportunities`/`searchContacts` return `GhlPage`
  with a `next` cursor; the repo iterates cursors, never page numbers.
- **Per-endpoint casing** — the client maps camelCase method args to the correct
  casing per endpoint (search = snake_case). Centralize so callers never think
  about it.
- **Retry/backoff** — on 429 and 5xx with jittered backoff; surface a typed
  `GhlRateLimitError` after N attempts. (Rate-limit numbers: OPEN-6/B.)
- **Token redaction** — errors/logs never include the Authorization header
  (same discipline as the shim's URL redaction).

---

## 3. `CompositeRepository` — method-routing table

`CompositeRepository implements Repository`. It composes a `GoHighLevelRepository`
(GHL-owned methods) and the existing `PostgresRepository` (everything else), and
holds the cross-backend assembly + partial-failure policy (OPEN-10). Selected in
`src/data/index.ts` when `DATA_BACKEND=ghl`.

Routing for every method on the `Repository` interface (`src/data/repository.ts`):

| Repository method | Routed to | Notes |
|---|---|---|
| `listCustomers` | **GHL** | `searchContacts` → `CustomerListItem[]` (+ identity map). |
| `getCustomerStats` | GHL (derived) | aggregate opportunities/contacts; cache. |
| `getCustomer` | **composite** | GHL contact + GHL opportunities **+ local** props/plans/jobs/interactions/reviews (§3 assembly). |
| `createCustomer` | **GHL** (write) | `upsertContact`; record identity map before returning. |
| `updateCustomer` | **GHL** (write) | `updateContact`. |
| `listJobs` | Postgres | jobs still local in Phase 2. |
| `listTasks`/`createTask`/`updateTask` | Postgres | local. |
| `addContact` | **GHL** (write) | maps to contact `additionalPhones[]`/`additionalEmails[]` (§4b.1). |
| `addProperty`/`updateProperty` | Postgres | local; joined by `ghlContactId`. |
| `createPlan` | Postgres | local. |
| `createQuote` | **GHL** (write) | `createOpportunity` in `GHL_PIPELINE_ID`. |
| `createJob`/`updateJob` | Postgres | local. |
| `addJobReview` | Postgres | local (proprietary). |
| `listAppointments`/`createAppointment` | Postgres | local (Phase 3 → GHL calendar). |
| `addInteraction` | Postgres | local (proprietary). |
| `listServiceOfferings`/`create`/`update` | Postgres | local (Phase 3 → GHL products). |
| `listPartners`/`getPartner`/`create`/`update`/`highlights`/`upcoming` | Postgres | local (proprietary; Phase 4 → custom objects). |
| `listTeamMembers`/`getTeamMember`/`create`/`stats` | Postgres | local (proprietary). |
| `getMyProfile`/`updateMyProfile` | Postgres | local. |
| `listNotifications`/`update`/`markAllRead` | Postgres | local. |
| `search` | Postgres | local in Phase 2 (GHL contact search is Phase 3/4). |
| `updateQuote` | **GHL** (write) | drag-drop → `updateOpportunity` sets `pipelineStageId` (+ derived `status`), §4a. |
| `getPipeline` | **GHL** | `searchOpportunities(pipelineId)` grouped by live stages (§4a). |
| `getPipelineStats` | GHL (derived) | aggregate opportunities; cache. |
| `listConversations`/`getConversation` | Postgres/seed | legacy; comms is Phase 1's path. |
| `getCalendarWeek`/`getDigest` | Postgres/seed | local. |
| `getHome` | **composite (derived)** | pulls pipeline (GHL) + local bits. |
| `comms.*` | Postgres | Phase 1 adapter owns sending; the store stays local. |

Rule of thumb: **GHL owns customers(contacts) + quotes(opportunities) + pipeline.
Everything else stays local in Phase 2.** The table is the exact contract.

### 3.1 Partial-failure policy (OPEN-10)

`getCustomer`/`getHome` touch both backends. Policy:
- **Reads: fail-closed on the primary, degrade on the secondary.** If the GHL
  contact fetch fails, `getCustomer` errors (the customer identity is the
  anchor). If a *local* sub-resource (e.g. interactions) fails, return the
  record with that collection empty + a logged warning — don't fail the whole
  360° view for a secondary section. Record which backend failed on the response
  envelope (internal field) for observability.
- **Writes: never dual-write silently.** A create goes to its owning backend
  only; the identity map is written in the **same** logical step as the GHL
  contact create, before returning, so a crash can't orphan a GHL contact from
  its Pathways id (idempotency via GHL upsert makes a retry safe).

---

## 4. `customer_identity_map` (the only new local table)

```
customer_identity_map
  tenant_id      uuid   not null
  pathways_id    uuid   not null      -- local customer id (stable Pathways PK/slug anchor)
  ghl_contact_id text   not null
  slug           text                 -- optional readable URL key
  created_at     timestamptz
  unique (tenant_id, pathways_id)
  unique (tenant_id, ghl_contact_id)
```

- Resolves both directions (Pathways id → GHL contactId for writes; contactId →
  Pathways id/slug when assembling reads and joining local sub-resources).
- Written transactionally with contact create (§3.1).
- Survives until Phase 4; if/when the full migration completes it can fold away.
- OPEN-7 leans toward this table vs storing `ghl_contact_id` on each local row —
  the table centralizes the mapping and keeps local sub-resource tables unaware
  of GHL.

---

## 5. `stageCatalog` (Option 2 support, §4a)

- On startup (and on a short TTL / cache-bust), call `listPipelines()`, find
  `GHL_PIPELINE_ID`, and build an ordered stage list:
  `{ stageId, name, position, ghlStatus }[]`.
- `ghlStatus` comes from the optional config override map, defaulting to the
  §4a table (Booked→won, Lost Lead/Went With Other/Too Expensive/Cancelled→lost,
  Junk→abandoned, else open).
- Exposes: `stages()` (for `getPipeline` lanes), `statusForStage(stageId)` (for
  derived `status` on `updateQuote`), and `isTerminal(stageId)`.
- **Startup validation:** if `GHL_PIPELINE_ID` doesn't resolve or has no stages,
  fail loud (don't boot a mis-wired pipeline).

---

## 6. Config additions (`src/config.ts`)

```
GHL_ENABLED / DATA_BACKEND=ghl   # select the composite backend
GHL_LOCATION_ID                  # Gq6PAsaOatm3iOcpoXAX (current account)
GHL_TOKEN  (or GHL_TOKEN_REF)    # PIT or OAuth token; resolved, never stored in client
GHL_API_VERSION   default 2021-07-28
GHL_PIPELINE_ID                  # j6sBTFNd1C6RHfZQryAg (Client Sales Pipeline)
GHL_STAGE_STATUS_MAP (optional)  # JSON override of stage→open/won/lost/abandoned
```

Zod-validate like the rest of config; **fail loud** if `DATA_BACKEND=ghl` but
`GHL_LOCATION_ID`/token/pipeline are missing (same pattern as the existing
postgres guard).

---

## 6a. Write-path spec (DOC-SOURCED — not live-verified; closes OPEN-6 write half on paper only)

> ⚠️ **Provenance:** the shapes below are from GoHighLevel's **published v2 API
> docs**, not confirmed against a live call (the write probe needs a sandbox
> sub-account, which isn't available on the current single-account plan). Treat
> every field here as `VERIFY-ON-SANDBOX`. The read path (§2–§5) IS live-verified;
> this section is deliberately fenced off as documentation until a sandbox exists.
> OPEN-6's write half stays **open**.

### 6a.1 Create / upsert contact

- **Create:** `POST /contacts/` · **Upsert:** `POST /contacts/upsert`
- Body (doc-sourced):
  ```jsonc
  {
    "locationId": "<GHL_LOCATION_ID>",   // required
    "firstName": "…", "lastName": "…",
    "name": "…",                          // or first/last
    "email": "…",                         // dedupe key (see below)
    "phone": "+1…",                       // dedupe key (see below)
    "tags": ["…"],
    "source": "…",
    "customFields": [ { "id": "<fieldId>", "field_value": "…" } ]  // VERIFY key name
  }
  ```
- **Upsert dedupe (doc-confirmed semantics):** the location's
  `contactUniqueIdentifiers` (live = `["email","phone"]`) drive matching. If the
  setting checks both, GHL matches on the **priority sequence** (email first,
  then phone) and creates-or-updates accordingly. Edge case from the docs: if two
  different contacts separately match email vs phone, GHL updates the one
  matching the **first** field in the sequence and ignores the second to avoid
  duplication. → **Use `/contacts/upsert` for `createCustomer`** to get
  idempotency for free (OPEN-6 idempotency concern), then record the returned
  contactId in the identity map.

### 6a.2 Create / update opportunity

- **Create:** `POST /opportunities/` · **Update:** `PUT /opportunities/:id` ·
  **Upsert:** `POST /opportunities/upsert` (dedupe on contactId + pipelineId +
  stageId — useful but usually we want a new opportunity per quote).
- Create body (doc-sourced example, confirmed field names):
  ```jsonc
  {
    "pipelineId": "j6sBTFNd1C6RHfZQryAg",       // GHL_PIPELINE_ID
    "locationId": "<GHL_LOCATION_ID>",
    "name": "…",                                 // required
    "pipelineStageId": "<stageId>",              // from stageCatalog (§5)
    "status": "open",                             // open|won|lost|abandoned
    "contactId": "<ghlContactId>",
    "monetaryValue": 220,                         // DECIMAL dollars, NOT cents
    "forecastExpectedCloseDate": "2026-04-23",    // candidate home for validUntil
    "forecastProbability": 20,
    "assignedTo": "<userId>",
    "customFields": [ { "id": "<fieldId>", "fieldValue": "…" } ]
  }
  ```
- Update body: same fields, all optional; drag-drop stage change =
  `PUT /opportunities/:id` with `{ pipelineStageId, status }` (status derived
  from stageCatalog per §4a).

### 6a.3 Gotchas to verify on the sandbox (carry into the probe when available)

- **`customFields` write key asymmetry:** docs show opportunity create using
  `fieldValue`, while the live READ returned `value`. Contact create docs show
  `field_value` (snake). → The mapping layer must write the key GHL expects per
  object/endpoint and read `value`. **Confirm exact write keys on sandbox.**
- **`monetaryValue` is decimal** (confirmed in create docs: `220`, and in the
  live read: a number) — convert from integer cents at the boundary (OPEN-11).
- **Create-triggered automations:** creating a contact/opportunity can fire GHL
  Workflows (this account uses workflows heavily). The probe MUST run in a
  sandbox OR with create-triggers paused — this is the whole reason writes are
  deferred.
- **Association on opportunity create:** passing `contactId` auto-creates the
  `OPPORTUNITIES_CONTACTS_ASSOCIATION` (seen in live `relations[]`) — confirm no
  separate association call is needed for the primary contact link.

---

## 7. Execution order (refines §9 of the repository doc)

1. **`GhlApiClient` (read methods) + `ghlConfig` + `stageCatalog`** with startup
   validation. Unit-test against recorded live fixtures (the §4b responses).
2. **`CompositeRepository` wrapping Postgres, delegating everything** — a no-op
   refactor that lands the seam with zero behavior change (safe to ship alone).
3. **Route `listCustomers` + `getCustomer` through GHL** (read path), backed by
   the identity map; local sub-resources still assembled from Postgres.
4. **`getPipeline` + `getPipelineStats` (read)** via `searchOpportunities` +
   `stageCatalog`. Ship the dynamic-stage API; UI switch sequenced after.
5. **Writes** — `createCustomer`/`updateCustomer`, `createQuote`/`updateQuote`.
   **Gated on OPEN-6/B** (sandbox write validation) before touching production.
6. **Stats caching/precompute** last.

Steps 1–4 are the read path and are execution-ready now. Step 5 waits on B.

---

## References
- Mapping + strategy: `gohighlevel-phase2-repository.md` (§4a stages, §4b fields).
- Seam to satisfy: `src/data/repository.ts`; selection in `src/data/index.ts`.
- Assembly pattern to mirror: `src/data/postgresRepository.ts`.
- Read-only shim (fixtures source): `tools/ghl-mcp/`.
