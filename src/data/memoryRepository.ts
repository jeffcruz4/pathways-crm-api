import { randomUUID } from "node:crypto";
import type { InferSelectModel } from "drizzle-orm";
import type { Repository } from "./repository.js";
import * as schema from "../db/schema.js";
import * as seed from "./seed.js";
import * as rel from "./seedRelational.js";
import {
  assembleCustomer,
  mapContact,
  mapProperty,
  mapPlan,
  mapQuote,
  mapReview,
  mapJob,
  partnerListItem,
  partnerDetail,
  type CustomerBundle,
} from "./assemble.js";
import type { Customer, CustomerListItem, CustomerCreate } from "../domain/customer.js";
import type { Partner, PartnerListItem, PartnerCreate } from "../domain/partner.js";
import type { Cleaner, CleanerListItem, CleanerCreate } from "../domain/cleaner.js";
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
} from "../domain/crm.js";

type CustomerRow = InferSelectModel<typeof schema.customers>;
type ContactRow = InferSelectModel<typeof schema.customerContacts>;
type PropertyRow = InferSelectModel<typeof schema.properties>;
type PlanRow = InferSelectModel<typeof schema.plans>;
type QuoteRow = InferSelectModel<typeof schema.quotes>;
type JobRow = InferSelectModel<typeof schema.jobs>;
type ReviewRow = InferSelectModel<typeof schema.jobReviews>;
type CleanerRow = InferSelectModel<typeof schema.cleaners>;
type PartnerRow = InferSelectModel<typeof schema.partners>;

const nowTs = () => new Date();

/**
 * In-memory repository. Builds a relational store from the sample dataset and
 * assembles the 360° customer record with the same logic as Postgres. Supports
 * the create methods (mutating the in-process store) so the UI's write flows
 * work without a database. Default backend (DATA_BACKEND=memory).
 */
export class MemoryRepository implements Repository {
  private customers: CustomerRow[] = [];
  private contacts: ContactRow[] = [];
  private properties: PropertyRow[] = [];
  private plans: PlanRow[] = [];
  private quotes: QuoteRow[] = [];
  private jobs: JobRow[] = [];
  private reviews: ReviewRow[] = [];
  private cleaners: CleanerRow[] = [];
  private partners: PartnerRow[] = [];
  private workerNames = new Map<string, string>();
  private readonly tenantId = rel.tenant.id!;

  constructor() {
    this.cleaners = rel.cleaners.map((c) => this.fillCleaner(c));
    this.partners = rel.partners.map((p) => this.fillPartner(p));
    // Normalize insert-model seed rows into full select-model rows.
    this.customers = rel.customers.map((c) => this.fillCustomer(c));
    this.contacts = rel.contacts.map((c) => this.fillContact(c));
    this.properties = rel.properties.map((p) => this.fillProperty(p));
    this.plans = rel.plans.map((p) => this.fillPlan(p));
    this.quotes = rel.quotes.map((q) => this.fillQuote(q));
    this.jobs = rel.jobs.map((j) => this.fillJob(j));
    this.reviews = rel.reviews.map((r) => this.fillReview(r));
    for (const e of rel.cleaners) this.workerNames.set(e.id!, e.displayName);
    for (const p of rel.partners) this.workerNames.set(p.id!, p.displayName);
  }

  // ── row fillers (insert-model → select-model with defaults) ──
  private fillCustomer(c: (typeof rel.customers)[number]): CustomerRow {
    return {
      id: c.id ?? randomUUID(),
      tenantId: c.tenantId,
      slug: c.slug ?? null,
      displayName: c.displayName,
      firstName: c.firstName ?? null,
      lastName: c.lastName ?? null,
      companyName: c.companyName ?? null,
      status: c.status ?? "lead",
      lifecycleStage: c.lifecycleStage ?? "new-lead",
      preferredContact: c.preferredContact ?? null,
      source: c.source ?? null,
      referredByPartnerId: c.referredByPartnerId ?? null,
      summary: c.summary ?? "",
      provenance: c.provenance ?? "",
      goodToKnow: c.goodToKnow ?? [],
      tags: c.tags ?? [],
      notes: c.notes ?? null,
      createdAt: nowTs(),
      updatedAt: nowTs(),
      archivedAt: null,
    };
  }
  private fillContact(c: (typeof rel.contacts)[number]): ContactRow {
    return {
      id: c.id ?? randomUUID(),
      tenantId: c.tenantId,
      customerId: c.customerId,
      kind: c.kind,
      value: c.value,
      label: c.label ?? null,
      isPrimary: c.isPrimary ?? false,
      verifiedAt: c.verifiedAt ?? null,
      consentStatus: c.consentStatus ?? "unknown",
      consentSource: c.consentSource ?? null,
      consentAt: c.consentAt ?? null,
      optOutAt: c.optOutAt ?? null,
      createdAt: nowTs(),
      updatedAt: nowTs(),
    };
  }
  private fillProperty(p: (typeof rel.properties)[number]): PropertyRow {
    return {
      id: p.id ?? randomUUID(),
      tenantId: p.tenantId,
      customerId: p.customerId,
      label: p.label ?? null,
      addressLine1: p.addressLine1,
      addressLine2: p.addressLine2 ?? null,
      city: p.city,
      region: p.region,
      postalCode: p.postalCode,
      country: p.country ?? "US",
      latitude: p.latitude ?? null,
      longitude: p.longitude ?? null,
      propertyType: p.propertyType ?? null,
      bedrooms: p.bedrooms ?? null,
      bathrooms: p.bathrooms ?? null,
      squareFeet: p.squareFeet ?? null,
      accessNotes: p.accessNotes ?? null,
      homeDetails: p.homeDetails ?? [],
      isPrimary: p.isPrimary ?? false,
      createdAt: nowTs(),
      updatedAt: nowTs(),
      archivedAt: null,
    };
  }
  private fillPlan(p: (typeof rel.plans)[number]): PlanRow {
    return {
      id: p.id ?? randomUUID(),
      tenantId: p.tenantId,
      customerId: p.customerId,
      propertyId: p.propertyId,
      offeringId: p.offeringId ?? null,
      name: p.name,
      description: p.description ?? null,
      serviceType: p.serviceType,
      frequency: p.frequency,
      status: p.status ?? "active",
      priceCents: p.priceCents,
      currency: p.currency ?? "USD",
      startDate: p.startDate ?? null,
      endDate: p.endDate ?? null,
      sourceQuoteId: p.sourceQuoteId ?? null,
      createdAt: nowTs(),
      updatedAt: nowTs(),
      archivedAt: null,
    };
  }
  private fillQuote(q: (typeof rel.quotes)[number]): QuoteRow {
    return {
      id: q.id ?? randomUUID(),
      tenantId: q.tenantId,
      customerId: q.customerId,
      propertyId: q.propertyId ?? null,
      status: q.status ?? "draft",
      serviceType: q.serviceType,
      frequency: q.frequency ?? null,
      amountCents: q.amountCents,
      currency: q.currency ?? "USD",
      priceUnit: q.priceUnit ?? "per-visit",
      validUntil: q.validUntil ?? null,
      sentAt: q.sentAt ?? null,
      decidedAt: q.decidedAt ?? null,
      signal: q.signal ?? "info",
      needsYou: q.needsYou ?? false,
      detail: q.detail ?? null,
      coriNotes: q.coriNotes ?? null,
      createdAt: nowTs(),
      updatedAt: nowTs(),
      archivedAt: null,
    };
  }
  private fillJob(j: (typeof rel.jobs)[number]): JobRow {
    return {
      id: j.id ?? randomUUID(),
      tenantId: j.tenantId,
      customerId: j.customerId,
      propertyId: j.propertyId,
      planId: j.planId ?? null,
      quoteId: j.quoteId ?? null,
      status: j.status ?? "scheduled",
      serviceType: j.serviceType,
      scheduledStart: j.scheduledStart ?? null,
      scheduledEnd: j.scheduledEnd ?? null,
      durationMin: j.durationMin ?? null,
      completedAt: j.completedAt ?? null,
      assigneeType: j.assigneeType ?? null,
      assignedCleanerId: j.assignedCleanerId ?? null,
      assignedPartnerId: j.assignedPartnerId ?? null,
      priceCents: j.priceCents ?? null,
      currency: j.currency ?? "USD",
      notes: j.notes ?? null,
      createdAt: nowTs(),
      updatedAt: nowTs(),
      archivedAt: null,
    };
  }
  private fillReview(r: (typeof rel.reviews)[number]): ReviewRow {
    return {
      id: r.id ?? randomUUID(),
      tenantId: r.tenantId,
      jobId: r.jobId,
      customerId: r.customerId,
      rating: r.rating ?? null,
      reviewText: r.reviewText ?? null,
      customerNote: r.customerNote ?? null,
      reviewer: r.reviewer ?? "customer",
      wouldRecommend: r.wouldRecommend ?? null,
      reviewedCleanerId: r.reviewedCleanerId ?? null,
      reviewedPartnerId: r.reviewedPartnerId ?? null,
      createdAt: nowTs(),
      updatedAt: nowTs(),
    };
  }
  private fillCleaner(c: (typeof rel.cleaners)[number]): CleanerRow {
    return {
      id: c.id ?? randomUUID(),
      tenantId: c.tenantId,
      slug: c.slug ?? null,
      displayName: c.displayName,
      firstName: c.firstName ?? null,
      lastName: c.lastName ?? null,
      email: c.email ?? null,
      phone: c.phone ?? null,
      status: c.status ?? "active",
      hiredOn: c.hiredOn ?? null,
      employmentType: c.employmentType ?? "full-time",
      skills: c.skills ?? [],
      homeBase: c.homeBase ?? null,
      notes: c.notes ?? null,
      createdAt: nowTs(),
      updatedAt: nowTs(),
      archivedAt: null,
    };
  }
  private fillPartner(p: (typeof rel.partners)[number]): PartnerRow {
    return {
      id: p.id ?? randomUUID(),
      tenantId: p.tenantId,
      slug: p.slug ?? null,
      displayName: p.displayName,
      type: p.type,
      stage: p.stage ?? "prospect",
      contactName: p.contactName ?? null,
      email: p.email ?? null,
      phone: p.phone ?? null,
      location: p.location ?? null,
      since: p.since ?? null,
      skills: p.skills ?? [],
      commissionBps: p.commissionBps ?? null,
      summary: p.summary ?? "",
      notes: p.notes ?? null,
      createdAt: nowTs(),
      updatedAt: nowTs(),
      archivedAt: null,
    };
  }

  private find(idOrSlug: string): CustomerRow | undefined {
    return this.customers.find((c) => c.id === idOrSlug || c.slug === idOrSlug);
  }

  private bundleFor(c: CustomerRow): CustomerBundle {
    const jobs = this.jobs.filter((j) => j.customerId === c.id);
    const reviewsByJob = new Map(
      this.reviews.filter((r) => r.customerId === c.id).map((r) => [r.jobId, r]),
    );
    return {
      customer: c,
      contacts: this.contacts.filter((x) => x.customerId === c.id),
      properties: this.properties.filter((p) => p.customerId === c.id),
      plans: this.plans.filter((p) => p.customerId === c.id),
      quotes: this.quotes.filter((q) => q.customerId === c.id),
      jobs,
      reviewsByJob,
      workerNameById: this.workerNames,
    };
  }

  // ── Home / digest / conversations / calendar: from legacy seed ──
  async getHome() {
    return seed.home;
  }
  async getDigest() {
    return seed.digest;
  }
  async listConversations() {
    return seed.conversationList;
  }
  async getConversation(id: string) {
    return seed.conversations[id];
  }
  async getCalendarWeek() {
    return seed.calendarWeek;
  }

  // ── Customers ──
  async listCustomers(): Promise<CustomerListItem[]> {
    return this.customers.map((c) => {
      const full = assembleCustomer(this.bundleFor(c));
      return {
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
      };
    });
  }

  async getCustomer(id: string): Promise<Customer | undefined> {
    const c = this.find(id);
    return c ? assembleCustomer(this.bundleFor(c)) : undefined;
  }

  async createCustomer(input: CustomerCreate): Promise<Customer> {
    const row = this.fillCustomer({
      tenantId: this.tenantId,
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
      slug: null,
    });
    this.customers.push(row);
    if (input.mobile) {
      this.contacts.push(
        this.fillContact({ tenantId: this.tenantId, customerId: row.id, kind: "mobile", value: input.mobile, isPrimary: true }),
      );
    }
    if (input.email) {
      this.contacts.push(
        this.fillContact({ tenantId: this.tenantId, customerId: row.id, kind: "email", value: input.email, isPrimary: true }),
      );
    }
    return assembleCustomer(this.bundleFor(row));
  }

  async addContact(customerId: string, input: ContactCreate): Promise<Contact | undefined> {
    const c = this.find(customerId);
    if (!c) return undefined;
    const row = this.fillContact({
      tenantId: c.tenantId,
      customerId: c.id,
      kind: input.kind,
      value: input.value,
      label: input.label,
      isPrimary: input.isPrimary ?? false,
      consentStatus: input.consentStatus ?? "unknown",
      consentSource: input.consentSource,
      consentAt: input.consentStatus === "opted_in" ? nowTs() : null,
    });
    this.contacts.push(row);
    return mapContact(row);
  }

  async addProperty(customerId: string, input: PropertyCreate): Promise<Property | undefined> {
    const c = this.find(customerId);
    if (!c) return undefined;
    const row = this.fillProperty({
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
    });
    this.properties.push(row);
    return mapProperty(row);
  }

  async createPlan(customerId: string, input: PlanCreate): Promise<Plan | undefined> {
    const c = this.find(customerId);
    if (!c) return undefined;
    const row = this.fillPlan({
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
    });
    this.plans.push(row);
    return mapPlan(row);
  }

  async createQuote(customerId: string, input: QuoteCreate): Promise<Quote | undefined> {
    const c = this.find(customerId);
    if (!c) return undefined;
    const row = this.fillQuote({
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
    });
    this.quotes.push(row);
    return mapQuote(row);
  }

  async createJob(customerId: string, input: JobCreate): Promise<Job | undefined> {
    const c = this.find(customerId);
    if (!c) return undefined;
    const row = this.fillJob({
      tenantId: c.tenantId,
      customerId: c.id,
      propertyId: input.propertyId,
      planId: input.planId,
      quoteId: input.quoteId,
      status: input.status ?? "scheduled",
      serviceType: input.serviceType,
      scheduledStart: input.scheduledStart ? new Date(input.scheduledStart) : null,
      scheduledEnd: input.scheduledEnd ? new Date(input.scheduledEnd) : null,
      durationMin: input.durationMin,
      completedAt: input.completedAt ? new Date(input.completedAt) : null,
      assigneeType: input.assigneeType,
      assignedCleanerId: input.assignedCleanerId,
      assignedPartnerId: input.assignedPartnerId,
      priceCents: input.priceCents,
    });
    this.jobs.push(row);
    const workerId = row.assignedCleanerId ?? row.assignedPartnerId ?? null;
    return mapJob(row, undefined, workerId ? (this.workerNames.get(workerId) ?? null) : null);
  }

  async addJobReview(
    customerId: string,
    jobId: string,
    input: ReviewCreate,
  ): Promise<Review | undefined> {
    const c = this.find(customerId);
    if (!c) return undefined;
    const job = this.jobs.find((j) => j.id === jobId && j.customerId === c.id);
    if (!job) return undefined;
    const row = this.fillReview({
      tenantId: c.tenantId,
      jobId: job.id,
      customerId: c.id,
      rating: input.rating,
      reviewText: input.reviewText,
      customerNote: input.customerNote,
      reviewer: input.reviewer ?? "customer",
      wouldRecommend: input.wouldRecommend,
      reviewedCleanerId: job.assignedCleanerId,
      reviewedPartnerId: job.assignedPartnerId,
    });
    this.reviews.push(row);
    return mapReview(row);
  }

  // ── Partners ──
  async listPartners(): Promise<PartnerListItem[]> {
    return this.partners.map(partnerListItem);
  }

  async getPartner(id: string) {
    const p = this.partners.find((x) => x.id === id);
    return p ? partnerDetail(p) : undefined;
  }

  async createPartner(input: PartnerCreate): Promise<Partner> {
    const row = this.fillPartner({
      tenantId: this.tenantId,
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
    });
    this.partners.push(row);
    this.workerNames.set(row.id, row.displayName);
    return partnerDetail(row);
  }

  // ── Cleaners ──
  async listCleaners(): Promise<CleanerListItem[]> {
    return this.cleaners.map((r) => ({
      id: r.id,
      name: r.displayName,
      status: r.status,
      employmentType: r.employmentType,
      skills: r.skills,
      homeBase: r.homeBase,
    }));
  }

  async createCleaner(input: CleanerCreate): Promise<Cleaner> {
    const row = this.fillCleaner({
      tenantId: this.tenantId,
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
    });
    this.cleaners.push(row);
    this.workerNames.set(row.id, row.displayName);
    return {
      id: row.id,
      name: row.displayName,
      email: row.email,
      phone: row.phone,
      status: row.status,
      employmentType: row.employmentType,
      hiredOn: row.hiredOn,
      skills: row.skills,
      homeBase: row.homeBase,
    };
  }

  // ── Pipeline = quotes grouped into stages ──
  async getPipeline() {
    const statusToStage: Record<string, string> = {
      draft: "new",
      sent: "quote-sent",
      "follow-up": "follow-up",
      accepted: "booked",
      declined: "booked",
      expired: "new",
    };
    const stages = seed.pipeline.stages.map((meta) => ({
      id: meta.id,
      label: meta.label,
      dot: meta.dot,
      deals: this.quotes
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
}
