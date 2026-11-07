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

  // ── GoHighLevel (LeadConnector) SMS integration — Phase 1 ──
  // VERIFY-ON-SANDBOX: the GHL send/webhook wire details behind these are not
  // yet live-validated (no sandbox on the current plan). See
  // docs/design/gohighlevel-adapter-sketch.ts and OPEN-6/OPEN-12.
  /** GHL access credential (Private Integration Token or OAuth access token). Secret; never persisted/returned. */
  GHL_TOKEN: z.string().optional(),
  /** GHL sub-account (location) id. Every GHL request is location-scoped. */
  GHL_LOCATION_ID: z.string().optional(),
  /** GHL date-versioned API header value. */
  GHL_API_VERSION: z.string().default("2021-07-28"),
  /** GHL webhook shared secret used to verify inbound/status webhook authenticity. */
  GHL_WEBHOOK_SECRET: z.string().optional(),
  /**
   * Provider-neutral dev-only escape hatch to skip webhook signature
   * validation (supersedes TWILIO_SKIP_SIGNATURE_VALIDATION, which still works
   * for back-compat). Applies to any provider's webhooks.
   */
  SKIP_WEBHOOK_SIGNATURE_VALIDATION: z
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
  // GoHighLevel (Phase 1)
  ghlToken?: string;
  ghlLocationId?: string;
  ghlApiVersion: string;
  ghlWebhookSecret?: string;
  /**
   * Effective "skip webhook signature validation" flag — true if EITHER the
   * provider-neutral flag OR the legacy Twilio-specific flag is set. Dev only.
   */
  skipWebhookSignatureValidation: boolean;
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
    ghlToken: c.GHL_TOKEN,
    ghlLocationId: c.GHL_LOCATION_ID,
    ghlApiVersion: c.GHL_API_VERSION,
    ghlWebhookSecret: c.GHL_WEBHOOK_SECRET,
    skipWebhookSignatureValidation:
      c.SKIP_WEBHOOK_SIGNATURE_VALIDATION || c.TWILIO_SKIP_SIGNATURE_VALIDATION,
  };
}
