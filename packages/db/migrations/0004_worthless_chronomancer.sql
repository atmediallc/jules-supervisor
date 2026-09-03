CREATE TABLE "ai_memories" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(128) DEFAULT 'default' NOT NULL,
	"project_id" varchar(128) DEFAULT 'default' NOT NULL,
	"repository_id" varchar(512) NOT NULL,
	"memory_type" varchar(32) NOT NULL,
	"title" text NOT NULL,
	"canonical_content" text NOT NULL,
	"summary" text NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"importance" double precision DEFAULT 0.5 NOT NULL,
	"confidence" double precision DEFAULT 0.5 NOT NULL,
	"source_type" varchar(32) NOT NULL,
	"source_trust" varchar(32) DEFAULT 'unverified' NOT NULL,
	"evidence_class" varchar(32) DEFAULT 'inferred' NOT NULL,
	"source_id" varchar(128),
	"execution_id" varchar(128),
	"task_id" varchar(128),
	"affected_paths" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"branch" varchar(256),
	"commit_sha" varchar(64),
	"status" varchar(32) DEFAULT 'active' NOT NULL,
	"embedding_model" varchar(128) NOT NULL,
	"embedding_dimensions" integer NOT NULL,
	"schema_version" integer DEFAULT 3 NOT NULL,
	"superseded_by" varchar(128),
	"fingerprint" varchar(320) NOT NULL,
	"access_count" integer DEFAULT 0 NOT NULL,
	"successful_use_count" integer DEFAULT 0 NOT NULL,
	"negative_outcome_count" integer DEFAULT 0 NOT NULL,
	"last_accessed_at" timestamp with time zone,
	"last_used_execution_id" varchar(128),
	"last_validated_at" timestamp with time zone,
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_until" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_memory_embeddings" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"memory_id" varchar(128) NOT NULL,
	"tenant_id" varchar(128) DEFAULT 'default' NOT NULL,
	"project_id" varchar(128) DEFAULT 'default' NOT NULL,
	"repository_id" varchar(512) NOT NULL,
	"qdrant_point_id" varchar(128),
	"embedding_model" varchar(128) NOT NULL,
	"num_dimensions" integer NOT NULL,
	"content_hash" varchar(64) NOT NULL,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"indexed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_memory_influences" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"execution_id" varchar(128) NOT NULL,
	"memory_id" varchar(128) NOT NULL,
	"tenant_id" varchar(128) DEFAULT 'default' NOT NULL,
	"project_id" varchar(128) DEFAULT 'default' NOT NULL,
	"repository_id" varchar(512) NOT NULL,
	"retrieval_score" double precision NOT NULL,
	"rank" integer NOT NULL,
	"reason_selected" text NOT NULL,
	"injected_into_context" boolean DEFAULT false NOT NULL,
	"token_cost" integer DEFAULT 0 NOT NULL,
	"execution_succeeded" boolean,
	"outcome_signal" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_memory_relations" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"source_memory_id" varchar(128) NOT NULL,
	"target_memory_id" varchar(128) NOT NULL,
	"relation_type" varchar(32) NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_memory_embeddings" ADD CONSTRAINT "ai_memory_embeddings_memory_id_ai_memories_id_fk" FOREIGN KEY ("memory_id") REFERENCES "public"."ai_memories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_memory_influences" ADD CONSTRAINT "ai_memory_influences_memory_id_ai_memories_id_fk" FOREIGN KEY ("memory_id") REFERENCES "public"."ai_memories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_memory_relations" ADD CONSTRAINT "ai_memory_relations_source_memory_id_ai_memories_id_fk" FOREIGN KEY ("source_memory_id") REFERENCES "public"."ai_memories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_memory_relations" ADD CONSTRAINT "ai_memory_relations_target_memory_id_ai_memories_id_fk" FOREIGN KEY ("target_memory_id") REFERENCES "public"."ai_memories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_ai_memories_repo" ON "ai_memories" USING btree ("repository_id");--> statement-breakpoint
CREATE INDEX "idx_ai_memories_type" ON "ai_memories" USING btree ("memory_type");--> statement-breakpoint
CREATE INDEX "idx_ai_memories_status" ON "ai_memories" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_ai_memories_tenant_project" ON "ai_memories" USING btree ("tenant_id","project_id");--> statement-breakpoint
CREATE INDEX "idx_ai_memories_fingerprint" ON "ai_memories" USING btree ("fingerprint");--> statement-breakpoint
CREATE INDEX "idx_ai_memories_updated" ON "ai_memories" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "idx_ai_memories_superseded_by" ON "ai_memories" USING btree ("superseded_by");--> statement-breakpoint
CREATE INDEX "idx_ai_embeddings_memory" ON "ai_memory_embeddings" USING btree ("memory_id");--> statement-breakpoint
CREATE INDEX "idx_ai_embeddings_repo" ON "ai_memory_embeddings" USING btree ("repository_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_ai_embeddings_memory_content" ON "ai_memory_embeddings" USING btree ("memory_id","content_hash");--> statement-breakpoint
CREATE INDEX "idx_ai_influences_execution" ON "ai_memory_influences" USING btree ("execution_id");--> statement-breakpoint
CREATE INDEX "idx_ai_influences_memory" ON "ai_memory_influences" USING btree ("memory_id");--> statement-breakpoint
CREATE INDEX "idx_ai_influences_repo" ON "ai_memory_influences" USING btree ("repository_id");--> statement-breakpoint
CREATE INDEX "idx_ai_relations_source" ON "ai_memory_relations" USING btree ("source_memory_id");--> statement-breakpoint
CREATE INDEX "idx_ai_relations_target" ON "ai_memory_relations" USING btree ("target_memory_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_ai_relations_pair" ON "ai_memory_relations" USING btree ("source_memory_id","target_memory_id","relation_type");