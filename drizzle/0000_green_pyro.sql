CREATE TYPE "public"."customer_stage" AS ENUM('new-lead', 'quote', 'booked', 'recurring');--> statement-breakpoint
CREATE TYPE "public"."customer_status" AS ENUM('active', 'lead', 'lapsed');--> statement-breakpoint
CREATE TYPE "public"."deal_signal" AS ENUM('cori', 'needs-you', 'info');--> statement-breakpoint
CREATE TYPE "public"."deal_stage" AS ENUM('new', 'needs-quote', 'quote-sent', 'follow-up', 'booked');--> statement-breakpoint
CREATE TYPE "public"."partner_stage" AS ENUM('prospect', 'vetting', 'onboarding', 'active', 'paused');--> statement-breakpoint
CREATE TYPE "public"."partner_type" AS ENUM('lead-gen', 'contractor', 'both');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "appointments" (
	"id" text PRIMARY KEY NOT NULL,
	"day_index" integer NOT NULL,
	"start" text NOT NULL,
	"duration_min" integer NOT NULL,
	"title" text NOT NULL,
	"detail" text NOT NULL,
	"kind" text NOT NULL,
	"customer_id" text,
	"partner_id" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "conversation_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"kind" text NOT NULL,
	"text" text NOT NULL,
	"meta" text,
	"chips" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"has_transcript" boolean DEFAULT false NOT NULL,
	"day_divider" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"location" text NOT NULL,
	"flag" text NOT NULL,
	"suggested_reply" text DEFAULT '' NOT NULL,
	"record_updates" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"record_note" text,
	"customer_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "customers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"location" text NOT NULL,
	"plan" text NOT NULL,
	"status" "customer_status" NOT NULL,
	"stage" "customer_stage" NOT NULL,
	"lifetime_value" integer DEFAULT 0 NOT NULL,
	"last_service" text DEFAULT '—' NOT NULL,
	"next_service" text,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"provenance" text DEFAULT '' NOT NULL,
	"home_details" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"next_step" jsonb,
	"good_to_know" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"activity" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "deals" (
	"id" text PRIMARY KEY NOT NULL,
	"stage_id" "deal_stage" NOT NULL,
	"name" text NOT NULL,
	"price" integer,
	"price_unit" text,
	"detail" text NOT NULL,
	"signal" "deal_signal" NOT NULL,
	"chip" text NOT NULL,
	"needs_you" boolean DEFAULT false NOT NULL,
	"customer_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "partners" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"contact" text NOT NULL,
	"location" text NOT NULL,
	"type" "partner_type" NOT NULL,
	"stage" "partner_stage" NOT NULL,
	"leads_generated" integer DEFAULT 0 NOT NULL,
	"jobs_covered" integer DEFAULT 0 NOT NULL,
	"value" integer DEFAULT 0 NOT NULL,
	"since" text DEFAULT '' NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"employment" jsonb NOT NULL,
	"activity" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
