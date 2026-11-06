import { randomUUID } from "node:crypto";
import type { InferSelectModel } from "drizzle-orm";
import type { Repository } from "./repository.js";
import * as schema from "../db/schema.js";
import * as seed from "./seed.js";
import * as rel from "./seedRelational.js";
import {
  assembleCustomer,
  assembleCustomerStats,
  assembleTeamStats,
  assemblePartnerHighlights,
  assemblePipelineStats,
  PIPELINE_STAGES,
  STATUS_TO_STAGE,
  teamMemberRollups,
  searchCorpus,
  partnerRelations,
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
  upcomingPartnerItems,
  assembleUserProfile,
  mergePreferences,
  mapNotification,
  assembleNotificationList,
  partnerDetail,
  type CustomerBundle,
} from "./assemble.js";
import type { Customer, CustomerListItem, CustomerCreate, CustomerUpdate } from "../domain/customer.js";
import type { CustomerStats } from "../domain/customer-stats.js";
import type { SearchResults } from "../domain/search.js";
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
import type {
  Notification,
  NotificationUpdate,
  NotificationFilter,
  NotificationList,
} from "../domain/notification.js";
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

type CustomerRow = InferSelectModel<typeof schema.customers>;
type ContactRow = InferSelectModel<typeof schema.customerContacts>;
type PropertyRow = InferSelectModel<typeof schema.properties>;
type PlanRow = InferSelectModel<typeof schema.plans>;
type QuoteRow = InferSelectModel<typeof schema.quotes>;
type JobRow = InferSelectModel<typeof schema.jobs>;
type ReviewRow = InferSelectModel<typeof schema.jobReviews>;
type TeamMemberRow = InferSelectModel<typeof schema.teamMembers>;
type PartnerRow = InferSelectModel<typeof schema.partners>;
type OfferingRow = InferSelectModel<typeof schema.serviceOfferings>;
type AppointmentRow = InferSelectModel<typeof schema.appointments>;
type InteractionRow = InferSelectModel<typeof schema.interactions>;
type UserProfileRow = InferSelectModel<typeof schema.userProfiles>;
type NotificationRow = InferSelectModel<typeof schema.notifications>;

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
  private teamMembers: TeamMemberRow[] = [];
  private partners: PartnerRow[] = [];
  private offerings: OfferingRow[] = [];
  private appointments: AppointmentRow[] = [];
  private interactions: InteractionRow[] = [];
  private userProfiles: UserProfileRow[] = [];
  private notifications: NotificationRow[] = [];
  private workerNames = new Map<string, string>();
  private readonly tenantId = rel.tenant.id!;

  constructor() {
    this.teamMembers = rel.teamMembers.map((c) => this.fillTeamMember(c));
    this.partners = rel.partners.map((p) => this.fillPartner(p));
    this.offerings = rel.serviceOfferings.map((o) => this.fillOffering(o));
    // Normalize insert-model seed rows into full select-model rows.
    this.customers = rel.customers.map((c) => this.fillCustomer(c));
    this.contacts = rel.contacts.map((c) => this.fillContact(c));
    this.properties = rel.properties.map((p) => this.fillProperty(p));
    this.plans = rel.plans.map((p) => this.fillPlan(p));
    this.quotes = rel.quotes.map((q) => this.fillQuote(q));
    this.jobs = rel.jobs.map((j) => this.fillJob(j));
    this.reviews = rel.reviews.map((r) => this.fillReview(r));
    this.appointments = rel.appointments.map((a) => this.fillAppointment(a));
    this.interactions = rel.interactions.map((i) => this.fillInteraction(i));
    this.userProfiles = rel.userProfiles.map((u) => this.fillUserProfile(u));
    this.notifications = rel.notifications.map((n) => this.fillNotification(n));
    for (const e of rel.teamMembers) this.workerNames.set(e.id!, e.displayName);
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
      referredByTeamMemberId: c.referredByTeamMemberId ?? null,
      summary: c.summary ?? "",
      provenance: c.provenance ?? "",
      goodToKnow: c.goodToKnow ?? [],
      tags: c.tags ?? [],
      notes: c.notes ?? null,
      createdAt: c.createdAt instanceof Date ? c.createdAt : nowTs(),
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
      createdAt: q.createdAt instanceof Date ? q.createdAt : nowTs(),
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
      assignedTeamMemberId: j.assignedTeamMemberId ?? null,
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
      reviewedTeamMemberId: r.reviewedTeamMemberId ?? null,
      reviewedPartnerId: r.reviewedPartnerId ?? null,
      createdAt: nowTs(),
      updatedAt: nowTs(),
    };
  }
  private fillTeamMember(c: (typeof rel.teamMembers)[number]): TeamMemberRow {
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
  private fillOffering(o: (typeof rel.serviceOfferings)[number]): OfferingRow {
    return {
      id: o.id ?? randomUUID(),
      tenantId: o.tenantId,
      name: o.name,
      serviceType: o.serviceType,
      frequency: o.frequency,
      description: o.description ?? null,
      defaultPriceCents: o.defaultPriceCents ?? null,
      currency: o.currency ?? "USD",
      isActive: o.isActive ?? true,
      createdAt: nowTs(),
      updatedAt: nowTs(),
      archivedAt: null,
    };
  }
  private fillAppointment(a: (typeof rel.appointments)[number]): AppointmentRow {
    return {
      id: a.id ?? randomUUID(),
      tenantId: a.tenantId,
      customerId: a.customerId ?? null,
      propertyId: a.propertyId ?? null,
      jobId: a.jobId ?? null,
      quoteId: a.quoteId ?? null,
      kind: a.kind,
      status: a.status ?? "scheduled",
      title: a.title,
      detail: a.detail ?? null,
      startsAt: a.startsAt instanceof Date ? a.startsAt : new Date(a.startsAt as string),
      endsAt: a.endsAt ? (a.endsAt instanceof Date ? a.endsAt : new Date(a.endsAt as string)) : null,
      durationMin: a.durationMin ?? null,
      assigneeType: a.assigneeType ?? null,
      assignedTeamMemberId: a.assignedTeamMemberId ?? null,
      assignedPartnerId: a.assignedPartnerId ?? null,
      locationOverride: a.locationOverride ?? null,
      createdAt: nowTs(),
      updatedAt: nowTs(),
      archivedAt: null,
    };
  }

  private fillInteraction(i: (typeof rel.interactions)[number]): InteractionRow {
    return {
      id: i.id ?? randomUUID(),
      tenantId: i.tenantId,
      customerId: i.customerId,
      type: i.type,
      method: i.method,
      note: i.note ?? null,
      occurredAt: i.occurredAt instanceof Date ? i.occurredAt : i.occurredAt ? new Date(i.occurredAt as string) : nowTs(),
      handledByTeamMemberId: i.handledByTeamMemberId ?? null,
      handledByPartnerId: i.handledByPartnerId ?? null,
      createdAt: nowTs(),
      updatedAt: nowTs(),
      archivedAt: null,
    };
  }

  private fillUserProfile(u: (typeof rel.userProfiles)[number]): UserProfileRow {
    return {
      id: u.id ?? randomUUID(),
      tenantId: u.tenantId,
      sub: u.sub,
      firstName: u.firstName ?? null,
      lastName: u.lastName ?? null,
      workNumber: u.workNumber ?? null,
      mobileNumber: u.mobileNumber ?? null,
      preferences: (u.preferences as Record<string, unknown>) ?? {},
      createdAt: nowTs(),
      updatedAt: nowTs(),
    };
  }

  private fillNotification(n: (typeof rel.notifications)[number]): NotificationRow {
    return {
      id: n.id ?? randomUUID(),
      tenantId: n.tenantId,
      type: n.type ?? "info",
      title: n.title,
      body: n.body ?? "",
      read: n.read ?? false,
      saved: n.saved ?? false,
      ctaLabel: n.ctaLabel ?? null,
      ctaHref: n.ctaHref ?? null,
      createdAt: n.createdAt instanceof Date ? n.createdAt : n.createdAt ? new Date(n.createdAt as string) : nowTs(),
      updatedAt: nowTs(),
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
      interactions: this.interactions.filter((i) => i.customerId === c.id),
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

  async getCustomerStats(): Promise<CustomerStats> {
    return assembleCustomerStats(this.customers, this.jobs);
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
      referredByTeamMemberId: input.referredByTeamMemberId,
      referredByPartnerId: input.referredByPartnerId,
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

  async updateCustomer(id: string, input: CustomerUpdate): Promise<Customer | undefined> {
    const row = this.find(id);
    if (!row) return undefined;
    if (input.name !== undefined) row.displayName = input.name;
    if (input.firstName !== undefined) row.firstName = input.firstName;
    if (input.lastName !== undefined) row.lastName = input.lastName;
    if (input.companyName !== undefined) row.companyName = input.companyName;
    if (input.status !== undefined) row.status = input.status;
    if (input.stage !== undefined) row.lifecycleStage = input.stage;
    if (input.preferredContact !== undefined) row.preferredContact = input.preferredContact;
    if (input.source !== undefined) row.source = input.source;
    // Referrer is mutually exclusive: setting a team member clears the partner
    // (and vice versa); passing null for a field clears it.
    if (input.referredByTeamMemberId !== undefined) {
      row.referredByTeamMemberId = input.referredByTeamMemberId;
      if (input.referredByTeamMemberId) row.referredByPartnerId = null;
    }
    if (input.referredByPartnerId !== undefined) {
      row.referredByPartnerId = input.referredByPartnerId;
      if (input.referredByPartnerId) row.referredByTeamMemberId = null;
    }
    if (input.summary !== undefined) row.summary = input.summary;
    if (input.tags !== undefined) row.tags = input.tags;
    if (input.goodToKnow !== undefined) row.goodToKnow = input.goodToKnow;
    if (input.notes !== undefined) row.notes = input.notes;
    row.updatedAt = nowTs();
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

  async updateProperty(
    customerId: string,
    propertyId: string,
    input: PropertyUpdate,
  ): Promise<Property | undefined> {
    const c = this.find(customerId);
    if (!c) return undefined;
    const row = this.properties.find((p) => p.id === propertyId && p.customerId === c.id);
    if (!row) return undefined;
    if (input.label !== undefined) row.label = input.label;
    if (input.addressLine1 !== undefined) row.addressLine1 = input.addressLine1;
    if (input.addressLine2 !== undefined) row.addressLine2 = input.addressLine2;
    if (input.city !== undefined) row.city = input.city;
    if (input.region !== undefined) row.region = input.region;
    if (input.postalCode !== undefined) row.postalCode = input.postalCode;
    if (input.country !== undefined) row.country = input.country;
    if (input.propertyType !== undefined) row.propertyType = input.propertyType;
    if (input.bedrooms !== undefined) row.bedrooms = input.bedrooms;
    if (input.bathrooms !== undefined) row.bathrooms = input.bathrooms;
    if (input.squareFeet !== undefined) row.squareFeet = input.squareFeet;
    if (input.accessNotes !== undefined) row.accessNotes = input.accessNotes;
    if (input.isPrimary !== undefined) row.isPrimary = input.isPrimary;
    // Promoting this property to primary demotes the customer's others.
    if (input.isPrimary === true) {
      for (const p of this.properties) {
        if (p.customerId === c.id && p.id !== propertyId) p.isPrimary = false;
      }
    }
    row.updatedAt = nowTs();
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
      assignedTeamMemberId: input.assignedTeamMemberId,
      assignedPartnerId: input.assignedPartnerId,
      priceCents: input.priceCents,
    });
    this.jobs.push(row);
    const workerId = row.assignedTeamMemberId ?? row.assignedPartnerId ?? null;
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
      reviewedTeamMemberId: job.assignedTeamMemberId,
      reviewedPartnerId: job.assignedPartnerId,
    });
    this.reviews.push(row);
    return mapReview(row);
  }

  async listAppointments(customerId: string): Promise<Appointment[] | undefined> {
    const c = this.find(customerId);
    if (!c) return undefined;
    return this.appointments
      .filter((a) => a.customerId === c.id)
      .sort((x, z) => x.startsAt.getTime() - z.startsAt.getTime())
      .map((a) => {
        const wid = a.assignedTeamMemberId ?? a.assignedPartnerId ?? null;
        return mapAppointment(a, wid ? (this.workerNames.get(wid) ?? null) : null);
      });
  }

  async createAppointment(
    customerId: string,
    input: AppointmentCreate,
  ): Promise<Appointment | undefined> {
    const c = this.find(customerId);
    if (!c) return undefined;
    const row = this.fillAppointment({
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
    });
    this.appointments.push(row);
    const wid = row.assignedTeamMemberId ?? row.assignedPartnerId ?? null;
    return mapAppointment(row, wid ? (this.workerNames.get(wid) ?? null) : null);
  }

  async addInteraction(
    customerId: string,
    input: InteractionCreate,
  ): Promise<Interaction | undefined> {
    const c = this.find(customerId);
    if (!c) return undefined;
    const row = this.fillInteraction({
      tenantId: c.tenantId,
      customerId: c.id,
      type: input.type,
      method: input.method,
      note: input.note,
      occurredAt: input.occurredAt ? new Date(input.occurredAt) : nowTs(),
      handledByTeamMemberId: input.handledByTeamMemberId,
      handledByPartnerId: input.handledByPartnerId,
    });
    this.interactions.push(row);
    const wid = row.handledByTeamMemberId ?? row.handledByPartnerId ?? null;
    return mapInteraction(row, wid ? (this.workerNames.get(wid) ?? null) : null);
  }

  // ── Service offerings ──
  async listServiceOfferings(): Promise<ServiceOffering[]> {
    return this.offerings.map(mapServiceOffering);
  }

  async createServiceOffering(input: ServiceOfferingCreate): Promise<ServiceOffering> {
    const row = this.fillOffering({
      tenantId: this.tenantId,
      name: input.name,
      serviceType: input.serviceType,
      frequency: input.frequency,
      description: input.description,
      defaultPriceCents: input.defaultPriceCents,
      isActive: input.isActive ?? true,
    });
    this.offerings.push(row);
    return mapServiceOffering(row);
  }

  async updateServiceOffering(
    id: string,
    input: ServiceOfferingUpdate,
  ): Promise<ServiceOffering | undefined> {
    const row = this.offerings.find((o) => o.id === id);
    if (!row) return undefined;
    if (input.name !== undefined) row.name = input.name;
    if (input.serviceType !== undefined) row.serviceType = input.serviceType;
    if (input.frequency !== undefined) row.frequency = input.frequency;
    if (input.description !== undefined) row.description = input.description;
    if (input.defaultPriceCents !== undefined) row.defaultPriceCents = input.defaultPriceCents;
    if (input.isActive !== undefined) row.isActive = input.isActive;
    row.updatedAt = nowTs();
    return mapServiceOffering(row);
  }

  // ── Partners (rollups + related entities derived) ──
  private customerById(): Map<string, CustomerRow> {
    return new Map(this.customers.map((c) => [c.id, c]));
  }

  async listPartners(): Promise<PartnerListItem[]> {
    const byId = this.customerById();
    return this.partners.map((p) => {
      const referred = this.customers.filter((c) => c.referredByPartnerId === p.id);
      const covered = this.jobs.filter((j) => j.assignedPartnerId === p.id);
      const { rollups } = partnerRelations(referred, covered, byId);
      return partnerListItem(p, rollups);
    });
  }

  private assemblePartner(p: PartnerRow): Partner {
    const referred = this.customers.filter((c) => c.referredByPartnerId === p.id);
    const covered = this.jobs.filter((j) => j.assignedPartnerId === p.id);
    const { rollups, relatedCustomers, relatedJobs } = partnerRelations(
      referred,
      covered,
      this.customerById(),
    );
    return partnerDetail(p, rollups, relatedCustomers, relatedJobs);
  }

  async getPartner(id: string) {
    const p = this.partners.find((x) => x.id === id);
    return p ? this.assemblePartner(p) : undefined;
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
    return this.assemblePartner(row);
  }

  async updatePartner(id: string, input: PartnerUpdate): Promise<Partner | undefined> {
    const row = this.partners.find((x) => x.id === id);
    if (!row) return undefined;
    if (input.name !== undefined) row.displayName = input.name;
    if (input.type !== undefined) row.type = input.type;
    if (input.stage !== undefined) row.stage = input.stage;
    if (input.contactName !== undefined) row.contactName = input.contactName;
    if (input.email !== undefined) row.email = input.email;
    if (input.phone !== undefined) row.phone = input.phone;
    if (input.location !== undefined) row.location = input.location;
    if (input.since !== undefined) row.since = input.since;
    if (input.skills !== undefined) row.skills = input.skills;
    if (input.commissionBps !== undefined) row.commissionBps = input.commissionBps;
    if (input.summary !== undefined) row.summary = input.summary;
    if (input.notes !== undefined) row.notes = input.notes;
    row.updatedAt = nowTs();
    this.workerNames.set(row.id, row.displayName);
    return this.assemblePartner(row);
  }

  // ── Team members ──
  async listTeamMembers(): Promise<TeamMemberListItem[]> {
    return this.teamMembers.map((r) => ({
      id: r.id,
      name: r.displayName,
      status: r.status,
      employmentType: r.employmentType,
      skills: r.skills,
      homeBase: r.homeBase,
      ...teamMemberRollups(r.id, this.jobs, this.reviews),
    }));
  }

  async getTeamStats(): Promise<TeamStats> {
    return assembleTeamStats(this.teamMembers, this.jobs, this.reviews, this.customers);
  }

  // ── Current user (settings) ──
  async getMyProfile(identity: UserIdentity): Promise<UserProfile> {
    const row = this.userProfiles.find(
      (u) => u.tenantId === this.tenantId && u.sub === identity.sub,
    );
    return assembleUserProfile(identity, { id: this.tenantId, name: rel.tenant.name }, row);
  }

  async updateMyProfile(identity: UserIdentity, input: UserProfileUpdate): Promise<UserProfile> {
    let row = this.userProfiles.find(
      (u) => u.tenantId === this.tenantId && u.sub === identity.sub,
    );
    if (!row) {
      row = this.fillUserProfile({ tenantId: this.tenantId, sub: identity.sub });
      this.userProfiles.push(row);
    }
    if (input.firstName !== undefined) row.firstName = input.firstName;
    if (input.lastName !== undefined) row.lastName = input.lastName;
    if (input.workNumber !== undefined) row.workNumber = input.workNumber;
    if (input.mobileNumber !== undefined) row.mobileNumber = input.mobileNumber;
    if (input.preferences) {
      row.preferences = { ...mergePreferences(row.preferences), ...input.preferences };
    }
    row.updatedAt = nowTs();
    return assembleUserProfile(identity, { id: this.tenantId, name: rel.tenant.name }, row);
  }

  // ── Notifications ──
  async listNotifications(filter: NotificationFilter): Promise<NotificationList> {
    return assembleNotificationList(this.notifications, filter);
  }

  async updateNotification(id: string, input: NotificationUpdate): Promise<Notification | undefined> {
    const row = this.notifications.find((n) => n.id === id);
    if (!row) return undefined;
    if (input.read !== undefined) row.read = input.read;
    if (input.saved !== undefined) row.saved = input.saved;
    row.updatedAt = nowTs();
    return mapNotification(row);
  }

  async markAllNotificationsRead(): Promise<NotificationList> {
    for (const n of this.notifications) n.read = true;
    return assembleNotificationList(this.notifications, "all");
  }

  async getPartnerHighlights(): Promise<PartnerHighlights> {
    return assemblePartnerHighlights(this.partners, this.customers, this.jobs, this.reviews);
  }

  async getUpcomingPartnerItems(): Promise<UpcomingPartnerItem[]> {
    return upcomingPartnerItems(this.jobs, this.appointments, this.workerNames);
  }

  async createTeamMember(input: TeamMemberCreate): Promise<TeamMember> {
    const row = this.fillTeamMember({
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
    this.teamMembers.push(row);
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

  // ── Global keyword search (all object types) ──
  async search(query: string): Promise<SearchResults> {
    return searchCorpus(
      {
        customers: this.customers,
        contacts: this.contacts,
        partners: this.partners,
        teamMembers: this.teamMembers,
        offerings: this.offerings,
        properties: this.properties,
        plans: this.plans,
        quotes: this.quotes,
        jobs: this.jobs,
        appointments: this.appointments,
      },
      query,
    );
  }

  // ── Quotes: pipeline card edits ──
  async updateQuote(id: string, input: QuoteUpdate): Promise<Quote | undefined> {
    const row = this.quotes.find((q) => q.id === id);
    if (!row) return undefined;
    if (input.status !== undefined) {
      row.status = input.status;
      if (input.status === "accepted" || input.status === "declined") row.decidedAt = nowTs();
    }
    if (input.detail !== undefined) row.detail = input.detail;
    if (input.amountCents !== undefined) row.amountCents = input.amountCents;
    if (input.needsYou !== undefined) row.needsYou = input.needsYou;
    row.updatedAt = nowTs();
    return mapQuote(row);
  }

  // ── Pipeline = quotes grouped into stages ──
  async getPipeline() {
    const stats = assemblePipelineStats(this.quotes);
    // Booked lane shows only recently-won work: quotes decided within the last
    // 14 days. Other lanes are unbounded.
    const BOOKED_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
    const bookedCutoff = Date.now() - BOOKED_WINDOW_MS;
    const stages = PIPELINE_STAGES.map((meta) => ({
      id: meta.id as "new" | "needs-quote" | "quote-sent" | "follow-up" | "booked",
      label: meta.label,
      dot: meta.dot,
      deals: this.quotes
        .filter((q) => !q.archivedAt && (STATUS_TO_STAGE[q.status] ?? "new") === meta.id)
        .filter((q) => {
          if (meta.id !== "booked") return true;
          // Keep bookings decided within the window (fall back to including
          // rows with no decidedAt so legacy data isn't silently hidden).
          const t = q.decidedAt ? new Date(q.decidedAt).getTime() : null;
          return t == null || t >= bookedCutoff;
        })
        .map((q) => ({
          id: q.id,
          stageId: meta.id as "new" | "needs-quote" | "quote-sent" | "follow-up" | "booked",
          customerId: q.customerId,
          customerName: this.customers.find((c) => c.id === q.customerId)?.displayName ?? "Customer",
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

  async getPipelineStats() {
    return assemblePipelineStats(this.quotes);
  }
}
