CREATE TABLE "corrections" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"session_id" varchar(128) NOT NULL,
	"decision_id" varchar(128),
	"fingerprint" varchar(320) NOT NULL,
	"instruction" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "execution_attempts" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"decision_id" varchar(128) NOT NULL,
	"attempt_number" integer DEFAULT 1 NOT NULL,
	"status" varchar(32) DEFAULT 'PENDING' NOT NULL,
	"claim_owner" varchar(128),
	"claim_expiry" timestamp with time zone,
	"client_token" varchar(256),
	"external_result" text,
	"error_category" varchar(32),
	"error_message" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "corrections" ADD CONSTRAINT "corrections_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corrections" ADD CONSTRAINT "corrections_decision_id_decisions_id_fk" FOREIGN KEY ("decision_id") REFERENCES "public"."decisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_attempts" ADD CONSTRAINT "execution_attempts_decision_id_decisions_id_fk" FOREIGN KEY ("decision_id") REFERENCES "public"."decisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_corrections_session_fingerprint" ON "corrections" USING btree ("session_id","fingerprint");--> statement-breakpoint
CREATE INDEX "idx_corrections_session" ON "corrections" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_execution_attempts_decision_number" ON "execution_attempts" USING btree ("decision_id","attempt_number");--> statement-breakpoint
CREATE INDEX "idx_execution_attempts_decision" ON "execution_attempts" USING btree ("decision_id");--> statement-breakpoint
CREATE INDEX "idx_execution_attempts_status" ON "execution_attempts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_execution_attempts_claim_expiry" ON "execution_attempts" USING btree ("claim_expiry");