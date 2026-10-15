CREATE TABLE "ai_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"job_id" uuid,
	"purpose" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" double precision DEFAULT 0 NOT NULL,
	"latency_ms" integer DEFAULT 0 NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generation_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"request" jsonb NOT NULL,
	"seed" bigint NOT NULL,
	"stage" text DEFAULT 'queued' NOT NULL,
	"provider" text NOT NULL,
	"lease_until" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"mission_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "missions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"source" text NOT NULL,
	"template_id" text NOT NULL,
	"spec_version" integer NOT NULL,
	"generator_version" text NOT NULL,
	"seed" bigint NOT NULL,
	"title" text NOT NULL,
	"spec" jsonb NOT NULL,
	"briefing" jsonb NOT NULL,
	"level_hash" text NOT NULL,
	"report" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_job_id_generation_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."generation_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_mission_id_missions_id_fk" FOREIGN KEY ("mission_id") REFERENCES "public"."missions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missions" ADD CONSTRAINT "missions_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_usage_created_idx" ON "ai_usage" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ai_usage_user_created_idx" ON "ai_usage" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "generation_jobs_owner_key_idx" ON "generation_jobs" USING btree ("owner_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "generation_jobs_owner_created_idx" ON "generation_jobs" USING btree ("owner_id","created_at");--> statement-breakpoint
CREATE INDEX "generation_jobs_active_idx" ON "generation_jobs" USING btree ("stage") WHERE stage not in ('ready', 'failed', 'cancelled');--> statement-breakpoint
CREATE INDEX "missions_owner_created_idx" ON "missions" USING btree ("owner_id","created_at");