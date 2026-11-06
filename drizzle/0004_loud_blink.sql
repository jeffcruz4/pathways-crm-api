ALTER TABLE "customers" ADD COLUMN "referred_by_team_member_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "customers" ADD CONSTRAINT "customers_referred_by_team_member_id_team_members_id_fk" FOREIGN KEY ("referred_by_team_member_id") REFERENCES "public"."team_members"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
