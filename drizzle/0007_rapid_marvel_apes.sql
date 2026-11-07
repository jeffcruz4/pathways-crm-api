CREATE TYPE "public"."comm_channel" AS ENUM('sms', 'email', 'voice');--> statement-breakpoint
CREATE TYPE "public"."comm_consent_status" AS ENUM('opted_in', 'opted_out', 'unknown', 'provider_blocked');--> statement-breakpoint
CREATE TYPE "public"."comm_provider" AS ENUM('twilio');--> statement-breakpoint
CREATE TYPE "public"."comm_purpose" AS ENUM('job_scheduled', 'appointment_reminder', 'cleaner_en_route', 'job_completed_review', 'staff_conversation');--> statement-breakpoint
CREATE TYPE "public"."connection_status" AS ENUM('not_connected', 'setup_required', 'connected', 'action_required', 'disconnected');--> statement-breakpoint
CREATE TYPE "public"."message_direction" AS ENUM('inbound', 'outbound');--> statement-breakpoint
CREATE TYPE "public"."message_status" AS ENUM('queued', 'sending', 'sent', 'delivered', 'undelivered', 'failed', 'received', 'suppressed');--> statement-breakpoint
CREATE TYPE "public"."scheduled_comm_status" AS ENUM('pending', 'processing', 'sent', 'cancelled', 'suppressed', 'failed');--> statement-breakpoint
ALTER TYPE "public"."job_status" ADD VALUE 'en-route' BEFORE 'in-progress';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "channel_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"provider" "comm_provider" DEFAULT 'twilio' NOT NULL,
	"channel" "comm_channel" DEFAULT 'sms' NOT NULL,
	"status" "connection_status" DEFAULT 'not_connected' NOT NULL,
	"account_sid" text,
	"messaging_service_sid" text,
	"from_number" text,
	"credential_ref" text,
	"business_name" text,
	"business_phone" text,
	"review_url" text,
	"last_validated_at" timestamp with time zone,
	"last_inbound_at" timestamp with time zone,
	"last_callback_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"disconnected_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "comm_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"action" text NOT NULL,
	"actor" text,
	"customer_id" uuid,
	"message_id" uuid,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "customer_comm_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"phone_e164" text,
	"channel" "comm_channel" DEFAULT 'sms' NOT NULL,
	"purpose" "comm_purpose" NOT NULL,
	"status" "comm_consent_status" DEFAULT 'unknown' NOT NULL,
	"source" text,
	"captured_at" timestamp with time zone,
	"captured_by" text,
	"provider_status" text,
	"provider_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scheduled_communications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"job_id" uuid,
	"purpose" "comm_purpose" NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"status" "scheduled_comm_status" DEFAULT 'pending' NOT NULL,
	"idempotency_key" text NOT NULL,
	"schedule_version" text,
	"message_id" uuid,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sms_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"customer_id" uuid,
	"job_id" uuid,
	"channel" "comm_channel" DEFAULT 'sms' NOT NULL,
	"direction" "message_direction" NOT NULL,
	"purpose" "comm_purpose",
	"status" "message_status" NOT NULL,
	"from_number" text,
	"to_number" text,
	"body" text DEFAULT '' NOT NULL,
	"provider_sid" text,
	"provider_error_code" text,
	"error_detail" text,
	"idempotency_key" text,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"received_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sms_notification_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"purpose" "comm_purpose" NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"template_body" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "channel_connections" ADD CONSTRAINT "channel_connections_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "comm_audit_events" ADD CONSTRAINT "comm_audit_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "comm_audit_events" ADD CONSTRAINT "comm_audit_events_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "comm_audit_events" ADD CONSTRAINT "comm_audit_events_message_id_sms_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."sms_messages"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "customer_comm_preferences" ADD CONSTRAINT "customer_comm_preferences_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "customer_comm_preferences" ADD CONSTRAINT "customer_comm_preferences_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "scheduled_communications" ADD CONSTRAINT "scheduled_communications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "scheduled_communications" ADD CONSTRAINT "scheduled_communications_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "scheduled_communications" ADD CONSTRAINT "scheduled_communications_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "scheduled_communications" ADD CONSTRAINT "scheduled_communications_message_id_sms_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."sms_messages"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sms_notification_settings" ADD CONSTRAINT "sms_notification_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "channel_connections_tenant_provider_channel_uq" ON "channel_connections" USING btree ("tenant_id","provider","channel");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "comm_audit_events_tenant_idx" ON "comm_audit_events" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "customer_comm_preferences_uq" ON "customer_comm_preferences" USING btree ("tenant_id","customer_id","channel","purpose");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customer_comm_preferences_customer_idx" ON "customer_comm_preferences" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scheduled_communications_due_idx" ON "scheduled_communications" USING btree ("status","scheduled_for");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "scheduled_communications_idempotency_uq" ON "scheduled_communications" USING btree ("tenant_id","idempotency_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sms_messages_customer_idx" ON "sms_messages" USING btree ("customer_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sms_messages_job_idx" ON "sms_messages" USING btree ("job_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sms_messages_provider_sid_uq" ON "sms_messages" USING btree ("tenant_id","provider_sid") WHERE "sms_messages"."provider_sid" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sms_messages_idempotency_uq" ON "sms_messages" USING btree ("tenant_id","idempotency_key") WHERE "sms_messages"."idempotency_key" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sms_notification_settings_tenant_purpose_uq" ON "sms_notification_settings" USING btree ("tenant_id","purpose");