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
    .default("false"),
  AUTO_PLAN_APPROVAL_ENABLED: z
    .string()
    .transform((val) => val === "true" || val === "1")
    .default("false"),
  MAX_SESSION_CYCLES: z.coerce.number().min(1).max(50).default(5),
  MAX_AI_RETRIES: z.coerce.number().min(0).max(10).default(3),
  POLL_INTERVAL_MS: z.coerce.number().min(1000).max(300000).default(5000),
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

  // Google Jules API Configuration
  JULES_API_BASE_URL: z.string().url().default("https://jules.googleapis.com/v1alpha"),
  JULES_API_KEY: z.string().min(1).default("mock-jules-key-placeholder"),
  JULES_API_TIMEOUT_MS: z.coerce.number().min(1000).max(60000).default(15000),
  JULES_RATE_LIMIT_RPS: z.coerce.number().min(1).max(100).default(5),

  // AI Provider & OmniRoute Configuration
  AI_PROVIDER_TYPE: z.enum(["openai", "omniroute", "mock"]).default("openai"),
  AI_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  AI_API_KEY: z.string().min(1).default("mock-ai-key-placeholder"),
  AI_MODEL: z.string().default("gpt-4o"),
  AI_TIMEOUT_MS: z.coerce.number().min(1000).max(120000).default(30000),
  AI_MAX_TOKENS: z.coerce.number().min(100).max(16384).default(2048),
  ALLOW_INSECURE_LOCAL_ENDPOINTS: z
    .string()
    .transform((val) => val === "true" || val === "1")
    .default("false"),
  TRUSTED_INTERNAL_AI_HOSTS: z
    .string()
    .default("localhost,127.0.0.1,omniroute")
    .transform((str) => str.split(",").map((s) => s.trim())),

  // Persistence (PostgreSQL)
  DATABASE_URL: z
    .string()
    .default(
      "postgresql://jules_user:jules_password@127.0.0.1:5439/jules_supervisor?sslmode=disable",
    ),
  DB_MAX_CONNECTIONS: z.coerce.number().min(1).max(100).default(10),

  // Redis & Queueing
  REDIS_URL: z.string().default("redis://127.0.0.1:6389"),
  REDIS_ENABLED: z
    .string()
    .transform((val) => val === "true" || val === "1")
    .default("true"),
  USE_IN_MEMORY_QUEUE_FALLBACK: z
    .string()
    .transform((val) => val === "true" || val === "1")
    .default("false"),

  // Security & Web
  SESSION_SECRET: z.string().min(16).default("session-secret-at-least-32-chars-length-12345"),
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
