import { createDbFromEnv } from "./client.js";
import * as schema from "./schema.js";
import * as rel from "../data/seedRelational.js";

/**
 * Load the relational sample dataset (src/data/seedRelational.ts) into Postgres.
 * Deletes in child→parent order, then inserts in parent→child order so FKs are
 * satisfied. Connects from the environment (discrete DB_* parts or
 * DATABASE_URL). Run locally with:  pnpm db:seed
 */
async function main() {
  const { db, sql } = createDbFromEnv();

  console.log("Seeding database …");

  // Clear child → parent (respect FKs).
  await db.delete(schema.jobReviews);
  await db.delete(schema.appointments);
  await db.delete(schema.jobs);
  await db.delete(schema.quotes);
  await db.delete(schema.plans);
  await db.delete(schema.properties);
  await db.delete(schema.customerContacts);
  await db.delete(schema.customers);
  await db.delete(schema.serviceOfferings);
  await db.delete(schema.cleaners);
  await db.delete(schema.partners);
  await db.delete(schema.tenants);

  // Insert parent → child.
  await db.insert(schema.tenants).values(rel.tenant);
  await db.insert(schema.cleaners).values(rel.cleaners);
  await db.insert(schema.partners).values(rel.partners);
  await db.insert(schema.serviceOfferings).values(rel.serviceOfferings);
  await db.insert(schema.customers).values(rel.customers);
  await db.insert(schema.customerContacts).values(rel.contacts);
  await db.insert(schema.properties).values(rel.properties);
  await db.insert(schema.quotes).values(rel.quotes);
  await db.insert(schema.plans).values(rel.plans);
  await db.insert(schema.jobs).values(rel.jobs);
  await db.insert(schema.jobReviews).values(rel.reviews);
  await db.insert(schema.appointments).values(rel.appointments);

  console.log(
    `Seeded: ${rel.customers.length} customers, ${rel.contacts.length} contacts, ` +
      `${rel.properties.length} properties, ${rel.plans.length} plans, ${rel.quotes.length} quotes, ` +
      `${rel.jobs.length} jobs, ${rel.reviews.length} reviews, ${rel.appointments.length} appointments, ` +
      `${rel.cleaners.length} cleaners, ${rel.partners.length} partners.`,
  );
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
