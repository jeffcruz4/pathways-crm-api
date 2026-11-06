ALTER TABLE "team_members" ADD COLUMN "preferred_days" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "team_members" ADD COLUMN "preferred_hours" text;