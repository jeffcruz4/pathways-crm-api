import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit config for generating Postgres migrations from src/db/schema.ts.
 * Used only for the future Postgres backend (RDS). Run:
 *   DATABASE_URL=... pnpm db:generate   # emit SQL migrations into ./drizzle
 */
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://localhost:5432/pathways",
  },
});
