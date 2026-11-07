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
   * wired); "postgres" connects via Drizzle, using either the discrete DB_*
   * parts below (preferred) or DATABASE_URL.
   */
  DATA_BACKEND: z.enum(["memory", "postgres"]).default("memory"),
  /**
   * Postgres connection string. One of DATABASE_URL or DB_HOST is required when
   * DATA_BACKEND=postgres. Prefer the discrete DB_* parts for RDS, since an
   * RDS-managed password with URL-significant characters doesn't need encoding.
   */
  DATABASE_URL: z.string().optional(),
  /** Discrete Postgres connection parts (preferred over DATABASE_URL). */
  DB_HOST: z.string().optional(),
  DB_PORT: z.coerce.number().optional(),
  DB_NAME: z.string().optional(),
  DB_USER: z.string().optional(),
  DB_PASSWORD: z.string().optional(),
  /** sslmode-equivalent: disable | require | verify-ca | verify-full. */
  DB_SSLMODE: z.string().optional(),
  /**
   * Comma-separated list of allowed CORS origins for the browser UI. Defaults
   * to the local dev origin.
   */
  CORS_ORIGINS: z.string().default("http://localhost:5173"),

  // ── Twilio SMS integration ──
  /** Twilio Auth Token (secret). Read from env; never persisted or returned. */
  TWILIO_AUTH_TOKEN: z.string().optional(),
  /** Public base URL used to render webhook setup instructions in the admin UI. */
  PUBLIC_BASE_URL: z.string().optional(),
  /** Dev-only escape hatch to skip Twilio webhook signature validation. */
  TWILIO_SKIP_SIGNATURE_VALIDATION: z
    .enum(["true", "false"]) 
    .default("false")
    .transform((v) => v === "true"),
});

export type AppConfig = {
  env: string;
  port: number;
  host: string;
  dataBackend: "memory" | "postgres";
  databaseUrl?: string;
  corsOrigins: string[];
  twilioAuthToken?: string;
  publicBaseUrl?: string;
  twilioSkipSignatureValidation: boolean;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = ConfigSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid configuration:\n${parsed.error.toString()}`);
  }
  const c = parsed.data;

  if (c.DATA_BACKEND === "postgres" && !c.DATABASE_URL && !c.DB_HOST) {
    throw new Error(
      "DATA_BACKEND=postgres requires either DB_HOST (+ DB_USER/DB_PASSWORD/DB_NAME/DB_PORT) or DATABASE_URL",
    );
  }

  return {
    env: c.NODE_ENV,
    port: c.PORT,
    host: c.HOST,
    dataBackend: c.DATA_BACKEND,
    databaseUrl: c.DATABASE_URL,
    corsOrigins: c.CORS_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean),
    twilioAuthToken: c.TWILIO_AUTH_TOKEN,
    publicBaseUrl: c.PUBLIC_BASE_URL,
    twilioSkipSignatureValidation: c.TWILIO_SKIP_SIGNATURE_VALIDATION,
  };
}
