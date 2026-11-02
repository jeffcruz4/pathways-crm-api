import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

type Db = {
  db: PostgresJsDatabase<typeof schema>;
  sql: ReturnType<typeof postgres>;
};

/**
 * Create a Drizzle client over a postgres-js connection. Used by the Postgres
 * repository and the migrate/seed scripts. The caller owns the lifecycle; call
 * `sql.end()` for one-shot scripts.
 */
export function createDb(databaseUrl: string): Db {
  // max=5 keeps the pool small (low-cost dev sizing). ssl handled via the URL
  // (e.g. ?sslmode=require for RDS).
  const sql = postgres(databaseUrl, { max: 5 });
  const db = drizzle(sql, { schema });
  return { db, sql };
}

/**
 * Resolve a DB connection from the environment. Prefers discrete parts
 * (DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD) and passes them to postgres-js
 * as an options object — so a password containing URL-significant characters
 * (`?`, `:`, `@`, `]`, `$`, …), as RDS-managed secrets routinely do, never has
 * to be percent-encoded into a URL string. Falls back to DATABASE_URL when the
 * discrete host isn't provided (local dev, the running API).
 */
export function createDbFromEnv(): Db {
  const host = process.env.DB_HOST;
  if (host) {
    const sql = postgres({
      host,
      port: Number(process.env.DB_PORT ?? 5432),
      database: process.env.DB_NAME ?? "pathways",
      username: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      // RDS requires TLS; it uses an AWS-managed cert, so don't force full-chain
      // verification here (equivalent to sslmode=require).
      ssl: parseSsl(process.env.DB_SSLMODE ?? "require"),
      max: 5,
    });
    const db = drizzle(sql, { schema });
    return { db, sql };
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "Set DB_HOST (+ DB_USER/DB_PASSWORD/DB_NAME/DB_PORT) or DATABASE_URL",
    );
  }
  return createDb(url);
}

function parseSsl(mode: string): boolean | "require" | { rejectUnauthorized: boolean } {
  switch (mode) {
    case "disable":
      return false;
    case "require":
    case "prefer":
      // Encrypt but don't verify the chain (RDS managed cert).
      return { rejectUnauthorized: false };
    case "verify-full":
    case "verify-ca":
      return { rejectUnauthorized: true };
    default:
      return { rejectUnauthorized: false };
  }
}

export { schema };
