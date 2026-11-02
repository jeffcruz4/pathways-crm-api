import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDbFromEnv } from "./client.js";

/**
 * Apply generated Drizzle migrations from ./drizzle. Connects from the
 * environment — either discrete DB_* parts (preferred; see createDbFromEnv) or
 * DATABASE_URL. Run locally with:
 *   DATABASE_URL=... pnpm db:migrate
 */
async function main() {
  const { db, sql } = createDbFromEnv();
  console.log("Applying migrations from ./drizzle …");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migrations applied.");
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
