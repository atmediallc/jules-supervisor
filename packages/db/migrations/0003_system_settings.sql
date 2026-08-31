CREATE TABLE IF NOT EXISTS "system_settings" (
	"key" varchar(128) PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"category" varchar(64) DEFAULT 'general' NOT NULL,
	"is_secret" boolean DEFAULT false NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_system_settings_category" ON "system_settings" USING btree ("category");
