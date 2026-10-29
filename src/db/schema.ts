/**
 * Drizzle schema — the intended Postgres (RDS) data model for the CRM API.
 *
 * NOTE: this is the DB model of record; it is NOT yet wired into the running
 * API (the service currently serves seeded data via the MemoryRepository). It
 * exists so the schema is real, reviewable, and ready to migrate when RDS is
 * provisioned. JSONB columns hold the richer nested shapes (home details,
 * activity, Cori record updates) until/unless they warrant their own tables.
 */
import { pgTable, text, integer, boolean, jsonb, timestamp, pgEnum } from "drizzle-orm/pg-core";

export const customerStatus = pgEnum("customer_status", ["active", "lead", "lapsed"]);
export const customerStage = pgEnum("customer_stage", ["new-lead", "quote", "booked", "recurring"]);
export const partnerType = pgEnum("partner_type", ["lead-gen", "contractor", "both"]);
export const partnerStage = pgEnum("partner_stage", ["prospect", "vetting", "onboarding", "active", "paused"]);
export const dealSignal = pgEnum("deal_signal", ["cori", "needs-you", "info"]);
export const dealStage = pgEnum("deal_stage", ["new", "needs-quote", "quote-sent", "follow-up", "booked"]);

export const customers = pgTable("customers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  location: text("location").notNull(),
  plan: text("plan").notNull(),
  status: customerStatus("status").notNull(),
  stage: customerStage("stage").notNull(),
  lifetimeValue: integer("lifetime_value").notNull().default(0),
  lastService: text("last_service").notNull().default("—"),
  nextService: text("next_service"),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  summary: text("summary").notNull().default(""),
  provenance: text("provenance").notNull().default(""),
  homeDetails: jsonb("home_details").$type<unknown[]>().notNull().default([]),
  nextStep: jsonb("next_step").$type<unknown>(),
  goodToKnow: jsonb("good_to_know").$type<string[]>().notNull().default([]),
  activity: jsonb("activity").$type<unknown[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const partners = pgTable("partners", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  contact: text("contact").notNull(),
  location: text("location").notNull(),
  type: partnerType("type").notNull(),
  stage: partnerStage("stage").notNull(),
  leadsGenerated: integer("leads_generated").notNull().default(0),
  jobsCovered: integer("jobs_covered").notNull().default(0),
  value: integer("value").notNull().default(0),
  since: text("since").notNull().default(""),
  summary: text("summary").notNull().default(""),
  employment: jsonb("employment").$type<unknown>().notNull(),
  activity: jsonb("activity").$type<unknown[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const deals = pgTable("deals", {
  id: text("id").primaryKey(),
  stageId: dealStage("stage_id").notNull(),
  name: text("name").notNull(),
  price: integer("price"),
  priceUnit: text("price_unit"),
  detail: text("detail").notNull(),
  signal: dealSignal("signal").notNull(),
  chip: text("chip").notNull(),
  needsYou: boolean("needs_you").notNull().default(false),
  customerId: text("customer_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const appointments = pgTable("appointments", {
  id: text("id").primaryKey(),
  dayIndex: integer("day_index").notNull(),
  start: text("start").notNull(),
  durationMin: integer("duration_min").notNull(),
  title: text("title").notNull(),
  detail: text("detail").notNull(),
  kind: text("kind").notNull(),
  customerId: text("customer_id"),
  partnerId: text("partner_id"),
});

export const conversations = pgTable("conversations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  location: text("location").notNull(),
  flag: text("flag").notNull(),
  // Cori's extractions are first-class: stored structured, not just rendered.
  suggestedReply: text("suggested_reply").notNull().default(""),
  recordUpdates: jsonb("record_updates").$type<unknown[]>().notNull().default([]),
  recordNote: text("record_note"),
  customerId: text("customer_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const conversationEntries = pgTable("conversation_entries", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull(),
  kind: text("kind").notNull(),
  text: text("text").notNull(),
  meta: text("meta"),
  chips: jsonb("chips").$type<string[]>().notNull().default([]),
  hasTranscript: boolean("has_transcript").notNull().default(false),
  dayDivider: text("day_divider"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
});
