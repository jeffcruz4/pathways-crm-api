CREATE TYPE "public"."task_bucket" AS ENUM('today', 'overdue', 'upcoming');--> statement-breakpoint
CREATE TYPE "public"."task_related_type" AS ENUM('customer', 'team-member', 'partner');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('open', 'done');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"title" text NOT NULL,
	"detail" text,
	"status" "task_status" DEFAULT 'open' NOT NULL,
	"bucket" "task_bucket" DEFAULT 'today' NOT NULL,
	"related_type" "task_related_type",
	"related_id" uuid,
	"completion_comment" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tasks" ADD CONSTRAINT "tasks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_tenant_idx" ON "tasks" USING btree ("tenant_id","status");