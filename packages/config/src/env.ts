import { config as loadDotenv } from "dotenv";
import { z } from "zod";

loadDotenv();

export const ExecutionModeSchema = z.enum([
  "DISABLED",
  "DRY_RUN",
  "ASSISTED",
  "AUTO_RESPOND",
  "FULL_AUTO",
]);

export type ExecutionMode = z.infer<typeof ExecutionModeSchema>;

export const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(3000),
  WORKER_PORT: z.coerce.number().default(3001),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),

  // Execution & Safety Controls
  SUPERVISOR_MODE: ExecutionModeSchema.default("DRY_RUN"),
  AUTO_RESPOND_ENABLED: z
    .string()
    .transform((val) => val === "true" || val === "1")
    .default(false),
  AUTO_PLAN_APPROVAL_ENABLED: z
    .string()
    .transform((val) => val === "true" || val === "1")
    .default(false),
  MAX_SESSION_CYCLES: z.coerce.number().min(1).max(50).default(5),
  MAX_AI_RETRIES: z.coerce.number().min(0).max(10).default(3),
  POLL_INTERVAL_MS: z.coerce.number().min(1000).max(300000).default(5000),
  // Reconciliation page size: how many activities the poller fetches per page
  // while catching up on every unseen activity (not just the latest).
  RECONCILIATION_PAGE_SIZE: z.coerce.number().min(1).max(200).default(20),
  CONFIDENCE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.85),

  // Autonomy Budget Engine (per Jules session, persisted in PostgreSQL)
  BUDGET_MAX_AI_CALLS_PER_SESSION: z.coerce.number().min(1).max(1000).default(50),
  BUDGET_MAX_TOKENS_PER_SESSION: z.coerce.number().min(1000).max(10_000_000).default(100_000),
  BUDGET_MAX_COST_USD_PER_SESSION: z.coerce.number().min(0.01).max(1000).default(5),
  BUDGET_MAX_CORRECTIONS_PER_SESSION: z.coerce.number().min(1).max(20).default(3),
  AI_COST_PER_1K_PROMPT_TOKENS_USD: z.coerce.number().min(0).default(2.5),
  AI_COST_PER_1K_COMPLETION_TOKENS_USD: z.coerce.number().min(0).default(10),

  // P1: Cross-session relational memory retrieval bounds (advisory evidence).
  // Clamped to MEMORY_RETRIEVAL_BOUNDS from @jules/core (hard ceilings).
  MEMORY_PRECEDENT_MAX_SUCCESS: z.coerce.number().min(0).max(100).default(10),
  MEMORY_PRECEDENT_MAX_HUMAN_REVIEWED: z.coerce.number().min(0).max(100).default(5),
  MEMORY_PRECEDENT_MAX_FAILURES: z.coerce.number().min(0).max(100).default(3),
  MEMORY_KNOWLEDGE_MAX_ITEMS: z.coerce.number().min(0).max(100).default(20),
  MEMORY_ADVISORY_TOKEN_BUDGET: z.coerce.number().min(128).max(4096).default(1024),

  // ── Semantic Memory (Qdrant + Embeddings) ──
  AI_MEMORY_ENABLED: z
    .string()
    .transform((val) => val === "true" || val === "1")
    .default(false),
  AI_MEMORY_RECALL_ENABLED: z
    .string()
    .transform((val) => val === "true" || val === "1")
    .default(true),
  AI_MEMORY_REFLECTION_ENABLED: z
    .string()
    .transform((val) => val === "true" || val === "1")
    .default(true),
  AI_MEMORY_CONSOLIDATION_ENABLED: z
    .string()
    .transform((val) => val === "true" || val === "1")
    .default(true),
  // Qdrant vector database
  QDRANT_URL: z.string().url().default("http://127.0.0.1:6333"),
  QDRANT_API_KEY: z.string().default(""),
  QDRANT_COLLECTION: z.string().default("jules_memory_v1"),
  QDRANT_TIMEOUT_MS: z.coerce.number().min(1000).max(30000).default(5000),
  QDRANT_MAX_RETRIES: z.coerce.number().min(0).max(10).default(3),
  // Embeddings provider
  EMBEDDING_PROVIDER: z.enum(["openai", "openai-compatible"]).default("openai"),
  EMBEDDING_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  EMBEDDING_API_KEY: z.string().default(""),
  EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),
  EMBEDDING_DIMENSIONS: z.coerce.number().min(64).max(4096).default(1536),
  EMBEDDING_BATCH_SIZE: z.coerce.number().min(1).max(2048).default(100),
  EMBEDDING_TIMEOUT_MS: z.coerce.number().min(1000).max(60000).default(30000),
  // Semantic memory recall
  MEMORY_RECALL_TOP_K: z.coerce.number().min(1).max(100).default(20),
  MEMORY_RECALL_SIMILARITY_THRESHOLD: z.coerce.number().min(0).max(1).default(0.35),
  MEMORY_RECALL_CANDIDATE_MULTIPLIER: z.coerce.number().min(1).max(10).default(3),
  MEMORY_RECALL_TOKEN_BUDGET: z.coerce.number().min(128).max(16384).default(4096),
  // Memory admission
  MEMORY_ADMISSION_MIN_IMPORTANCE: z.coerce.number().min(0).max(1).default(0.3),
  MEMORY_ADMISSION_MIN_CONFIDENCE: z.coerce.number().min(0).max(1).default(0.4),
  MEMORY_ADMISSION_MAX_LENGTH_CHARS: z.coerce.number().min(256).max(100_000).default(8_000),
  MEMORY_ADMISSION_DEDUP_SIMILARITY: z.coerce.number().min(0.8).max(1).default(0.95),
  // Memory decay & consolidation
  MEMORY_CONSOLIDATION_INTERVAL_MS: z.coerce.number().min(60_000).max(86_400_000).default(3_600_000),
  MEMORY_STALE_DAYS: z.coerce.number().min(1).max(365).default(90),
  MEMORY_EXPIRY_DAYS_EPISODIC: z.coerce.number().min(1).max(365).default(30),
  MEMORY_EXPIRY_DAYS_PROCEDURAL: z.coerce.number().min(7).max(730).default(180),

  // Google Jules API Configuration
  JULES_API_BASE_URL: z.string().url().default("https://jules.googleapis.com/v1alpha"),
  JULES_API_KEY: z.string().min(1).default("mock-jules-key-placeholder"),
  JULES_API_TIMEOUT_MS: z.coerce.number().min(1000).max(60000).default(15000),
  JULES_RATE_LIMIT_RPS: z.coerce.number().min(1).max(100).default(5),

  // Durable execution reconciliation (H3). Lease on an execution attempt; a
  // worker that holds an attempt past its lease is presumed dead and the
  // attempt is recoverable by another worker (re-driven with the same
  // clientToken — the API is idempotent by token, so no double-apply).
  EXECUTION_ATTEMPT_LEASE_MS: z.coerce.number().min(5_000).max(3_600_000).default(120_000),
  // Maximum total attempts per decision before escalation to a human.
  EXECUTION_MAX_ATTEMPTS: z.coerce.number().min(1).max(10).default(3),
  // How often the reconciler scans for stale in-flight attempts.
  EXECUTION_RECONCILE_INTERVAL_MS: z.coerce.number().min(10_000).max(3_600_000).default(60_000),

  // AI Provider & OmniRoute Configuration
  AI_PROVIDER_TYPE: z
    .enum(["openai", "openai-compatible", "omniroute", "generic", "endpoint", "mock"])
    .default("endpoint"),
  AI_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  AI_API_KEY: z.string().min(1).default("mock-ai-key-placeholder"),
  AI_MODEL: z.string().default("gpt-4o"),
  AI_TIMEOUT_MS: z.coerce.number().min(1000).max(120000).default(30000),
  AI_MAX_TOKENS: z.coerce.number().min(100).max(16384).default(2048),
  ALLOW_INSECURE_LOCAL_ENDPOINTS: z
    .string()
    .transform((val) => val === "true" || val === "1")
    .default(false),
  TRUSTED_INTERNAL_AI_HOSTS: z
    .string()
    .default("localhost,127.0.0.1,omniroute")
    .transform((str) => str.split(",").map((s) => s.trim())),

  // Optional ordered fallback providers for AI failover. JSON array of
  // {name?, baseUrl, apiKey, model}. Each entry is wired as a secondary
  // provider behind the primary; the ProviderRouter fails over in order.
  // Empty/absent => single-provider mode (current default). OmniRoute can be
  // supplied here as an OpenAI-compatible base-URL profile.
  AI_FALLBACK_PROVIDERS: z
    .string()
    .default("[]")
    .transform((str) => {
      const trimmed = str.trim();
      if (!trimmed) return [];
      try {
        const parsed: unknown = JSON.parse(trimmed);
        if (!Array.isArray(parsed)) {
          throw new Error("AI_FALLBACK_PROVIDERS must be a JSON array");
        }
        return parsed.map((p) => {
          const item = p as {
            name?: string;
            baseUrl?: string;
            apiKey?: string;
            model?: string;
          };
          if (!item || typeof item !== "object") {
            throw new Error("AI_FALLBACK_PROVIDERS entries must be objects");
          }
          if (!item.baseUrl || !item.apiKey || !item.model) {
            throw new Error(
              "AI_FALLBACK_PROVIDERS entries require baseUrl, apiKey, and model",
            );
          }
          return {
            name: item.name ?? "endpoint",
            baseUrl: item.baseUrl,
            apiKey: item.apiKey,
            model: item.model,
          };
        });
      } catch (err: unknown) {
        throw new Error(`Invalid AI_FALLBACK_PROVIDERS: ${(err as Error).message}`);
      }
    }),

  // Persistence (PostgreSQL)
  DATABASE_URL: z
    .string()
    .default(
      "postgresql://jules_user:jules_password@127.0.0.1:5439/jules_supervisor?sslmode=disable",
    ),
  DB_MAX_CONNECTIONS: z.coerce.number().min(1).max(100).default(10),

  // Graceful shutdown deadline (ms). The worker drains in-flight work and
  // closes all resources (DB pool, Redis, HTTP servers) within this bound
  // before force-exiting, so a wedged resource can never hang shutdown.
  GRACEFUL_SHUTDOWN_TIMEOUT_MS: z.coerce.number().min(1000).max(120000).default(15000),

  // Redis & Queueing
  REDIS_URL: z.string().default("redis://127.0.0.1:6389"),
  REDIS_ENABLED: z
    .string()
    .transform((val) => val === "true" || val === "1")
    .default(true),
  USE_IN_MEMORY_QUEUE_FALLBACK: z
    .string()
    .transform((val) => val === "true" || val === "1")
    .default(false),
  // Phase 3: when true and REDIS_ENABLED, a worker that cannot acquire a REAL
  // distributed lock refuses to start (fail-closed) rather than falling back to
  // an in-memory per-process lock (which breaks mutual exclusion across
  // workers). When false (default), the worker starts in DEGRADED lock mode:
  // it still polls/observes but escalates every mutation to a human until a
  // real lock is available.
  LOCK_REQUIRE_REDIS: z
    .string()
    .transform((val) => val === "true" || val === "1")
    .default(false),

  // Security & Web
  SESSION_SECRET: z.string().min(16).default("session-secret-at-least-32-chars-length-12345"),
  // Key used to encrypt secrets at rest in system_settings (isSecret rows).
  // AES-256-GCM. If absent, secrets are stored in plaintext (backward compat).
  SETTINGS_ENCRYPTION_KEY: z.string().min(0).default(""),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),

  // Filesystem & Portability
  JULES_WORKSPACE_NAME: z.string().default("jules-supervisor"),
  JULES_WORKSPACE_PATH: z.string().default("/workspace"),
  MIGRATIONS_FOLDER: z.string().optional(),
  TEMP_DIR: z.string().optional(),
});

export type AppConfig = z.infer<typeof EnvSchema>;

let _config: AppConfig | null = null;
let _dbOverrides: Record<string, string> = {};

/** Set database-sourced overrides that take precedence over env vars. */
export function setDbOverrides(overrides: Record<string, string>): void {
  _dbOverrides = overrides;
  _config = null; // force re-parse
}

/** Clear the cached config (called after settings are updated via admin UI). */
export function clearConfigCache(): void {
  _config = null;
}

export function getConfig(overrideEnv?: Record<string, string>): AppConfig {
  if (overrideEnv) {
    return EnvSchema.parse({ ...process.env, ...overrideEnv });
  }
  if (!_config) {
    // Merge: env vars → DB overrides (DB wins)
    const merged = { ...process.env, ..._dbOverrides };
    const result = EnvSchema.safeParse(merged);
    if (!result.success) {
      console.error("❌ Environment configuration validation failed:");
      console.error(result.error.format());
      throw new Error(`Invalid environment configuration: ${JSON.stringify(result.error.issues)}`);
    }
    _config = result.data;
  }
  return _config;
}
