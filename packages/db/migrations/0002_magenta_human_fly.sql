ALTER TABLE "decisions" ADD COLUMN IF NOT EXISTS "final_approved_response" text;--> statement-breakpoint
ALTER TABLE "decisions" ADD COLUMN IF NOT EXISTS "precedent_decision_ids" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "decisions" ADD COLUMN IF NOT EXISTS "repository_knowledge_ids" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "repository_knowledge" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"repository_id" varchar(256) NOT NULL,
	"knowledge_type" varchar(64) NOT NULL,
	"content" text NOT NULL,
	"source_type" varchar(64) NOT NULL,
	"source_path" varchar(512),
	"source_hash" varchar(64),
	"trust_level" varchar(64) DEFAULT 'INFERRED' NOT NULL,
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_until" timestamp with time zone,
	"superseded_by" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_repo_knowledge_repository_id" ON "repository_knowledge" USING btree ("repository_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_repo_knowledge_type" ON "repository_knowledge" USING btree ("knowledge_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_repo_knowledge_trust" ON "repository_knowledge" USING btree ("trust_level");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_repo_knowledge_superseded_by" ON "repository_knowledge" USING btree ("superseded_by");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_repo_knowledge_dedup" ON "repository_knowledge" USING btree ("repository_id","knowledge_type","source_type","source_hash");
