import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDb } from "./client.js";

/**
 * Apply generated Drizzle migrations from ./drizzle. Run with:
 *   DATABASE_URL=... pnpm db:migrate
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required to run migrations");

  const { db, sql } = createDb(url);
  console.log("Applying migrations from ./drizzle …");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migrations applied.");
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
