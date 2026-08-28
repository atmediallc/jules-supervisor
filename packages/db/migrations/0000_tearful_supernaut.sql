CREATE TABLE IF NOT EXISTS "activities" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"session_id" varchar(128) NOT NULL,
	"type" varchar(64) NOT NULL,
	"content" text,
	"plan" jsonb,
	"patch" jsonb,
	"tool_call" jsonb,
	"tool_result" jsonb,
	"raw_payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "approval_requests" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"decision_id" varchar(128) NOT NULL,
	"session_id" varchar(128) NOT NULL,
	"status" varchar(32) DEFAULT 'PENDING' NOT NULL,
	"action" varchar(64) NOT NULL,
	"proposed_response" text,
	"modified_response" text,
	"reviewer" varchar(128),
	"review_comment" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_events" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"actor" varchar(128) NOT NULL,
	"actor_type" varchar(32) DEFAULT 'SYSTEM' NOT NULL,
	"action" varchar(128) NOT NULL,
	"target_type" varchar(64) NOT NULL,
	"target_id" varchar(128) NOT NULL,
	"session_id" varchar(128),
	"decision_id" varchar(128),
	"before_state" jsonb,
	"after_state" jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "decisions" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"session_id" varchar(128) NOT NULL,
	"activity_id" varchar(128) NOT NULL,
	"idempotency_key" varchar(256) NOT NULL,
	"action" varchar(64) NOT NULL,
	"proposed_response" text,
	"risk" varchar(32) DEFAULT 'low' NOT NULL,
	"confidence" double precision DEFAULT 1 NOT NULL,
	"reason" text NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb,
	"concerns" jsonb DEFAULT '[]'::jsonb,
	"provider" varchar(64) NOT NULL,
	"model" varchar(128) NOT NULL,
	"context_digest" varchar(64) NOT NULL,
	"execution_state" varchar(64) DEFAULT 'PENDING' NOT NULL,
	"executed_at" timestamp with time zone,
	"execution_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "policies" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"name" varchar(128) NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"description" text NOT NULL,
	"rules" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "policies_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sessions" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"repository" text NOT NULL,
	"branch" text DEFAULT 'main' NOT NULL,
	"prompt" text NOT NULL,
	"state" varchar(64) DEFAULT 'QUEUED' NOT NULL,
	"supervisor_status" varchar(64) DEFAULT 'IDLE' NOT NULL,
	"last_activity_id" varchar(128),
	"cycle_count" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sync_checkpoints" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"session_id" varchar(128) NOT NULL,
	"last_activity_id" varchar(128),
	"next_page_token" text,
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sync_checkpoints_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "activities" ADD CONSTRAINT "activities_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_decision_id_decisions_id_fk" FOREIGN KEY ("decision_id") REFERENCES "public"."decisions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "decisions" ADD CONSTRAINT "decisions_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "decisions" ADD CONSTRAINT "decisions_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_activities_session_id" ON "activities" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_activities_type" ON "activities" USING btree ("type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_activities_created_at" ON "activities" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_approval_status" ON "approval_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_approval_session_id" ON "approval_requests" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_approval_decision_id" ON "approval_requests" USING btree ("decision_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_session_id" ON "audit_events" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_action" ON "audit_events" USING btree ("action");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_timestamp" ON "audit_events" USING btree ("timestamp");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_decisions_idempotency" ON "decisions" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_decisions_session_id" ON "decisions" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_decisions_execution_state" ON "decisions" USING btree ("execution_state");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_decisions_created_at" ON "decisions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_policies_enabled" ON "policies" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sessions_state" ON "sessions" USING btree ("state");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sessions_supervisor_status" ON "sessions" USING btree ("supervisor_status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sessions_repo" ON "sessions" USING btree ("repository");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sessions_updated_at" ON "sessions" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sync_checkpoints_session" ON "sync_checkpoints" USING btree ("session_id");