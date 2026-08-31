ALTER TABLE "decisions" ADD COLUMN "outcome" varchar(32);--> statement-breakpoint
ALTER TABLE "decisions" ADD COLUMN "human_action" varchar(32);--> statement-breakpoint
ALTER TABLE "decisions" ADD COLUMN "human_reason" text;--> statement-breakpoint
ALTER TABLE "decisions" ADD COLUMN "human_reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "decisions" ADD COLUMN "outcome_observed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "decisions" ADD COLUMN "prompt_tokens" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "decisions" ADD COLUMN "completion_tokens" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "decisions" ADD COLUMN "total_tokens" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "decisions" ADD COLUMN "estimated_cost_usd" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "decisions" ADD COLUMN "ai_latency_ms" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "decisions" ADD COLUMN "correction_of_decision_id" varchar(128);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "decisions" ADD CONSTRAINT "decisions_correction_of_decision_id_decisions_id_fk" FOREIGN KEY ("correction_of_decision_id") REFERENCES "public"."decisions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_decisions_outcome" ON "decisions" USING btree ("outcome");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_decisions_human_action" ON "decisions" USING btree ("human_action");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_decisions_correction_of" ON "decisions" USING btree ("correction_of_decision_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "session_budgets" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"session_id" varchar(128) NOT NULL,
	"ai_calls" integer DEFAULT 0 NOT NULL,
	"prompt_tokens" integer DEFAULT 0 NOT NULL,
	"completion_tokens" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"estimated_cost_usd" double precision DEFAULT 0 NOT NULL,
	"corrections" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_budgets_session_id_unique" UNIQUE("session_id")
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "session_budgets" ADD CONSTRAINT "session_budgets_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_session_budgets_session" ON "session_budgets" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_decisions_session_outcome" ON "decisions" USING btree ("session_id", "outcome");
