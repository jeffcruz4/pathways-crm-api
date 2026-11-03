import { eq, and, asc, inArray } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { Repository } from "./repository.js";
import * as schema from "../db/schema.js";
import * as seed from "./seed.js";
import type { InferSelectModel } from "drizzle-orm";
import {
  assembleCustomer,
  mapContact,
  mapProperty,
  mapPlan,
  mapQuote,
  mapReview,
  mapJob,
  mapServiceOffering,
  mapAppointment,
  partnerListItem,
  partnerDetail,
  type CustomerBundle,
} from "./assemble.js";
import type { Customer, CustomerListItem, CustomerCreate } from "../domain/customer.js";
import type { Partner, PartnerListItem, PartnerCreate } from "../domain/partner.js";
import type { TeamMember, TeamMemberListItem, TeamMemberCreate } from "../domain/team-member.js";
import type { Pipeline, PipelineStage } from "../domain/deal.js";
import type { ConvoListItem, ConversationDetail } from "../domain/conversation.js";
import type { CalendarWeek } from "../domain/calendar.js";
import type {
  Contact,
  ContactCreate,
  Property,
  PropertyCreate,
  Plan,
  PlanCreate,
  Quote,
  QuoteCreate,
  Job,
  JobCreate,
  Review,
  ReviewCreate,
  ServiceOffering,
  ServiceOfferingCreate,
  Appointment,
  AppointmentCreate,
} from "../domain/crm.js";

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
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug);
    const col = isUuid ? schema.customers.id : schema.customers.slug;
    const [row] = await this.db.select().from(schema.customers).where(eq(col, idOrSlug));
    return row;
  }

  private async bundleFor(
    customer: InferSelectModel<typeof schema.customers>,
  ): Promise<CustomerBundle> {
    const cid = customer.id;
    const [contacts, properties, plans, quotes, jobs] = await Promise.all([
      this.db.select().from(schema.customerContacts).where(eq(schema.customerContacts.customerId, cid)),
      this.db.select().from(schema.properties).where(eq(schema.properties.customerId, cid)),
      this.db.select().from(schema.plans).where(eq(schema.plans.customerId, cid)),
      this.db.select().from(schema.quotes).where(eq(schema.quotes.customerId, cid)),
      this.db.select().from(schema.jobs).where(eq(schema.jobs.customerId, cid)),
    ]);

    const jobIds = jobs.map((j) => j.id);
    const reviews = jobIds.length
      ? await this.db.select().from(schema.jobReviews).where(inArray(schema.jobReviews.jobId, jobIds))
      : [];
    const reviewsByJob = new Map(reviews.map((r) => [r.jobId, r]));

    // Resolve worker display names for assigned jobs.
    const teamMemberIds = jobs.map((j) => j.assignedTeamMemberId).filter((x): x is string => !!x);
    const partnerIds = jobs.map((j) => j.assignedPartnerId).filter((x): x is string => !!x);
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

    return { customer, contacts, properties, plans, quotes, jobs, reviewsByJob, workerNameById };
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

  // ── Partners (list/detail; rollups derived — 0 until computed) ──
  async listPartners(): Promise<PartnerListItem[]> {
    const rows = await this.db.select().from(schema.partners);
    return rows.map(partnerListItem);
  }

  async getPartner(id: string): Promise<Partner | undefined> {
    const [r] = await this.db.select().from(schema.partners).where(eq(schema.partners.id, id));
    return r ? partnerDetail(r) : undefined;
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
    return partnerDetail(r);
  }

  // ── Team members (full-time staff) ──
  async listTeamMembers(): Promise<TeamMemberListItem[]> {
    const rows = await this.db.select().from(schema.teamMembers);
    return rows.map((r) => ({
      id: r.id,
      name: r.displayName,
      status: r.status,
      employmentType: r.employmentType,
      skills: r.skills,
      homeBase: r.homeBase,
    }));
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

  // ── Pipeline = quotes grouped by status (design Q1) ──
  async getPipeline(): Promise<Pipeline> {
    const rows = await this.db.select().from(schema.quotes);
    // Map quote statuses onto the UI's pipeline stage buckets.
    const stageMeta = seed.pipeline.stages.map((s) => ({ id: s.id, label: s.label, dot: s.dot }));
    const statusToStage: Record<string, string> = {
      draft: "new",
      sent: "quote-sent",
      "follow-up": "follow-up",
      accepted: "booked",
      declined: "booked",
      expired: "new",
    };
    const stages: PipelineStage[] = stageMeta.map((meta) => ({
      id: meta.id,
      label: meta.label,
      dot: meta.dot,
      deals: rows
        .filter((q) => (statusToStage[q.status] ?? "new") === meta.id)
        .map((q) => ({
          id: q.id,
          stageId: meta.id,
          name: q.detail ?? "Quote",
          price: q.amountCents != null ? Math.round(q.amountCents / 100) : undefined,
          priceUnit: q.priceUnit === "per-visit" ? ("visit" as const) : ("flat" as const),
          detail: q.detail ?? "",
          signal: q.signal,
          chip: q.status,
          needsYou: q.needsYou,
        })),
    }));
    return { summary: seed.pipeline.summary, stages };
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
