CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"difficulty" text DEFAULT 'standard' NOT NULL,
	"progress" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mission_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"campaign_id" uuid,
	"mission_key" text NOT NULL,
	"squad" jsonb NOT NULL,
	"difficulty" text NOT NULL,
	"seed" integer NOT NULL,
	"outcome" text DEFAULT 'running' NOT NULL,
	"stats" jsonb,
	"score" integer,
	"rank" text,
	"medals" jsonb,
	"duration_seconds" integer,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "save_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slot_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"schema_version" integer NOT NULL,
	"payload" "bytea" NOT NULL,
	"checksum" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "save_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"slot" text NOT NULL,
	"mission_key" text NOT NULL,
	"summary" jsonb NOT NULL,
	"current_revision_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_runs" ADD CONSTRAINT "mission_runs_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_runs" ADD CONSTRAINT "mission_runs_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "save_revisions" ADD CONSTRAINT "save_revisions_slot_id_save_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."save_slots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "save_revisions" ADD CONSTRAINT "save_revisions_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "save_slots" ADD CONSTRAINT "save_slots_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaigns_owner_updated_idx" ON "campaigns" USING btree ("owner_id","updated_at");--> statement-breakpoint
CREATE INDEX "mission_runs_owner_started_idx" ON "mission_runs" USING btree ("owner_id","started_at");--> statement-breakpoint
CREATE INDEX "save_revisions_slot_created_idx" ON "save_revisions" USING btree ("slot_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "save_slots_owner_slot_idx" ON "save_slots" USING btree ("owner_id","slot");