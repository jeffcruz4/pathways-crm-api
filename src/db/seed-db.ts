import { createDbFromEnv } from "./client.js";
import * as schema from "./schema.js";
import * as seed from "../data/seed.js";

/**
 * Load the sample dataset (src/data/seed.ts) into Postgres. Idempotent-ish:
 * truncates the tables it owns, then inserts. Connects from the environment
 * (discrete DB_* parts or DATABASE_URL). Run locally with:
 *   DATABASE_URL=... pnpm db:seed
 *
 * NOTE: conversations/appointments are seeded minimally to match the current
 * read endpoints; expand as those resources grow.
 */
async function main() {
  const { db, sql } = createDbFromEnv();

  console.log("Seeding database …");

  // Clear (child → parent order not critical here; no FKs enforced yet).
  await db.delete(schema.conversationEntries);
  await db.delete(schema.conversations);
  await db.delete(schema.appointments);
  await db.delete(schema.deals);
  await db.delete(schema.partners);
  await db.delete(schema.customers);

  // Customers
  await db.insert(schema.customers).values(
    seed.customers.map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      location: c.location,
      plan: c.plan,
      status: c.status,
      stage: c.stage,
      lifetimeValue: c.lifetimeValue,
      lastService: c.lastService,
      nextService: c.nextService ?? null,
      tags: c.tags,
      summary: c.summary,
      provenance: c.provenance,
      homeDetails: c.homeDetails,
      nextStep: c.nextStep ?? null,
      goodToKnow: c.goodToKnow,
      activity: c.activity,
    })),
  );

  // Partners
  await db.insert(schema.partners).values(
    seed.partners.map((p) => ({
      id: p.id,
      name: p.name,
      contact: p.contact,
      location: p.location,
      type: p.type,
      stage: p.stage,
      leadsGenerated: p.leadsGenerated,
      jobsCovered: p.jobsCovered,
      value: p.value,
      since: p.since,
      summary: p.summary,
      employment: p.employment,
      activity: p.activity,
    })),
  );

  // Deals (flatten pipeline stages)
  const deals = seed.pipeline.stages.flatMap((s) =>
    s.deals.map((d) => ({
      id: d.id,
      stageId: d.stageId,
      name: d.name,
      price: d.price ?? null,
      priceUnit: d.priceUnit ?? null,
      detail: d.detail,
      signal: d.signal,
      chip: d.chip,
      needsYou: d.needsYou ?? false,
    })),
  );
  await db.insert(schema.deals).values(deals);

  // Appointments
  await db.insert(schema.appointments).values(
    seed.calendarWeek.appointments.map((a) => ({
      id: a.id,
      dayIndex: a.dayIndex,
      start: a.start,
      durationMin: a.durationMin,
      title: a.title,
      detail: a.detail,
      kind: a.kind,
    })),
  );

  // Conversations + entries
  for (const convo of Object.values(seed.conversations)) {
    await db.insert(schema.conversations).values({
      id: convo.id,
      name: convo.name,
      phone: convo.phone,
      location: convo.location,
      flag: convo.flag,
      suggestedReply: convo.suggestedReply,
      recordUpdates: convo.recordUpdates,
      recordNote: convo.recordNote ?? null,
      customerId: convo.customer.customerId ?? null,
    });
    await db.insert(schema.conversationEntries).values(
      convo.entries.map((e) => ({
        id: `${convo.id}:${e.id}`,
        conversationId: convo.id,
        kind: e.kind,
        text: e.text,
        meta: e.meta ?? null,
        chips: e.chips ?? [],
        hasTranscript: e.hasTranscript ?? false,
        dayDivider: e.dayDivider ?? null,
      })),
    );
  }

  console.log(
    `Seeded: ${seed.customers.length} customers, ${seed.partners.length} partners, ${deals.length} deals, ${seed.calendarWeek.appointments.length} appointments, ${Object.keys(seed.conversations).length} conversations.`,
  );
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
