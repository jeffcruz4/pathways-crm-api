import { eq, asc } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { Repository } from "./repository.js";
import * as schema from "../db/schema.js";
import * as seed from "./seed.js";
import type { Customer, CustomerListItem } from "../domain/customer.js";
import type { Partner, PartnerListItem } from "../domain/partner.js";
import type { Pipeline, PipelineStage, Deal, DealStageId } from "../domain/deal.js";
import type { ConvoListItem, ConversationDetail, ThreadEntry } from "../domain/conversation.js";
import type { CalendarWeek } from "../domain/calendar.js";

/**
 * Postgres (Drizzle) repository. Table-backed for the core resources
 * (customers, partners, deals, appointments, conversations). Non-tabular
 * aggregations that don't yet have their own storage — the Home view, the Daily
 * Digest, and the pipeline/calendar *summary* headers — are still served from
 * the seed constants; those become computed/stored in a later pass (see TD).
 */
export class PostgresRepository implements Repository {
  constructor(private readonly db: PostgresJsDatabase<typeof schema>) {}

  // ── Home / digest / summaries: not yet table-modeled ──
  async getHome() {
    return seed.home;
  }
  async getDigest() {
    return seed.digest;
  }

  // ── Customers ──
  async listCustomers(): Promise<CustomerListItem[]> {
    const rows = await this.db.select().from(schema.customers);
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      location: r.location,
      plan: r.plan,
      status: r.status,
      stage: r.stage,
      lifetimeValue: r.lifetimeValue,
      lastService: r.lastService,
      nextService: r.nextService ?? undefined,
      tags: r.tags,
    }));
  }

  async getCustomer(id: string): Promise<Customer | undefined> {
    const [r] = await this.db.select().from(schema.customers).where(eq(schema.customers.id, id));
    if (!r) return undefined;
    return {
      id: r.id,
      name: r.name,
      phone: r.phone,
      location: r.location,
      plan: r.plan,
      status: r.status,
      stage: r.stage,
      lifetimeValue: r.lifetimeValue,
      lastService: r.lastService,
      nextService: r.nextService ?? undefined,
      tags: r.tags,
      summary: r.summary,
      provenance: r.provenance,
      homeDetails: r.homeDetails as Customer["homeDetails"],
      nextStep: (r.nextStep as Customer["nextStep"]) ?? undefined,
      goodToKnow: r.goodToKnow,
      activity: r.activity as Customer["activity"],
    };
  }

  // ── Partners ──
  async listPartners(): Promise<PartnerListItem[]> {
    const rows = await this.db.select().from(schema.partners);
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      contact: r.contact,
      location: r.location,
      type: r.type,
      stage: r.stage,
      leadsGenerated: r.leadsGenerated,
      jobsCovered: r.jobsCovered,
      value: r.value,
    }));
  }

  async getPartner(id: string): Promise<Partner | undefined> {
    const [r] = await this.db.select().from(schema.partners).where(eq(schema.partners.id, id));
    if (!r) return undefined;
    return {
      id: r.id,
      name: r.name,
      contact: r.contact,
      location: r.location,
      type: r.type,
      stage: r.stage,
      leadsGenerated: r.leadsGenerated,
      jobsCovered: r.jobsCovered,
      value: r.value,
      since: r.since,
      summary: r.summary,
      employment: r.employment as Partner["employment"],
      activity: r.activity as Partner["activity"],
    };
  }

  // ── Pipeline (deals grouped into stages; summary from seed for now) ──
  async getPipeline(): Promise<Pipeline> {
    const rows = await this.db.select().from(schema.deals);
    const stageMeta = seed.pipeline.stages.map((s) => ({ id: s.id, label: s.label, dot: s.dot }));
    const stages: PipelineStage[] = stageMeta.map((meta) => ({
      id: meta.id,
      label: meta.label,
      dot: meta.dot,
      deals: rows
        .filter((d) => d.stageId === meta.id)
        .map(
          (d): Deal => ({
            id: d.id,
            stageId: d.stageId as DealStageId,
            name: d.name,
            price: d.price ?? undefined,
            priceUnit: (d.priceUnit as Deal["priceUnit"]) ?? undefined,
            detail: d.detail,
            signal: d.signal,
            chip: d.chip,
            needsYou: d.needsYou,
          }),
        ),
    }));
    return { summary: seed.pipeline.summary, stages };
  }

  // ── Conversations ──
  async listConversations(): Promise<ConvoListItem[]> {
    // The list preview fields aren't fully modeled; serve from seed for now.
    return seed.conversationList;
  }

  async getConversation(id: string): Promise<ConversationDetail | undefined> {
    const [c] = await this.db.select().from(schema.conversations).where(eq(schema.conversations.id, id));
    if (!c) return undefined;
    const entries = await this.db
      .select()
      .from(schema.conversationEntries)
      .where(eq(schema.conversationEntries.conversationId, id))
      .orderBy(asc(schema.conversationEntries.occurredAt));

    const seedDetail = seed.conversations[id];
    return {
      id: c.id,
      name: c.name,
      phone: c.phone,
      location: c.location,
      flag: c.flag as ConversationDetail["flag"],
      suggestedReply: c.suggestedReply,
      recordUpdates: c.recordUpdates as ConversationDetail["recordUpdates"],
      recordNote: c.recordNote ?? undefined,
      entries: entries.map(
        (e): ThreadEntry => ({
          id: e.id.includes(":") ? e.id.split(":")[1] : e.id,
          kind: e.kind as ThreadEntry["kind"],
          text: e.text,
          meta: e.meta ?? undefined,
          chips: e.chips,
          hasTranscript: e.hasTranscript,
          dayDivider: e.dayDivider ?? undefined,
        }),
      ),
      // The linked-customer snapshot isn't its own table yet; reuse seed shape.
      customer: seedDetail?.customer ?? { home: "", service: "", property: "", estValue: "" },
    };
  }

  // ── Calendar (appointments from table; summary from seed) ──
  async getCalendarWeek(): Promise<CalendarWeek> {
    const rows = await this.db.select().from(schema.appointments).orderBy(asc(schema.appointments.dayIndex));
    return {
      weekDays: seed.calendarWeek.weekDays,
      summary: seed.calendarWeek.summary,
      appointments: rows.map((a) => ({
        id: a.id,
        dayIndex: a.dayIndex,
        start: a.start,
        durationMin: a.durationMin,
        title: a.title,
        detail: a.detail,
        kind: a.kind as CalendarWeek["appointments"][number]["kind"],
      })),
    };
  }
}
