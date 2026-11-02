import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

/**
 * Create a Drizzle client over a postgres-js connection. Used by the Postgres
 * repository and the migrate/seed scripts. The caller owns the lifecycle; call
 * `sql.end()` for one-shot scripts.
 */
export function createDb(databaseUrl: string): {
  db: PostgresJsDatabase<typeof schema>;
  sql: ReturnType<typeof postgres>;
} {
  // max=5 keeps the pool small (low-cost dev sizing). ssl handled via the URL
  // (e.g. ?sslmode=require for RDS).
  const sql = postgres(databaseUrl, { max: 5 });
  const db = drizzle(sql, { schema });
  return { db, sql };
}

export { schema };
