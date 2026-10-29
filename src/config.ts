/**
 * Config-first runtime configuration, read from the environment. Mirrors the
 * UI's config philosophy: no values baked into the build; everything comes from
 * env (and later, Secrets Manager for secrets). Fails loud on invalid config.
 */
import { z } from "zod";

const ConfigSchema = z.object({
  /** Environment label (dev/staging/prod). */
  NODE_ENV: z.string().default("development"),
  /** Port the API listens on. */
  PORT: z.coerce.number().default(8080),
  /** Bind host. 0.0.0.0 in containers. */
  HOST: z.string().default("0.0.0.0"),
  /**
   * Data backend. "memory" serves seeded sample data (default while RDS is not
   * wired); "postgres" uses DATABASE_URL via Drizzle.
   */
  DATA_BACKEND: z.enum(["memory", "postgres"]).default("memory"),
  /** Postgres connection string (required only when DATA_BACKEND=postgres). */
  DATABASE_URL: z.string().optional(),
  /**
   * Comma-separated list of allowed CORS origins for the browser UI. Defaults
   * to the local dev origin.
   */
  CORS_ORIGINS: z.string().default("http://localhost:5173"),
});

export type AppConfig = {
  env: string;
  port: number;
  host: string;
  dataBackend: "memory" | "postgres";
  databaseUrl?: string;
  corsOrigins: string[];
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = ConfigSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid configuration:\n${parsed.error.toString()}`);
  }
  const c = parsed.data;

  if (c.DATA_BACKEND === "postgres" && !c.DATABASE_URL) {
    throw new Error("DATA_BACKEND=postgres requires DATABASE_URL to be set");
  }

  return {
    env: c.NODE_ENV,
    port: c.PORT,
    host: c.HOST,
    dataBackend: c.DATA_BACKEND,
    databaseUrl: c.DATABASE_URL,
    corsOrigins: c.CORS_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean),
  };
}
