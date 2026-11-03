# Customer Data Model — Design Doc (DRAFT for review)

Status: **draft v3, not implemented.** Purpose: agree the relational model for
the Customer domain (customer, contacts, properties, offerings, plans, quotes,
jobs, appointments, reviews, cleaners, partners) before writing any
schema/migrations. Nothing here is built yet.

> **Decisions locked (Q1–Q8), v2:**
> - **Q1 — Replace `deals` with `quotes`.** The pipeline is quotes grouped by
>   `status`. The standalone `deals` table/domain is retired.
> - **Q2 — UUID PKs + `slug`.** Surrogate UUID keys; optional per-tenant `slug`
>   for readable URLs.
> - **Q3 — `lifecycle_stage` stored *and* derived.** Keep a column on
>   `customers`; business logic will maintain/derive it later (for now it's set
>   directly, computed from quotes/plans in a later pass).
> - **Q4 — Tenancy now.** `tenant_id` on every business table.
> - **Q5 — Keep `appointments` separate from `jobs`.** An appointment *may*
>   reference a job (`job_id` nullable) but also covers non-service events
>   (walkthroughs, quote visits, calls). See §4.7.
> - **Q6 — Compute rollups on read.** `lifetimeValue` / last / next service are
>   derived in queries, not stored.
> - **Q7 — Integer cents, `USD` default.** Single currency for now.
> - **Q8 — Consent now.** `customer_contacts` carries a consent model (channel
>   opt-in/opt-out + timestamps + source).

> Scope note: this redesigns the `customers` area. Partners and conversations
> are touched only where they clearly relate (referrals, a job's assigned
> partner). The current standalone `deals` concept is **folded into `quotes`**.

---

## 1. Goals & principles

- **A customer is a person/account with identity.** Only intrinsic facts about
  the customer live on the customer row (name, contact points, status). Anything
  that can vary or repeat lives in a related table.
- **Everything else is a relationship.** Properties, plans, jobs, quotes are
  their own tables, each linked back to a customer by FK. One customer → many of
  each.
- **Real types, not display strings.** Dates are `date`/`timestamptz`, money is
  stored in integer **cents**, enums are DB enums. Formatting ("5 days ago",
  "$3,120") moves to the API/UI boundary. (Today's schema stores these as text —
  the thing we most want to fix.)
- **Normalize the core, keep Cori's narrative as JSONB.** Structured facts get
  columns; Cori's generated prose/audit (summary, provenance, "good to know")
  stays JSONB — it's display content, not something we query on.
- **Multi-tenant from day one.** Every table carries `tenant_id` so we don't
  retrofit it later (ties to the planned auth work). See Q4.
- **Stable surrogate keys.** UUID primary keys (`gen_random_uuid()`); the
  human-readable ids we use today (`c-gloria-hynes`) become a non-PK `slug` if we
  still want them in URLs. See Q2.

---

## 2. Entities at a glance (ERD)

```
tenants 1───* customers, cleaners, partners, service_offerings, ...   (everything is tenant-scoped)

customers 1───* customer_contacts      (phones, emails; one primary each + consent)
customers 1───* properties             (service addresses)
customers 1───* plans                  (per-customer subscriptions)
customers 1───* quotes                 (proposals; may convert to a plan/job)
customers 1───* jobs                   (scheduled/performed visits)
customers 1───* appointments           (calendar events; service + non-service)

service_offerings 1───* plans          (reusable catalog item -> many subscriptions; Q9)

properties 1───* plans / jobs / quotes (a property is serviced/quoted/worked)

plans     1───* jobs                   (recurring plan generates many jobs)
quotes    0/1──1 plans                 (an accepted recurring quote creates a plan)
quotes    0/1──* jobs                  (a one-off accepted quote creates a job)
jobs      0/1──* appointments          (an appointment may belong to a job; may not)
jobs      1───1 job_reviews            (one review per job; rating/review/note — Q11)

cleaners  1───* jobs / appointments    (FT cleaner performs work)   ┐ exactly one of
partners  1───* jobs / appointments    (contractor performs work)   ┘ cleaner|partner (Q10)
partners  1───* customers              (lead-gen partner referred the customer)
```

Cardinality intent: a **customer** owns everything. A **property** is the
physical thing most operational records hang off (you clean a property, quote a
property, schedule a job at a property). Plans/quotes/jobs therefore reference
**both** `customer_id` and `property_id` (customer is denormalized onto them for
easy tenant-scoped listing and to survive a property being archived).

**Quotes = the pipeline (Q1).** There is no separate `deals` table. Pipeline
columns map to `quotes.status`; the old `signal`/`needs_you`/`chip` card fields
live on `quotes`.

**Appointments ≠ jobs (Q5).** A `job` is a unit of billable service work. An
`appointment` is a calendar event. Most appointments reference a job
(`job_id`), but some don't — a walkthrough, a quote visit, a phone call. So
`appointments.job_id` is nullable and appointments carry their own `kind`.

---

## 3. Shared conventions

- **PK:** `id uuid primary key default gen_random_uuid()`.
- **Tenant:** `tenant_id uuid not null references tenants(id)` on every business
  table; all queries filter by it.
- **Timestamps:** `created_at timestamptz not null default now()`,
  `updated_at timestamptz not null default now()` (touch via trigger or app).
- **Soft delete:** `archived_at timestamptz null` rather than hard deletes, so
  history (jobs/quotes) is preserved.
- **Money:** integer **cents** + a `currency char(3) not null default 'USD'`.
  Never floats.
- **Enums:** Postgres `pgEnum`. Adding a value later is a cheap migration.

---

## 4. Tables

### 4.1 `customers` — the person/account (identity only)

| column | type | notes |
|---|---|---|
| `id` | uuid PK | surrogate |
| `tenant_id` | uuid FK | |
| `slug` | text unique (per tenant) | optional human id for URLs (`gloria-hynes`) |
| `display_name` | text not null | "Gloria Hynes" / "The Porters" |
| `first_name` | text null | optional structured name |
| `last_name` | text null | |
| `company_name` | text null | for commercial accounts |
| `status` | enum `customer_status` | `lead` / `active` / `lapsed` |
| `lifecycle_stage` | enum `customer_stage` | `new-lead` / `quote` / `booked` / `recurring`. Stored column (Q3); set directly for now, maintained/derived from quotes+plans by business logic later |
| `preferred_contact` | enum `contact_channel` | `sms` / `email` / `call` |
| `source` | text null | how they came in (referral, web, partner) |
| `referred_by_partner_id` | uuid FK null | ties to partners |
| `summary` | text default '' | Cori narrative |
| `provenance` | text default '' | glass-box audit for the summary |
| `good_to_know` | jsonb `string[]` | Cori bullets |
| `tags` | jsonb `string[]` | |
| `notes` | text null | free-form internal notes |
| `created_at` / `updated_at` / `archived_at` | timestamptz | |

Removed from today's `customers`: `phone`, `location`, `plan`, `lifetimeValue`,
`lastService`, `nextService`, `homeDetails`, `nextStep`, `activity`. These move
to related tables (contacts, properties, plans, jobs) or are **derived** (see
§5).

### 4.2 `customer_contacts` — phones & emails

One row per contact point so a customer can have many, with one primary of each
kind. Replaces the single `phone` column and adds email.

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `tenant_id` | uuid FK | |
| `customer_id` | uuid FK | |
| `kind` | enum `contact_kind` | `mobile` / `landline` / `email` |
| `value` | text not null | E.164 for phones (`+15551234567`), normalized email |
| `label` | text null | "work", "billing" |
| `is_primary` | boolean default false | at most one primary per `kind` (partial unique index) |
| `verified_at` | timestamptz null | contact point verified (owns the number/email) |
| **consent (Q8)** | | per-channel opt-in tracking |
| `consent_status` | enum `consent_status` | `unknown` / `opted_in` / `opted_out` |
| `consent_source` | text null | how captured (web form, SMS reply "YES", verbal) |
| `consent_at` | timestamptz null | when the current status was set |
| `opt_out_at` | timestamptz null | last opt-out (STOP reply, unsubscribe) |
| `created_at` / `updated_at` | timestamptz | |

Index: `unique (tenant_id, customer_id, kind) where is_primary` to enforce one
primary per kind. Consider `unique (tenant_id, kind, value)` to dedupe.

**Consent rule (Q8):** the app must not SMS/email a contact whose
`consent_status` is not `opted_in` for that channel. `opted_out` is sticky —
re-opt-in requires a new `consent_at`. This gives an auditable basis for
TCPA/CAN-SPAM-style compliance and a clean "STOP" handling path from the
conversations side. If we later need full history, add a `consent_events` table
logging every change; the current-status columns + timestamps suffice for now.

### 4.3 `properties` — service addresses

The physical location work happens at. A customer can have several.

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `tenant_id` | uuid FK | |
| `customer_id` | uuid FK | owner |
| `label` | text null | "Primary home", "Rental – Main St" |
| `address_line1` | text not null | |
| `address_line2` | text null | |
| `city` | text not null | |
| `region` | text not null | state/province |
| `postal_code` | text not null | |
| `country` | char(2) default 'US' | |
| `latitude` / `longitude` | numeric null | for routing/maps later |
| `property_type` | enum `property_type` | `house` / `apartment` / `commercial` |
| `bedrooms` / `bathrooms` | integer null | the "home details" facts, typed |
| `square_feet` | integer null | |
| `access_notes` | text null | gate codes, pets, parking (Cori "good to know") |
| `home_details` | jsonb null | overflow for unstructured facts the UI shows |
| `is_primary` | boolean default false | default property for new jobs/quotes |
| `created_at` / `updated_at` / `archived_at` | timestamptz | |

This absorbs today's free-text `location` and the `homeDetails` blob, promoting
the facts we filter/route on (city, type, beds/baths, sqft) into columns.

### 4.4 Plans — split into `service_offerings` (catalog) + `plans` (subscription)

**Decision to confirm — Q9.** The word "plan" conflates two things. We split
them so a plan can be *reused* across customers (your ask) without breaking
per-customer start/end dates:

- **`service_offerings`** — the reusable catalog item ("Standard Weekly Clean").
  Shared across customers; no customer/dates. Answers "how many customers are on
  Weekly Standard?" and keeps pricing/descriptions consistent.
- **`plans`** — a *per-customer, per-property subscription* to an offering (or a
  bespoke one with `offering_id = null`). Carries the dates, status, and the
  price actually agreed. This is where start/end live — they're inherently
  per-customer, so they can't sit on a shared catalog row.

This directly answers "what would reuse do to my structure": reuse lives in the
catalog; everything customer-specific stays on `plans`. One extra table + a
nullable FK — not overcomplicated, and it avoids a shared row trying to hold
one customer's dates.

#### 4.4a `service_offerings` — reusable catalog

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `tenant_id` | uuid FK | catalog is per-tenant |
| `name` | text not null | "Standard Weekly Clean" |
| `service_type` | enum `service_type` | `standard` / `deep` / `move-out` / `one-time` |
| `frequency` | enum `plan_frequency` | `weekly` / `biweekly` / `monthly` / `one-time` |
| `description` | text null | **free-text details of the service** (what's included) |
| `default_price_cents` | integer null | catalog price; a plan may override |
| `currency` | char(3) default 'USD' | |
| `is_active` | boolean default true | hide retired offerings from pickers |
| `created_at` / `updated_at` / `archived_at` | timestamptz | |

#### 4.4b `plans` — per-customer subscription

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `tenant_id` | uuid FK | |
| `customer_id` | uuid FK | |
| `property_id` | uuid FK | which property this plan services |
| `offering_id` | uuid FK null | catalog item it's based on (null = bespoke) |
| `name` | text not null | display; defaults from the offering |
| `description` | text null | **free-text override/notes** (inherits offering's if null) |
| `service_type` | enum `service_type` | snapshotted from offering (so catalog edits don't rewrite history) |
| `frequency` | enum `plan_frequency` | snapshotted |
| `status` | enum `plan_status` | `active` / `paused` / `cancelled` |
| `price_cents` | integer not null | the agreed per-visit price (may differ from catalog) |
| `currency` | char(3) default 'USD' | |
| `start_date` | date null | per-customer — lives here, not on the offering |
| `end_date` | date null | |
| `source_quote_id` | uuid FK null | the quote this plan came from |
| `created_at` / `updated_at` / `archived_at` | timestamptz | |

Replaces the free-text `plan` column. `next_visit_on` is **derived on read**
(Q6) from `jobs`/`appointments`, not stored. `service_type`/`frequency` are
snapshotted onto the plan so editing a catalog offering never silently changes
an existing customer's agreement.

### 4.5 `quotes` — proposals

A priced proposal for a property; may be accepted → creates a plan (recurring)
or a one-off job. **This replaces the old `deals` table — the pipeline is
`quotes` grouped by `status` (Q1).** The card fields the pipeline UI needs
(`signal`, `needs_you`, `detail`) live here.

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `tenant_id` | uuid FK | |
| `customer_id` | uuid FK | |
| `property_id` | uuid FK null | property being quoted (null if pre-address lead) |
| `status` | enum `quote_status` | `draft` / `sent` / `follow-up` / `accepted` / `declined` / `expired` |
| `service_type` | enum `service_type` | what's being quoted |
| `frequency` | enum `plan_frequency` | proposed cadence (for recurring quotes) |
| `amount_cents` | integer not null | quoted price |
| `currency` | char(3) default 'USD' | |
| `price_unit` | enum `price_unit` | `per-visit` / `flat` |
| `valid_until` | date null | expiry |
| `sent_at` | timestamptz null | |
| `decided_at` | timestamptz null | accepted/declined timestamp |
| `signal` | enum `deal_signal` | `cori` / `needs-you` / `info` (pipeline chip) |
| `needs_you` | boolean default false | surfaced to the operator |
| `detail` | text null | human line ("Move-out clean, 3BR") |
| `cori_notes` | jsonb null | Cori's reasoning/provenance |
| `created_at` / `updated_at` / `archived_at` | timestamptz | |

A quote's lifecycle maps to the pipeline stages the UI shows. On `accepted`, the
app creates a `plan` (recurring) or a `job` (one-off) and links back via
`source_quote_id`.

### 4.6 `jobs` — scheduled & performed visits

A unit of work at a property on a date. Powers the calendar and the "last/next
service" facts.

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `tenant_id` | uuid FK | |
| `customer_id` | uuid FK | |
| `property_id` | uuid FK | where |
| `plan_id` | uuid FK null | the recurring plan that generated it (null = one-off) |
| `quote_id` | uuid FK null | the one-off quote that created it |
| `status` | enum `job_status` | `scheduled` / `in-progress` / `completed` / `cancelled` / `no-show` |
| `service_type` | enum `service_type` | |
| `scheduled_start` | timestamptz null | real datetime (replaces calendar text) |
| `scheduled_end` | timestamptz null | |
| `duration_min` | integer null | |
| `completed_at` | timestamptz null | drives "last service" |
| `assignee_type` | enum `assignee_type` null | `cleaner` (full-time) / `partner` (contractor) — who performs it |
| `assigned_cleaner_id` | uuid FK null | FT cleaner (→ `cleaners`); set when `assignee_type='cleaner'` |
| `assigned_partner_id` | uuid FK null | contractor (→ `partners`, type contractor); set when `assignee_type='partner'` |
| `price_cents` | integer null | actual charge (may differ from plan) |
| `currency` | char(3) default 'USD' | |
| `notes` | text null | |
| `created_at` / `updated_at` / `archived_at` | timestamptz | |

**Assignment (your #2 + #4/#5).** A job is performed either by a full-time
**cleaner** or a contracted **partner**. Rather than one `assigned_partner`, we
use `assignee_type` + the matching nullable FK (exactly one set). A `CHECK`
enforces: `assignee_type='cleaner'` ⇒ `assigned_cleaner_id` set and
`assigned_partner_id` null (and vice-versa). This keeps real FKs to each table
(clean joins) while allowing either kind of worker. Same pattern on
`appointments`. *(Alt considered — a single polymorphic `assignee_id` + type
with no FK: rejected, loses referential integrity. See Q10.)*

Replaces the text `lastService`/`nextService` with queryable job history:
- **last service** = latest `completed_at` for the customer.
- **next service** = earliest future `scheduled_start`.

A job is the billable work record. It does **not** itself place anything on the
calendar — that's an `appointment` pointing at the job (§4.7, Q5). A one-off job
typically has exactly one appointment; a recurring plan's jobs each get their
own appointment.

### 4.7 `appointments` — calendar events (service & non-service)

A scheduled calendar entry. Usually tied to a job, but also covers events that
aren't jobs: walkthroughs, quote visits, follow-up calls. Kept separate from
`jobs` per Q5.

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `tenant_id` | uuid FK | |
| `customer_id` | uuid FK null | null for internal/blocked time |
| `property_id` | uuid FK null | where, if applicable |
| `job_id` | uuid FK null | the service job this appointment is for (null = non-service) |
| `quote_id` | uuid FK null | if it's a quote/walkthrough visit |
| `kind` | enum `appointment_kind` | `clean` / `walkthrough` / `quote-visit` / `call` / `other` |
| `status` | enum `appointment_status` | `scheduled` / `confirmed` / `completed` / `cancelled` / `no-show` |
| `title` | text not null | display label |
| `detail` | text null | |
| `starts_at` | timestamptz not null | real datetime (replaces `dayIndex`/`start` text) |
| `ends_at` | timestamptz null | |
| `duration_min` | integer null | |
| `assignee_type` | enum `assignee_type` null | `cleaner` / `partner` — who's attending |
| `assigned_cleaner_id` | uuid FK null | FT cleaner (→ `cleaners`) |
| `assigned_partner_id` | uuid FK null | contractor/partner (→ `partners`) |
| `location_override` | text null | if not the property's address |
| `created_at` / `updated_at` / `archived_at` | timestamptz | |

Invariant: if `kind = 'clean'` then `job_id` is expected non-null; other kinds
may have a null `job_id`. The calendar week view reads `appointments` filtered
by `starts_at` range (deriving the old `dayIndex`/`weekDays` from real dates).

### 4.8 `job_reviews` — ratings, reviews & customer notes per job (your #3)

One review per completed job, linked to the job (and denormalized to customer +
worker for easy history queries). The customer profile shows the job history
with each job's rating/review/notes.

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `tenant_id` | uuid FK | |
| `job_id` | uuid FK not null | the job being reviewed (unique — one review per job; Q11) |
| `customer_id` | uuid FK | denormalized for profile history queries |
| `rating` | integer null | 1–5 (CHECK `between 1 and 5`); null if only a note |
| `review_text` | text null | the customer's written review |
| `customer_note` | text null | internal note about the visit (staff-entered) |
| `reviewer` | enum `review_source` | `customer` / `staff` (who recorded it) |
| `would_recommend` | boolean null | optional NPS-ish signal |
| `reviewed_cleaner_id` | uuid FK null | worker being rated (snapshot from the job) |
| `reviewed_partner_id` | uuid FK null | " (if a partner did the job) |
| `created_at` / `updated_at` | timestamptz | |

The customer profile's "job history" = `jobs` for the customer, each left-joined
to its `job_reviews` row, ordered by date. A worker's average rating is derived
from reviews referencing them.

### 4.9 `cleaners` — full-time (W-2) cleaners (your #4)

Your own staff who perform jobs. Distinct from `partners` (which holds sales
partners and contracted/1099 cleaners).

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `tenant_id` | uuid FK | |
| `slug` | text null | readable id for URLs |
| `display_name` | text not null | |
| `first_name` / `last_name` | text null | |
| `email` | text null | |
| `phone` | text null | E.164 |
| `status` | enum `cleaner_status` | `active` / `inactive` / `on-leave` |
| `hired_on` | date null | |
| `employment_type` | enum `employment_type` | `full-time` / `part-time` (W-2) |
| `skills` | jsonb `string[]` | e.g. ["deep-clean","move-out"] for routing |
| `home_base` | text null | region for scheduling |
| `notes` | text null | |
| `created_at` / `updated_at` / `archived_at` | timestamptz | |

Referenced by `jobs.assigned_cleaner_id` and `appointments.assigned_cleaner_id`.

### 4.10 `partners` — sales partners & contracted cleaners (your #5)

Houses **both** lead-gen/sales partners and contracted (1099) cleaners,
distinguished by `type`. (This is a cleaned-up version of today's `partners`
table.) Contractor-type partners can be assigned to jobs/appointments;
lead-gen-type partners refer customers (`customers.referred_by_partner_id`).

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `tenant_id` | uuid FK | |
| `slug` | text null | readable id |
| `display_name` | text not null | person or company |
| `type` | enum `partner_type` | `lead-gen` / `contractor` / `both` |
| `stage` | enum `partner_stage` | `prospect` / `vetting` / `onboarding` / `active` / `paused` |
| `contact_name` | text null | |
| `email` | text null | |
| `phone` | text null | E.164 |
| `location` | text null | |
| `since` | date null | |
| `skills` | jsonb `string[]` | for contractor routing |
| `commission_bps` | integer null | lead-gen commission in basis points (if applicable) |
| `summary` | text default '' | Cori narrative |
| `notes` | text null | |
| `created_at` / `updated_at` / `archived_at` | timestamptz | |

Referenced by `jobs.assigned_partner_id`, `appointments.assigned_partner_id`,
and `customers.referred_by_partner_id`. The per-partner rollups the UI shows
(leads generated, jobs covered, value) are **computed on read** (Q6) from
`customers`/`jobs`, not stored.

---

## 5. Derived vs. stored

Several of today's customer columns become **computed** from relations rather
than stored, so they can't drift:

| field (today) | becomes |
|---|---|
| `phone` | primary `customer_contacts` row of kind `mobile` |
| `location` | primary `properties` row (or count) |
| `plan` (text) | active `plans` for the customer (→ `service_offerings` for catalog) |
| `lifetimeValue` | sum of `price_cents` over `completed` jobs — **computed on read (Q6)** |
| `lastService` | max `completed_at` in `jobs` |
| `nextService` | min future `scheduled_start` across `jobs`/`appointments` |
| `activity` (blob) | derived timeline from jobs + quotes + conversations + reviews |
| partner rollups | leads/jobs-covered/value — derived from `customers`/`jobs` |
| worker rating | avg `job_reviews.rating` referencing the cleaner/partner |

Per Q6, the API computes these on read (join/aggregate) and formats them,
keeping the DB normalized — no cached rollup columns for now. If a screen later
proves slow, we add caching then.

---

## 6. Impact on the current API/UI

- **Domain contracts** (`src/domain/customer.ts`): `Customer` stays roughly the
  same *shape* at the API boundary (the UI shouldn't need a rewrite), but its
  fields are now assembled from joins. `homeDetails` comes from `properties`,
  `activity` is derived, `nextStep` likely maps to the top open quote/job.
- **New endpoints** worth adding: `/customers/:id/properties`,
  `/plans`, `/quotes`, `/jobs`, `/appointments` (and nested under a customer).
- **Pipeline endpoint** (`/pipeline`) is rebuilt on `quotes` grouped by
  `status`; the `deals` table/domain is removed (Q1).
- **Calendar endpoint** (`/calendar/week`) reads `appointments` by `starts_at`
  range (Q5), deriving `dayIndex`/`weekDays` from real datetimes.
- **Migration/seed**: the existing seed customers get split into
  customer + contact(s) + property + 0–1 plan + N quotes/jobs/appointments. A
  one-time transform script.
- **Repository**: `getCustomer` becomes a few queries (or a view) assembling the
  record; list uses aggregates. Response validation should `.parse()` (closes
  TD-3).
- **Retire**: `deals` table + `src/domain/deal.ts` (folded into quotes).

---

## 7. Decisions (resolved)

| # | Decision |
|---|---|
| Q1 | **Replace `deals` with `quotes`.** Pipeline = quotes grouped by `status`; `deals` table + domain retired. |
| Q2 | **UUID PKs + per-tenant `slug`** for readable URLs. |
| Q3 | **`lifecycle_stage` stored on `customers`** and later maintained/derived from quotes+plans by business logic. |
| Q4 | **`tenant_id` on every business table** from the start. |
| Q5 | **`appointments` stays separate from `jobs`.** `appointments.job_id` nullable; appointments cover non-service events (walkthroughs, quote visits, calls) too. |
| Q6 | **Compute rollups on read** (`lifetimeValue`/last/next). No cached columns yet. |
| Q7 | **Integer cents + `USD` default.** Single currency. |
| Q8 | **Consent model now** on `customer_contacts` (opt-in/opt-out + source + timestamps); no-send unless `opted_in`. |
| Q9 | **Split plans into `service_offerings` (reusable catalog) + `plans` (per-customer subscription).** Reuse lives in the catalog; dates/status/agreed price on the subscription. Offering link optional (bespoke plans allowed). Free-text `description` on both. |
| Q10 | **Worker assignment via `assignee_type` + two nullable FKs** (`assigned_cleaner_id` / `assigned_partner_id`), exactly one set, CHECK-enforced — on both `jobs` and `appointments`. Jobs may go to FT cleaners or contractors. |
| Q11 | **`job_reviews` = one row per job** (unique `job_id`), holding rating + review + customer note, denormalized to customer + worker for history/averages. |

---

## 8. Table inventory (current set for v1 build)

`tenants`, `customers`, `customer_contacts`, `properties`,
`service_offerings`, `plans`, `quotes`, `jobs`, `appointments`, `job_reviews`,
`cleaners`, `partners`. (No `deals`.) — **12 tables.**

New Postgres enums: `customer_status`, `customer_stage`, `contact_channel`,
`contact_kind`, `consent_status`, `property_type`, `service_type`,
`plan_frequency`, `plan_status`, `quote_status`, `price_unit`, `deal_signal`
(kept, now on quotes), `job_status`, `assignee_type`, `appointment_kind`,
`appointment_status`, `review_source`, `cleaner_status`, `employment_type`,
`partner_type`, `partner_stage`.

---

## 9. Proposed build order (once this doc is approved)

1. **Schema** — Drizzle tables + enums for the 12 tables; generate the migration.
2. **Seed transform** — split the current sample customers into
   customer + contact(s) + property + 0–1 plan (+ its offering) + N
   quotes/jobs/appointments, plus a few cleaners/partners and sample reviews.
3. **Contracts + repository** — assemble `Customer` (incl. job history with
   reviews) from relations, compute derived fields, `.parse()` responses
   (closes TD-3); rebuild pipeline on quotes and calendar on appointments.
4. **Endpoints** — nested
   `/customers/:id/{properties,plans,quotes,jobs,appointments}` + job reviews,
   and top-level `/cleaners`, `/partners`, `/service-offerings`.
5. **Retire** `deals` table + `src/domain/deal.ts`.
6. **UI** — point the Customers screen at the richer data (job history + reviews);
   iterate.

*Design approved — Q1–Q11 all locked. This doc is the reference of record;
update it if the model changes during the build.*

### Build status

- [x] **Step 1 — Schema + migration.** `src/db/schema.ts` rewritten to the
      12-table model; `drizzle/0000_steady_morlocks.sql` generated and verified
      against a fresh Postgres (all tables + FKs + indexes apply; the
      assignee CHECK and rating CHECK enforce correctly).
- [ ] Step 2 — Seed transform (split sample customers into the new tables).
- [ ] Step 3 — Contracts + repository (assemble `Customer` from relations,
      `.parse()`; rebuild pipeline on quotes, calendar on appointments).
- [ ] Step 4 — Endpoints (nested customer sub-resources + cleaners/partners/offerings).
- [ ] Step 5 — Retire `deals` + `src/domain/deal.ts`.
- [ ] Step 6 — Point the Customers screen at the richer data.

> NOTE: after step 1, `src/data/postgresRepository.ts` and `src/data/seed.ts`
> still reference the OLD columns and won't typecheck until step 3. The schema
> + migration land first as a reviewable unit; the repository is reworked next.
