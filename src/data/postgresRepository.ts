import { eq, and, asc, inArray, isNotNull, gte } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { Repository } from "./repository.js";
import * as schema from "../db/schema.js";
import * as seed from "./seed.js";
import type { InferSelectModel } from "drizzle-orm";
import {
  assembleCustomer,
  assembleCustomerStats,
  assembleTeamStats,
  assemblePartnerHighlights,
  assemblePipelineStats,
  teamMemberRollups,
  searchCorpus,
  partnerRelations,
  PIPELINE_STAGES,
  STATUS_TO_STAGE,
  mapContact,
  mapProperty,
  mapPlan,
  mapQuote,
  mapReview,
  mapJob,
  mapServiceOffering,
  mapAppointment,
  mapInteraction,
  partnerListItem,
  partnerDetail,
  upcomingPartnerItems,
  assembleUserProfile,
  mergePreferences,
  type CustomerBundle,
} from "./assemble.js";
import type { Customer, CustomerListItem, CustomerCreate, CustomerUpdate } from "../domain/customer.js";
import type {
  Partner,
  PartnerListItem,
  PartnerCreate,
  PartnerUpdate,
  PartnerHighlights,
  UpcomingPartnerItem,
} from "../domain/partner.js";
import type { TeamMember, TeamMemberListItem, TeamMemberCreate, TeamStats } from "../domain/team-member.js";
import type { UserProfile, UserProfileUpdate, UserIdentity } from "../domain/user-profile.js";
import type { CustomerStats } from "../domain/customer-stats.js";
import type { SearchResults } from "../domain/search.js";
import type { Pipeline, PipelineStage, PipelineStats } from "../domain/deal.js";
import type { ConvoListItem, ConversationDetail } from "../domain/conversation.js";
import type { CalendarWeek } from "../domain/calendar.js";
import type {
  Contact,
  ContactCreate,
  Property,
  PropertyCreate,
  PropertyUpdate,
  Plan,
  PlanCreate,
  Quote,
  QuoteCreate,
  QuoteUpdate,
  Job,
  JobCreate,
  Review,
  ReviewCreate,
  ServiceOffering,
  ServiceOfferingCreate,
  ServiceOfferingUpdate,
  Appointment,
  AppointmentCreate,
  Interaction,
  InteractionCreate,
} from "../domain/crm.js";

/** True when the string is a canonical UUID (guards `WHERE id = $1` on uuid columns). */
function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

/**
 * Postgres (Drizzle) repository over the relational schema. The customer record
 * is assembled from related tables (contacts/properties/plans/quotes/jobs +
 * reviews) with derived fields computed on read (design Q6). Conversations,
 * Home, and Digest aren't modeled in this schema yet and are served from seed.
 */
export class PostgresRepository implements Repository {
  constructor(private readonly db: PostgresJsDatabase<typeof schema>) {}

  /** The single tenant for now (multi-tenant columns exist; auth comes later). */
  private async tenantId(): Promise<string> {
    const [t] = await this.db.select().from(schema.tenants).limit(1);
    if (t) return t.id;
    const [created] = await this.db
      .insert(schema.tenants)
      .values({ name: "Default", slug: "default" })
      .returning();
    return created.id;
  }

  // Resolve a customer from either a UUID or a human slug.
  private async resolveCustomer(idOrSlug: string) {
    const col = isUuid(idOrSlug) ? schema.customers.id : schema.customers.slug;
    const [row] = await this.db.select().from(schema.customers).where(eq(col, idOrSlug));
    return row;
  }

  private async bundleFor(
    customer: InferSelectModel<typeof schema.customers>,
  ): Promise<CustomerBundle> {
    const cid = customer.id;
    const [contacts, properties, plans, quotes, jobs, interactions] = await Promise.all([
      this.db.select().from(schema.customerContacts).where(eq(schema.customerContacts.customerId, cid)),
      this.db.select().from(schema.properties).where(eq(schema.properties.customerId, cid)),
      this.db.select().from(schema.plans).where(eq(schema.plans.customerId, cid)),
      this.db.select().from(schema.quotes).where(eq(schema.quotes.customerId, cid)),
      this.db.select().from(schema.jobs).where(eq(schema.jobs.customerId, cid)),
      this.db.select().from(schema.interactions).where(eq(schema.interactions.customerId, cid)),
    ]);

    const jobIds = jobs.map((j) => j.id);
    const reviews = jobIds.length
      ? await this.db.select().from(schema.jobReviews).where(inArray(schema.jobReviews.jobId, jobIds))
      : [];
    const reviewsByJob = new Map(reviews.map((r) => [r.jobId, r]));

    // Resolve worker display names for assigned jobs + interaction handlers.
    const teamMemberIds = [
      ...jobs.map((j) => j.assignedTeamMemberId),
      ...interactions.map((i) => i.handledByTeamMemberId),
    ].filter((x): x is string => !!x);
    const partnerIds = [
      ...jobs.map((j) => j.assignedPartnerId),
      ...interactions.map((i) => i.handledByPartnerId),
    ].filter((x): x is string => !!x);
    const workerNameById = new Map<string, string>();
    if (teamMemberIds.length) {
      const rows = await this.db
        .select()
        .from(schema.teamMembers)
        .where(inArray(schema.teamMembers.id, teamMemberIds));
      for (const r of rows) workerNameById.set(r.id, r.displayName);
    }
    if (partnerIds.length) {
      const rows = await this.db
        .select()
        .from(schema.partners)
        .where(inArray(schema.partners.id, partnerIds));
      for (const r of rows) workerNameById.set(r.id, r.displayName);
    }

    return { customer, contacts, properties, plans, quotes, jobs, interactions, reviewsByJob, workerNameById };
  }

  // ── Home / digest: not modeled in this schema yet ──
  async getHome() {
    return seed.home;
  }
  async getDigest() {
    return seed.digest;
  }

  // ── Customers ──
  async listCustomers(): Promise<CustomerListItem[]> {
    const customers = await this.db.select().from(schema.customers);
    // Assemble each (N is small for dev; optimize with a join/view later).
    const out: CustomerListItem[] = [];
    for (const c of customers) {
      const full = assembleCustomer(await this.bundleFor(c));
      out.push({
        id: full.id,
        name: full.name,
        location: full.location,
        plan: full.plan,
        status: full.status,
        stage: full.stage,
        lifetimeValue: full.lifetimeValue,
        lastService: full.lastService,
        nextService: full.nextService,
        tags: full.tags,
      });
    }
    return out;
  }

  async getCustomerStats(): Promise<CustomerStats> {
    const [customers, jobs] = await Promise.all([
      this.db.select().from(schema.customers),
      this.db.select().from(schema.jobs),
    ]);
    return assembleCustomerStats(customers, jobs);
  }

  async getCustomer(id: string): Promise<Customer | undefined> {
    const c = await this.resolveCustomer(id);
    if (!c) return undefined;
    return assembleCustomer(await this.bundleFor(c));
  }

  async createCustomer(input: CustomerCreate): Promise<Customer> {
    const tenantId = await this.tenantId();
    const [c] = await this.db
      .insert(schema.customers)
      .values({
        tenantId,
        displayName: input.name,
        firstName: input.firstName,
        lastName: input.lastName,
        companyName: input.companyName,
        status: input.status ?? "lead",
        lifecycleStage: input.stage ?? "new-lead",
        preferredContact: input.preferredContact,
        source: input.source,
        summary: input.summary ?? "",
        tags: input.tags ?? [],
        notes: input.notes,
      })
      .returning();

    // Optional first contacts for a usable record in one POST.
    if (input.mobile) {
      await this.db.insert(schema.customerContacts).values({
        tenantId,
        customerId: c.id,
        kind: "mobile",
        value: input.mobile,
        isPrimary: true,
      });
    }
    if (input.email) {
      await this.db.insert(schema.customerContacts).values({
        tenantId,
        customerId: c.id,
        kind: "email",
        value: input.email,
        isPrimary: true,
      });
    }
    return assembleCustomer(await this.bundleFor(c));
  }

  async updateCustomer(id: string, input: CustomerUpdate): Promise<Customer | undefined> {
    const existing = await this.resolveCustomer(id);
    if (!existing) return undefined;
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name !== undefined) patch.displayName = input.name;
    if (input.firstName !== undefined) patch.firstName = input.firstName;
    if (input.lastName !== undefined) patch.lastName = input.lastName;
    if (input.companyName !== undefined) patch.companyName = input.companyName;
    if (input.status !== undefined) patch.status = input.status;
    if (input.stage !== undefined) patch.lifecycleStage = input.stage;
    if (input.preferredContact !== undefined) patch.preferredContact = input.preferredContact;
    if (input.source !== undefined) patch.source = input.source;
    if (input.summary !== undefined) patch.summary = input.summary;
    if (input.tags !== undefined) patch.tags = input.tags;
    if (input.goodToKnow !== undefined) patch.goodToKnow = input.goodToKnow;
    if (input.notes !== undefined) patch.notes = input.notes;
    const [c] = await this.db
      .update(schema.customers)
      .set(patch)
      .where(eq(schema.customers.id, existing.id))
      .returning();
    return assembleCustomer(await this.bundleFor(c));
  }

  // ── Customer sub-resources ──
  async addContact(customerId: string, input: ContactCreate): Promise<Contact | undefined> {
    const c = await this.resolveCustomer(customerId);
    if (!c) return undefined;
    const [row] = await this.db
      .insert(schema.customerContacts)
      .values({
        tenantId: c.tenantId,
        customerId: c.id,
        kind: input.kind,
        value: input.value,
        label: input.label,
        isPrimary: input.isPrimary ?? false,
        consentStatus: input.consentStatus ?? "unknown",
        consentSource: input.consentSource,
        consentAt: input.consentStatus === "opted_in" ? new Date() : undefined,
      })
      .returning();
    return mapContact(row);
  }

  async addProperty(customerId: string, input: PropertyCreate): Promise<Property | undefined> {
    const c = await this.resolveCustomer(customerId);
    if (!c) return undefined;
    const [row] = await this.db
      .insert(schema.properties)
      .values({
        tenantId: c.tenantId,
        customerId: c.id,
        label: input.label,
        addressLine1: input.addressLine1,
        addressLine2: input.addressLine2,
        city: input.city,
        region: input.region,
        postalCode: input.postalCode,
        country: input.country ?? "US",
        propertyType: input.propertyType,
        bedrooms: input.bedrooms,
        bathrooms: input.bathrooms,
        squareFeet: input.squareFeet,
        accessNotes: input.accessNotes,
        isPrimary: input.isPrimary ?? false,
      })
      .returning();
    return mapProperty(row);
  }

  async updateProperty(
    customerId: string,
    propertyId: string,
    input: PropertyUpdate,
  ): Promise<Property | undefined> {
    const c = await this.resolveCustomer(customerId);
    if (!c) return undefined;
    // Scope the property to this customer so you can't edit someone else's.
    const [existing] = await this.db
      .select()
      .from(schema.properties)
      .where(and(eq(schema.properties.id, propertyId), eq(schema.properties.customerId, c.id)));
    if (!existing) return undefined;

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (input.label !== undefined) patch.label = input.label;
    if (input.addressLine1 !== undefined) patch.addressLine1 = input.addressLine1;
    if (input.addressLine2 !== undefined) patch.addressLine2 = input.addressLine2;
    if (input.city !== undefined) patch.city = input.city;
    if (input.region !== undefined) patch.region = input.region;
    if (input.postalCode !== undefined) patch.postalCode = input.postalCode;
    if (input.country !== undefined) patch.country = input.country;
    if (input.propertyType !== undefined) patch.propertyType = input.propertyType;
    if (input.bedrooms !== undefined) patch.bedrooms = input.bedrooms;
    if (input.bathrooms !== undefined) patch.bathrooms = input.bathrooms;
    if (input.squareFeet !== undefined) patch.squareFeet = input.squareFeet;
    if (input.accessNotes !== undefined) patch.accessNotes = input.accessNotes;
    if (input.isPrimary !== undefined) patch.isPrimary = input.isPrimary;

    // Promoting this property to primary demotes the customer's others.
    if (input.isPrimary === true) {
      await this.db
        .update(schema.properties)
        .set({ isPrimary: false, updatedAt: new Date() })
        .where(and(eq(schema.properties.customerId, c.id), eq(schema.properties.isPrimary, true)));
    }

    const [row] = await this.db
      .update(schema.properties)
      .set(patch)
      .where(eq(schema.properties.id, propertyId))
      .returning();
    return mapProperty(row);
  }

  async createPlan(customerId: string, input: PlanCreate): Promise<Plan | undefined> {
    const c = await this.resolveCustomer(customerId);
    if (!c) return undefined;
    const [row] = await this.db
      .insert(schema.plans)
      .values({
        tenantId: c.tenantId,
        customerId: c.id,
        propertyId: input.propertyId,
        offeringId: input.offeringId,
        name: input.name,
        description: input.description,
        serviceType: input.serviceType,
        frequency: input.frequency,
        status: input.status ?? "active",
        priceCents: input.priceCents,
        startDate: input.startDate,
        endDate: input.endDate,
      })
      .returning();
    return mapPlan(row);
  }

  async createQuote(customerId: string, input: QuoteCreate): Promise<Quote | undefined> {
    const c = await this.resolveCustomer(customerId);
    if (!c) return undefined;
    const [row] = await this.db
      .insert(schema.quotes)
      .values({
        tenantId: c.tenantId,
        customerId: c.id,
        propertyId: input.propertyId,
        status: input.status ?? "draft",
        serviceType: input.serviceType,
        frequency: input.frequency,
        amountCents: input.amountCents,
        priceUnit: input.priceUnit ?? "per-visit",
        validUntil: input.validUntil,
        signal: input.signal ?? "info",
        needsYou: input.needsYou ?? false,
        detail: input.detail,
      })
      .returning();
    return mapQuote(row);
  }

  async createJob(customerId: string, input: JobCreate): Promise<Job | undefined> {
    const c = await this.resolveCustomer(customerId);
    if (!c) return undefined;
    const [row] = await this.db
      .insert(schema.jobs)
      .values({
        tenantId: c.tenantId,
        customerId: c.id,
        propertyId: input.propertyId,
        planId: input.planId,
        quoteId: input.quoteId,
        status: input.status ?? "scheduled",
        serviceType: input.serviceType,
        scheduledStart: input.scheduledStart ? new Date(input.scheduledStart) : undefined,
        scheduledEnd: input.scheduledEnd ? new Date(input.scheduledEnd) : undefined,
        durationMin: input.durationMin,
        completedAt: input.completedAt ? new Date(input.completedAt) : undefined,
        assigneeType: input.assigneeType,
        assignedTeamMemberId: input.assignedTeamMemberId,
        assignedPartnerId: input.assignedPartnerId,
        priceCents: input.priceCents,
      })
      .returning();
    const name =
      row.assignedTeamMemberId || row.assignedPartnerId
        ? await this.workerName(row.assignedTeamMemberId, row.assignedPartnerId)
        : null;
    return mapJob(row, undefined, name);
  }

  async addJobReview(
    customerId: string,
    jobId: string,
    input: ReviewCreate,
  ): Promise<Review | undefined> {
    const c = await this.resolveCustomer(customerId);
    if (!c) return undefined;
    const [job] = await this.db
      .select()
      .from(schema.jobs)
      .where(and(eq(schema.jobs.id, jobId), eq(schema.jobs.customerId, c.id)));
    if (!job) return undefined;
    const [row] = await this.db
      .insert(schema.jobReviews)
      .values({
        tenantId: c.tenantId,
        jobId: job.id,
        customerId: c.id,
        rating: input.rating,
        reviewText: input.reviewText,
        customerNote: input.customerNote,
        reviewer: input.reviewer ?? "customer",
        wouldRecommend: input.wouldRecommend,
        reviewedTeamMemberId: job.assignedTeamMemberId,
        reviewedPartnerId: job.assignedPartnerId,
      })
      .returning();
    return mapReview(row);
  }

  async listAppointments(customerId: string): Promise<Appointment[] | undefined> {
    const c = await this.resolveCustomer(customerId);
    if (!c) return undefined;
    const rows = await this.db
      .select()
      .from(schema.appointments)
      .where(eq(schema.appointments.customerId, c.id))
      .orderBy(asc(schema.appointments.startsAt));
    const out: Appointment[] = [];
    for (const r of rows) {
      const name = await this.workerName(r.assignedTeamMemberId, r.assignedPartnerId);
      out.push(mapAppointment(r, name));
    }
    return out;
  }

  async createAppointment(
    customerId: string,
    input: AppointmentCreate,
  ): Promise<Appointment | undefined> {
    const c = await this.resolveCustomer(customerId);
    if (!c) return undefined;
    const [row] = await this.db
      .insert(schema.appointments)
      .values({
        tenantId: c.tenantId,
        customerId: c.id,
        propertyId: input.propertyId,
        jobId: input.jobId,
        quoteId: input.quoteId,
        kind: input.kind,
        status: input.status ?? "scheduled",
        title: input.title,
        detail: input.detail,
        startsAt: new Date(input.startsAt),
        endsAt: input.endsAt ? new Date(input.endsAt) : undefined,
        durationMin: input.durationMin,
        assigneeType: input.assigneeType,
        assignedTeamMemberId: input.assignedTeamMemberId,
        assignedPartnerId: input.assignedPartnerId,
        locationOverride: input.locationOverride,
      })
      .returning();
    const name = await this.workerName(row.assignedTeamMemberId, row.assignedPartnerId);
    return mapAppointment(row, name);
  }

  async addInteraction(
    customerId: string,
    input: InteractionCreate,
  ): Promise<Interaction | undefined> {
    const c = await this.resolveCustomer(customerId);
    if (!c) return undefined;
    const [row] = await this.db
      .insert(schema.interactions)
      .values({
        tenantId: c.tenantId,
        customerId: c.id,
        type: input.type,
        method: input.method,
        note: input.note,
        occurredAt: input.occurredAt ? new Date(input.occurredAt) : undefined,
        handledByTeamMemberId: input.handledByTeamMemberId,
        handledByPartnerId: input.handledByPartnerId,
      })
      .returning();
    const name = await this.workerName(row.handledByTeamMemberId, row.handledByPartnerId);
    return mapInteraction(row, name);
  }

  // ── Service offerings (reusable catalog) ──
  async listServiceOfferings(): Promise<ServiceOffering[]> {
    const rows = await this.db.select().from(schema.serviceOfferings);
    return rows.map(mapServiceOffering);
  }

  async createServiceOffering(input: ServiceOfferingCreate): Promise<ServiceOffering> {
    const tenantId = await this.tenantId();
    const [row] = await this.db
      .insert(schema.serviceOfferings)
      .values({
        tenantId,
        name: input.name,
        serviceType: input.serviceType,
        frequency: input.frequency,
        description: input.description,
        defaultPriceCents: input.defaultPriceCents,
        isActive: input.isActive ?? true,
      })
      .returning();
    return mapServiceOffering(row);
  }

  async updateServiceOffering(
    id: string,
    input: ServiceOfferingUpdate,
  ): Promise<ServiceOffering | undefined> {
    // Build a patch of only the provided fields.
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name !== undefined) patch.name = input.name;
    if (input.serviceType !== undefined) patch.serviceType = input.serviceType;
    if (input.frequency !== undefined) patch.frequency = input.frequency;
    if (input.description !== undefined) patch.description = input.description;
    if (input.defaultPriceCents !== undefined) patch.defaultPriceCents = input.defaultPriceCents;
    if (input.isActive !== undefined) patch.isActive = input.isActive;
    const [row] = await this.db
      .update(schema.serviceOfferings)
      .set(patch)
      .where(eq(schema.serviceOfferings.id, id))
      .returning();
    return row ? mapServiceOffering(row) : undefined;
  }

  private async workerName(teamMemberId: string | null, partnerId: string | null): Promise<string | null> {
    if (teamMemberId) {
      const [r] = await this.db.select().from(schema.teamMembers).where(eq(schema.teamMembers.id, teamMemberId));
      return r?.displayName ?? null;
    }
    if (partnerId) {
      const [r] = await this.db.select().from(schema.partners).where(eq(schema.partners.id, partnerId));
      return r?.displayName ?? null;
    }
    return null;
  }

  // ── Partners (list/detail; rollups + related entities derived — design Q6) ──
  async listPartners(): Promise<PartnerListItem[]> {
    const [partners, customers, jobs] = await Promise.all([
      this.db.select().from(schema.partners),
      this.db.select().from(schema.customers),
      this.db.select().from(schema.jobs),
    ]);
    const byId = new Map(customers.map((c) => [c.id, c]));
    return partners.map((p) => {
      const referred = customers.filter((c) => c.referredByPartnerId === p.id);
      const covered = jobs.filter((j) => j.assignedPartnerId === p.id);
      const { rollups } = partnerRelations(referred, covered, byId);
      return partnerListItem(p, rollups);
    });
  }

  async getPartner(id: string): Promise<Partner | undefined> {
    if (!isUuid(id)) return undefined;
    const [p] = await this.db.select().from(schema.partners).where(eq(schema.partners.id, id));
    if (!p) return undefined;
    return this.assemblePartner(p);
  }

  /** Assemble a partner's rollups + related customers/jobs from related rows. */
  private async assemblePartner(
    p: InferSelectModel<typeof schema.partners>,
  ): Promise<Partner> {
    const [referred, covered] = await Promise.all([
      this.db.select().from(schema.customers).where(eq(schema.customers.referredByPartnerId, p.id)),
      this.db.select().from(schema.jobs).where(eq(schema.jobs.assignedPartnerId, p.id)),
    ]);
    // Resolve names for the customers involved (referred ∪ served).
    const ids = Array.from(new Set([...referred.map((c) => c.id), ...covered.map((j) => j.customerId)]));
    const customers = ids.length
      ? await this.db.select().from(schema.customers).where(inArray(schema.customers.id, ids))
      : [];
    const byId = new Map(customers.map((c) => [c.id, c]));
    // Ensure referred rows are in the map too (they're a subset of `customers`).
    for (const c of referred) byId.set(c.id, c);
    const { rollups, relatedCustomers, relatedJobs } = partnerRelations(referred, covered, byId);
    return partnerDetail(p, rollups, relatedCustomers, relatedJobs);
  }

  async createPartner(input: PartnerCreate): Promise<Partner> {
    const tenantId = await this.tenantId();
    const [r] = await this.db
      .insert(schema.partners)
      .values({
        tenantId,
        displayName: input.name,
        type: input.type,
        stage: input.stage ?? "prospect",
        contactName: input.contactName,
        email: input.email,
        phone: input.phone,
        location: input.location,
        since: input.since,
        skills: input.skills ?? [],
        commissionBps: input.commissionBps,
        summary: input.summary ?? "",
        notes: input.notes,
      })
      .returning();
    return this.assemblePartner(r);
  }

  async updatePartner(id: string, input: PartnerUpdate): Promise<Partner | undefined> {
    if (!isUuid(id)) return undefined;
    const [existing] = await this.db.select().from(schema.partners).where(eq(schema.partners.id, id));
    if (!existing) return undefined;
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name !== undefined) patch.displayName = input.name;
    if (input.type !== undefined) patch.type = input.type;
    if (input.stage !== undefined) patch.stage = input.stage;
    if (input.contactName !== undefined) patch.contactName = input.contactName;
    if (input.email !== undefined) patch.email = input.email;
    if (input.phone !== undefined) patch.phone = input.phone;
    if (input.location !== undefined) patch.location = input.location;
    if (input.since !== undefined) patch.since = input.since;
    if (input.skills !== undefined) patch.skills = input.skills;
    if (input.commissionBps !== undefined) patch.commissionBps = input.commissionBps;
    if (input.summary !== undefined) patch.summary = input.summary;
    if (input.notes !== undefined) patch.notes = input.notes;
    const [r] = await this.db
      .update(schema.partners)
      .set(patch)
      .where(eq(schema.partners.id, id))
      .returning();
    return this.assemblePartner(r);
  }

  // ── Team members (full-time staff) ──
  async listTeamMembers(): Promise<TeamMemberListItem[]> {
    const [rows, jobs, reviews] = await Promise.all([
      this.db.select().from(schema.teamMembers),
      this.db.select().from(schema.jobs),
      this.db.select().from(schema.jobReviews),
    ]);
    return rows.map((r) => ({
      id: r.id,
      name: r.displayName,
      status: r.status,
      employmentType: r.employmentType,
      skills: r.skills,
      homeBase: r.homeBase,
      ...teamMemberRollups(r.id, jobs, reviews),
    }));
  }

  async getTeamStats(): Promise<TeamStats> {
    const [teamMembers, jobs, reviews, customers] = await Promise.all([
      this.db.select().from(schema.teamMembers),
      this.db.select().from(schema.jobs),
      this.db.select().from(schema.jobReviews),
      this.db.select().from(schema.customers),
    ]);
    return assembleTeamStats(teamMembers, jobs, reviews, customers);
  }

  // ── Current user (settings) ──
  private async tenantRow() {
    const [t] = await this.db.select().from(schema.tenants).limit(1);
    if (t) return t;
    const [created] = await this.db
      .insert(schema.tenants)
      .values({ name: "Default", slug: "default" })
      .returning();
    return created;
  }

  async getMyProfile(identity: UserIdentity): Promise<UserProfile> {
    const tenant = await this.tenantRow();
    const [row] = await this.db
      .select()
      .from(schema.userProfiles)
      .where(and(eq(schema.userProfiles.tenantId, tenant.id), eq(schema.userProfiles.sub, identity.sub)));
    return assembleUserProfile(identity, tenant, row);
  }

  async updateMyProfile(identity: UserIdentity, input: UserProfileUpdate): Promise<UserProfile> {
    const tenant = await this.tenantRow();
    const [existing] = await this.db
      .select()
      .from(schema.userProfiles)
      .where(and(eq(schema.userProfiles.tenantId, tenant.id), eq(schema.userProfiles.sub, identity.sub)));

    const mergedPrefs = input.preferences
      ? { ...mergePreferences(existing?.preferences), ...input.preferences }
      : (existing?.preferences ?? {});

    const patch = {
      firstName: input.firstName !== undefined ? input.firstName : (existing?.firstName ?? null),
      lastName: input.lastName !== undefined ? input.lastName : (existing?.lastName ?? null),
      workNumber: input.workNumber !== undefined ? input.workNumber : (existing?.workNumber ?? null),
      mobileNumber:
        input.mobileNumber !== undefined ? input.mobileNumber : (existing?.mobileNumber ?? null),
      preferences: mergedPrefs as Record<string, unknown>,
      updatedAt: new Date(),
    };

    let row: InferSelectModel<typeof schema.userProfiles>;
    if (existing) {
      [row] = await this.db
        .update(schema.userProfiles)
        .set(patch)
        .where(eq(schema.userProfiles.id, existing.id))
        .returning();
    } else {
      [row] = await this.db
        .insert(schema.userProfiles)
        .values({ tenantId: tenant.id, sub: identity.sub, ...patch })
        .returning();
    }
    return assembleUserProfile(identity, tenant, row);
  }

  async getPartnerHighlights(): Promise<PartnerHighlights> {
    const [partners, customers, jobs, reviews] = await Promise.all([
      this.db.select().from(schema.partners),
      this.db.select().from(schema.customers),
      this.db.select().from(schema.jobs),
      this.db.select().from(schema.jobReviews),
    ]);
    return assemblePartnerHighlights(partners, customers, jobs, reviews);
  }

  async getUpcomingPartnerItems(): Promise<UpcomingPartnerItem[]> {
    const now = new Date();
    const [jobs, appointments] = await Promise.all([
      this.db
        .select()
        .from(schema.jobs)
        .where(and(isNotNull(schema.jobs.assignedPartnerId), gte(schema.jobs.scheduledStart, now))),
      this.db
        .select()
        .from(schema.appointments)
        .where(
          and(isNotNull(schema.appointments.assignedPartnerId), gte(schema.appointments.startsAt, now)),
        ),
    ]);
    const partnerIds = Array.from(
      new Set(
        [...jobs, ...appointments]
          .map((r) => r.assignedPartnerId)
          .filter((x): x is string => !!x),
      ),
    );
    const names = new Map<string, string>();
    if (partnerIds.length) {
      const rows = await this.db
        .select()
        .from(schema.partners)
        .where(inArray(schema.partners.id, partnerIds));
      for (const r of rows) names.set(r.id, r.displayName);
    }
    return upcomingPartnerItems(jobs, appointments, names, now);
  }

  async createTeamMember(input: TeamMemberCreate): Promise<TeamMember> {
    const tenantId = await this.tenantId();
    const [r] = await this.db
      .insert(schema.teamMembers)
      .values({
        tenantId,
        displayName: input.name,
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        phone: input.phone,
        status: input.status ?? "active",
        employmentType: input.employmentType ?? "full-time",
        hiredOn: input.hiredOn,
        skills: input.skills ?? [],
        homeBase: input.homeBase,
        notes: input.notes,
      })
      .returning();
    return {
      id: r.id,
      name: r.displayName,
      email: r.email,
      phone: r.phone,
      status: r.status,
      employmentType: r.employmentType,
      hiredOn: r.hiredOn,
      skills: r.skills,
      homeBase: r.homeBase,
    };
  }

  // ── Global keyword search (all object types) ──
  async search(query: string): Promise<SearchResults> {
    if (query.trim().length === 0) return { query: query.trim(), total: 0, groups: [] };
    const [
      customers, contacts, partners, teamMembers, offerings, properties, plans, quotes, jobs, appointments,
    ] = await Promise.all([
      this.db.select().from(schema.customers),
      this.db.select().from(schema.customerContacts),
      this.db.select().from(schema.partners),
      this.db.select().from(schema.teamMembers),
      this.db.select().from(schema.serviceOfferings),
      this.db.select().from(schema.properties),
      this.db.select().from(schema.plans),
      this.db.select().from(schema.quotes),
      this.db.select().from(schema.jobs),
      this.db.select().from(schema.appointments),
    ]);
    return searchCorpus(
      { customers, contacts, partners, teamMembers, offerings, properties, plans, quotes, jobs, appointments },
      query,
    );
  }

  // ── Quotes: pipeline card edits (status via drag-drop, inline fields) ──
  async updateQuote(id: string, input: QuoteUpdate): Promise<Quote | undefined> {
    if (!isUuid(id)) return undefined;
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (input.status !== undefined) {
      patch.status = input.status;
      // Stamp decidedAt when a quote reaches a terminal state.
      if (input.status === "accepted" || input.status === "declined") patch.decidedAt = new Date();
    }
    if (input.detail !== undefined) patch.detail = input.detail;
    if (input.amountCents !== undefined) patch.amountCents = input.amountCents;
    if (input.needsYou !== undefined) patch.needsYou = input.needsYou;
    const [row] = await this.db
      .update(schema.quotes)
      .set(patch)
      .where(eq(schema.quotes.id, id))
      .returning();
    return row ? mapQuote(row) : undefined;
  }

  // ── Pipeline = quotes grouped by status (design Q1) ──
  async getPipeline(): Promise<Pipeline> {
    const [rows, customers] = await Promise.all([
      this.db.select().from(schema.quotes),
      this.db.select().from(schema.customers),
    ]);
    const nameById = new Map(customers.map((c) => [c.id, c.displayName]));
    const stats = assemblePipelineStats(rows);
    const stages: PipelineStage[] = PIPELINE_STAGES.map((meta) => ({
      id: meta.id as PipelineStage["id"],
      label: meta.label,
      dot: meta.dot,
      deals: rows
        .filter((q) => !q.archivedAt && (STATUS_TO_STAGE[q.status] ?? "new") === meta.id)
        .map((q) => ({
          id: q.id,
          stageId: meta.id as PipelineStage["id"],
          customerId: q.customerId,
          customerName: nameById.get(q.customerId) ?? "Customer",
          name: q.detail ?? "Quote",
          price: q.amountCents != null ? Math.round(q.amountCents / 100) : undefined,
          priceUnit: q.priceUnit === "per-visit" ? ("visit" as const) : ("flat" as const),
          detail: q.detail ?? "",
          signal: q.signal,
          chip: q.status,
          needsYou: q.needsYou,
        })),
    }));
    return {
      summary: {
        openCount: stats.openCount,
        openValue: stats.openValue.display,
        movedByCori: seed.pipeline.summary.movedByCori,
      },
      stages,
    };
  }

  async getPipelineStats(): Promise<PipelineStats> {
    const rows = await this.db.select().from(schema.quotes);
    return assemblePipelineStats(rows);
  }

  // ── Conversations: not modeled in this schema; serve from seed ──
  async listConversations(): Promise<ConvoListItem[]> {
    return seed.conversationList;
  }
  async getConversation(id: string): Promise<ConversationDetail | undefined> {
    return seed.conversations[id];
  }

  // ── Calendar: appointments from the new schema, bucketed into the week ──
  async getCalendarWeek(): Promise<CalendarWeek> {
    const rows = await this.db
      .select()
      .from(schema.appointments)
      .orderBy(asc(schema.appointments.startsAt));
    // Monday-anchored week index from the real datetime.
    const kindMap: Record<string, CalendarWeek["appointments"][number]["kind"]> = {
      clean: "clean",
      walkthrough: "walkthrough",
      "quote-visit": "quote",
      call: "partner",
      other: "partner",
    };
    return {
      weekDays: seed.calendarWeek.weekDays,
      summary: seed.calendarWeek.summary,
      appointments: rows.map((a) => {
        const d = a.startsAt;
        const dayIndex = (d.getDay() + 6) % 7; // 0 = Mon
        const start = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
        return {
          id: a.id,
          dayIndex,
          start,
          durationMin: a.durationMin ?? 60,
          title: a.title,
          detail: a.detail ?? "",
          kind: kindMap[a.kind] ?? "partner",
        };
      }),
    };
  }
}
