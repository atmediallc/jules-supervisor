import {
  pgTable,
  text,
  timestamp,
  varchar,
  integer,
  boolean,
  jsonb,
  doublePrecision,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const sessions = pgTable(
  "sessions",
  {
    id: varchar("id", { length: 128 }).primaryKey(),
    name: text("name").notNull(),
    repository: text("repository").notNull(),
    branch: text("branch").notNull().default("main"),
    prompt: text("prompt").notNull(),
    state: varchar("state", { length: 64 }).notNull().default("QUEUED"),
    supervisorStatus: varchar("supervisor_status", { length: 64 }).notNull().default("IDLE"),
    lastActivityId: varchar("last_activity_id", { length: 128 }),
    cycleCount: integer("cycle_count").notNull().default(0),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_sessions_state").on(table.state),
    index("idx_sessions_supervisor_status").on(table.supervisorStatus),
    index("idx_sessions_repo").on(table.repository),
    index("idx_sessions_updated_at").on(table.updatedAt),
  ],
);

export const activities = pgTable(
  "activities",
  {
    id: varchar("id", { length: 128 }).primaryKey(),
    sessionId: varchar("session_id", { length: 128 })
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 64 }).notNull(),
    content: text("content"),
    plan: jsonb("plan").$type<Record<string, unknown>>(),
    patch: jsonb("patch").$type<{ diff?: string; filesChanged?: string[] }>(),
    toolCall: jsonb("tool_call").$type<Record<string, unknown>>(),
    toolResult: jsonb("tool_result").$type<Record<string, unknown>>(),
    rawPayload: jsonb("raw_payload").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_activities_session_id").on(table.sessionId),
    index("idx_activities_type").on(table.type),
    index("idx_activities_created_at").on(table.createdAt),
  ],
);

export const decisions = pgTable(
  "decisions",
  {
    id: varchar("id", { length: 128 }).primaryKey(),
    sessionId: varchar("session_id", { length: 128 })
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    activityId: varchar("activity_id", { length: 128 })
      .notNull()
      .references(() => activities.id, { onDelete: "cascade" }),
    idempotencyKey: varchar("idempotency_key", { length: 256 }).notNull(),
    action: varchar("action", { length: 64 }).notNull(),
    proposedResponse: text("proposed_response"),
    risk: varchar("risk", { length: 32 }).notNull().default("low"),
    confidence: doublePrecision("confidence").notNull().default(1.0),
    reason: text("reason").notNull(),
    evidence: jsonb("evidence").$type<string[]>().default([]),
    concerns: jsonb("concerns").$type<string[]>().default([]),
    provider: varchar("provider", { length: 64 }).notNull(),
    model: varchar("model", { length: 128 }).notNull(),
    contextDigest: varchar("context_digest", { length: 64 }).notNull(),
    executionState: varchar("execution_state", { length: 64 }).notNull().default("PENDING"),
    executedAt: timestamp("executed_at", { withTimezone: true }),
    executionError: text("execution_error"),
    // Outcome tracking & human feedback correlation (autonomy audit P0)
    outcome: varchar("outcome", { length: 32 }),
    humanAction: varchar("human_action", { length: 32 }),
    humanReason: text("human_reason"),
    humanReviewedAt: timestamp("human_reviewed_at", { withTimezone: true }),
    outcomeObservedAt: timestamp("outcome_observed_at", { withTimezone: true }),
    // AI usage / cost accounting (autonomy audit P0)
    promptTokens: integer("prompt_tokens").notNull().default(0),
    completionTokens: integer("completion_tokens").notNull().default(0),
    totalTokens: integer("total_tokens").notNull().default(0),
    estimatedCostUsd: doublePrecision("estimated_cost_usd").notNull().default(0),
    aiLatencyMs: integer("ai_latency_ms").notNull().default(0),
    // Correction loop (autonomy audit P0)
    correctionOfDecisionId: varchar("correction_of_decision_id", { length: 128 }),
    // Final approved value & provenance (P1 Phase 8 + memory provenance)
    finalApprovedResponse: text("final_approved_response"),
    precedentDecisionIds: jsonb("precedent_decision_ids").$type<string[]>().default([]),
    repositoryKnowledgeIds: jsonb("repository_knowledge_ids").$type<string[]>().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uniq_decisions_idempotency").on(table.idempotencyKey),
    index("idx_decisions_session_id").on(table.sessionId),
    index("idx_decisions_execution_state").on(table.executionState),
    index("idx_decisions_created_at").on(table.createdAt),
    index("idx_decisions_outcome").on(table.outcome),
    index("idx_decisions_human_action").on(table.humanAction),
    index("idx_decisions_correction_of").on(table.correctionOfDecisionId),
    index("idx_decisions_session_outcome").on(table.sessionId, table.outcome),
  ],
);

export const approvalRequests = pgTable(
  "approval_requests",
  {
    id: varchar("id", { length: 128 }).primaryKey(),
    decisionId: varchar("decision_id", { length: 128 })
      .notNull()
      .references(() => decisions.id, { onDelete: "cascade" }),
    sessionId: varchar("session_id", { length: 128 })
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 32 }).notNull().default("PENDING"),
    action: varchar("action", { length: 64 }).notNull(),
    proposedResponse: text("proposed_response"),
    modifiedResponse: text("modified_response"),
    reviewer: varchar("reviewer", { length: 128 }),
    reviewComment: text("review_comment"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_approval_status").on(table.status),
    index("idx_approval_session_id").on(table.sessionId),
    index("idx_approval_decision_id").on(table.decisionId),
  ],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: varchar("id", { length: 128 }).primaryKey(),
    actor: varchar("actor", { length: 128 }).notNull(),
    actorType: varchar("actor_type", { length: 32 }).notNull().default("SYSTEM"),
    action: varchar("action", { length: 128 }).notNull(),
    targetType: varchar("target_type", { length: 64 }).notNull(),
    targetId: varchar("target_id", { length: 128 }).notNull(),
    sessionId: varchar("session_id", { length: 128 }),
    decisionId: varchar("decision_id", { length: 128 }),
    beforeState: jsonb("before_state").$type<Record<string, unknown>>(),
    afterState: jsonb("after_state").$type<Record<string, unknown>>(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_audit_session_id").on(table.sessionId),
    index("idx_audit_action").on(table.action),
    index("idx_audit_timestamp").on(table.timestamp),
  ],
);

export const syncCheckpoints = pgTable(
  "sync_checkpoints",
  {
    id: varchar("id", { length: 128 }).primaryKey(),
    sessionId: varchar("session_id", { length: 128 }).notNull().unique(),
    lastActivityId: varchar("last_activity_id", { length: 128 }),
    nextPageToken: text("next_page_token"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_sync_checkpoints_session").on(table.sessionId)],
);

export const policies = pgTable(
  "policies",
  {
    id: varchar("id", { length: 128 }).primaryKey(),
    name: varchar("name", { length: 128 }).notNull().unique(),
    version: integer("version").notNull().default(1),
    description: text("description").notNull(),
    rules: jsonb("rules").$type<Record<string, unknown>>().notNull(),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_policies_enabled").on(table.enabled)],
);

// Cross-session repository knowledge base (P1: repository knowledge ingestion).
// PostgreSQL-relational only — NO vectors, NO embeddings.
export const repositoryKnowledge = pgTable(
  "repository_knowledge",
  {
    id: varchar("id", { length: 128 }).primaryKey(),
    repositoryId: varchar("repository_id", { length: 256 }).notNull(),
    knowledgeType: varchar("knowledge_type", { length: 64 }).notNull(),
    content: text("content").notNull(),
    sourceType: varchar("source_type", { length: 64 }).notNull(),
    sourcePath: varchar("source_path", { length: 512 }),
    sourceHash: varchar("source_hash", { length: 64 }),
    trustLevel: varchar("trust_level", { length: 64 }).notNull().default("INFERRED"),
    validFrom: timestamp("valid_from", { withTimezone: true }).notNull().defaultNow(),
    validUntil: timestamp("valid_until", { withTimezone: true }),
    supersededBy: varchar("superseded_by", { length: 128 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_repo_knowledge_repository_id").on(table.repositoryId),
    index("idx_repo_knowledge_type").on(table.knowledgeType),
    index("idx_repo_knowledge_trust").on(table.trustLevel),
    index("idx_repo_knowledge_superseded_by").on(table.supersededBy),
    uniqueIndex("uniq_repo_knowledge_dedup").on(
      table.repositoryId,
      table.knowledgeType,
      table.sourceType,
      table.sourceHash,
    ),
  ],
);

// ── System Settings (admin-managed configuration overrides) ──────────────
// Key-value store for runtime configuration that can be edited from the web admin.
// Secrets are stored encrypted at rest; the API layer handles encryption/decryption.
export const systemSettings = pgTable(
  "system_settings",
  {
    key: varchar("key", { length: 128 }).primaryKey(),
    value: text("value").notNull(),
    category: varchar("category", { length: 64 }).notNull().default("general"),
    isSecret: boolean("is_secret").notNull().default(false),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_system_settings_category").on(table.category)],
);

// Autonomy Budget Engine persistent counters (audit P0: budgets must survive restarts)
export const sessionBudgets = pgTable(
  "session_budgets",
  {
    id: varchar("id", { length: 128 }).primaryKey(),
    sessionId: varchar("session_id", { length: 128 })
      .notNull()
      .unique()
      .references(() => sessions.id, { onDelete: "cascade" }),
    aiCalls: integer("ai_calls").notNull().default(0),
    promptTokens: integer("prompt_tokens").notNull().default(0),
    completionTokens: integer("completion_tokens").notNull().default(0),
    totalTokens: integer("total_tokens").notNull().default(0),
    estimatedCostUsd: doublePrecision("estimated_cost_usd").notNull().default(0),
    corrections: integer("corrections").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_session_budgets_session").on(table.sessionId)],
);
