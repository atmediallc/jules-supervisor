/**
 * Semantic AI Memory Engine — canonical domain types (Phase B).
 *
 * Strongly-typed, provider-agnostic memory model. These types are the
 * authoritative domain contract shared across packages/ai, packages/db,
 * and apps/worker. Runtime schemas (Zod) enforce trust boundaries.
 */
import { z } from "zod";

// ── Memory Type Taxonomy ──────────────────────────────────────────────

export const MemoryTypeSchema = z.enum([
  "episodic",
  "semantic",
  "procedural",
  "decision",
  "failure",
  "repository",
  "preference",
  "task_outcome",
]);
export type MemoryType = z.infer<typeof MemoryTypeSchema>;

// ── Memory Status Lifecycle ───────────────────────────────────────────

export const MemoryStatusSchema = z.enum([
  "active",
  "superseded",
  "stale",
  "invalidated",
  "archived",
  "expired",
]);
export type MemoryStatus = z.infer<typeof MemoryStatusSchema>;

// ── Source Provenance ─────────────────────────────────────────────────

export const SourceTypeSchema = z.enum([
  "human",
  "jules_task",
  "execution",
  "repository",
  "test",
  "tool",
  "system",
  "ai_reflection",
]);
export type SourceType = z.infer<typeof SourceTypeSchema>;

// ── Source Trust Hierarchy (lower rank = higher trust) ─────────────────

export const SourceTrustSchema = z.enum([
  "human_approved",
  "test_verified",
  "direct_observation",
  "api_result",
  "ai_inferred",
  "unverified",
]);
export type SourceTrust = z.infer<typeof SourceTrustSchema>;

export const SOURCE_TRUST_RANK: Record<SourceTrust, number> = {
  human_approved: 0,
  test_verified: 1,
  direct_observation: 2,
  api_result: 3,
  ai_inferred: 4,
  unverified: 5,
};

// ── Observed vs Inferred ──────────────────────────────────────────────

export const EvidenceClassSchema = z.enum([
  "observed",
  "inferred",
  "human_confirmed",
  "test_verified",
]);
export type EvidenceClass = z.infer<typeof EvidenceClassSchema>;

// ── Memory Relationship Types ─────────────────────────────────────────

export const MemoryRelationTypeSchema = z.enum([
  "caused_by",
  "resolved_by",
  "validated_by",
  "supersedes",
  "derived_from",
  "related_to",
  "applies_to",
  "contradicts",
]);
export type MemoryRelationType = z.infer<typeof MemoryRelationTypeSchema>;

// ── Core Memory Domain Model ──────────────────────────────────────────

export interface AiMemory {
  id: string;
  tenantId: string;
  projectId: string;
  repositoryId: string;
  memoryType: MemoryType;
  title: string;
  canonicalContent: string;
  summary: string;
  tags: string[];
  importance: number;
  confidence: number;
  sourceType: SourceType;
  sourceTrust: SourceTrust;
  evidenceClass: EvidenceClass;
  sourceId: string | null;
  executionId: string | null;
  taskId: string | null;
  affectedPaths: string[];
  branch: string | null;
  commitSha: string | null;
  status: MemoryStatus;
  embeddingModel: string;
  embeddingDimensions: number;
  schemaVersion: number;
  supersededBy: string | null;
  fingerprint: string;
  accessCount: number;
  successfulUseCount: number;
  negativeOutcomeCount: number;
  lastAccessedAt: Date | null;
  lastUsedExecutionId: string | null;
  lastValidatedAt: Date | null;
  validFrom: Date;
  validUntil: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// ── Memory Influence Record ───────────────────────────────────────────

export interface AiMemoryInfluence {
  id: string;
  executionId: string;
  memoryId: string;
  retrievalScore: number;
  rank: number;
  reasonSelected: string;
  injectedIntoContext: boolean;
  tokenCost: number;
  executionSucceeded: boolean | null;
  outcomeSignal: string | null;
  createdAt: Date;
}

// ── Memory Recall Request / Response ───────────────────────────────────

export interface MemoryRecallRequest {
  tenantId: string;
  projectId: string;
  repositoryId: string;
  task: string;
  executionId: string;
  branch?: string;
  commitSha?: string;
  affectedPaths?: string[];
  intent?: string;
  tokenBudget?: number;
  memoryTypes?: MemoryType[];
  topK?: number;
}

export interface RecalledMemoryItem {
  memory: AiMemory;
  relevanceScore: number;
  rankingComponents: {
    semanticSimilarity: number;
    taskRelevance: number;
    importance: number;
    confidence: number;
    freshness: number;
    repoAffinity: number;
    pathAffinity: number;
  };
  whySelected: string;
}

export interface MemoryRecallResponse {
  items: RecalledMemoryItem[];
  totalCandidatesConsidered: number;
  queryLatencyMs: number;
  degraded: boolean;
  degradationReason?: string;
}

// ── Memory Reflection Request ──────────────────────────────────────────

export interface MemoryReflectionRequest {
  executionId: string;
  tenantId: string;
  projectId: string;
  repositoryId: string;
  task: string;
  branch?: string;
  commitSha?: string;
  affectedPaths?: string[];
  plan?: string;
  actions: string[];
  result: string;
  outcome: "success" | "failure" | "partial";
  errors?: string[];
  toolsUsed?: string[];
}

// ── Memory Admission Candidate ─────────────────────────────────────────

export const MemoryCandidateSchema = z.object({
  memoryType: MemoryTypeSchema,
  title: z.string().min(1).max(256),
  canonicalContent: z.string().min(1).max(8_000),
  summary: z.string().min(1).max(512),
  tags: z.array(z.string()).max(20),
  importance: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  sourceType: SourceTypeSchema,
  sourceTrust: SourceTrustSchema,
  evidenceClass: EvidenceClassSchema,
  tenantId: z.string().min(1),
  projectId: z.string().min(1),
  repositoryId: z.string().min(1),
  executionId: z.string().optional(),
  taskId: z.string().optional(),
  affectedPaths: z.array(z.string()).optional(),
  branch: z.string().optional(),
  commitSha: z.string().optional(),
});
export type MemoryCandidate = z.infer<typeof MemoryCandidateSchema>;

// ── Ranking Configuration ──────────────────────────────────────────────

export interface MemoryRankingConfig {
  wSemanticSimilarity: number;
  wTaskRelevance: number;
  wImportance: number;
  wConfidence: number;
  wFreshness: number;
  wRepoAffinity: number;
  wPathAffinity: number;
  stalePenalty: number;
  supersededPenalty: number;
  lowTrustPenalty: number;
}

export const DEFAULT_RANKING_CONFIG: MemoryRankingConfig = {
  wSemanticSimilarity: 0.35,
  wTaskRelevance: 0.20,
  wImportance: 0.12,
  wConfidence: 0.12,
  wFreshness: 0.08,
  wRepoAffinity: 0.08,
  wPathAffinity: 0.05,
  stalePenalty: 0.3,
  supersededPenalty: 0.5,
  lowTrustPenalty: 0.15,
};

// ── Memory Write Policy ────────────────────────────────────────────────

/** Content patterns that should never be stored as durable memory. */
export const MEMORY_CONTENT_REJECTION_PATTERNS: RegExp[] = [
  /^(hi|hello|hey|thanks|thank you|you're welcome|ok|okay|sure|got it)\s*[.!?]*$/i,
  /^(I'll|I will|let me|sure|ok|alright|certainly|of course)\b/i,
  /^(good (morning|afternoon|evening))\s*[.!?]*$/i,
];

/** Maximum combined token budget for all injected memories in a prompt. */
export const MEMORY_INJECTION_MAX_TOKENS = 4_096;

/** Per-memory-type caps for context injection. */
export const MEMORY_TYPE_CAPS: Record<MemoryType, number> = {
  episodic: 3,
  semantic: 5,
  procedural: 3,
  decision: 3,
  failure: 2,
  repository: 5,
  preference: 2,
  task_outcome: 3,
};

// ── Errors ─────────────────────────────────────────────────────────────

export class MemoryError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly recoverable = true,
  ) {
    super(message);
    this.name = "MemoryError";
  }
}

export class MemoryUnavailableError extends MemoryError {
  constructor(message: string) {
    super(message, "MEMORY_UNAVAILABLE", true);
    this.name = "MemoryUnavailableError";
  }
}

export class MemoryConfigurationError extends MemoryError {
  constructor(message: string) {
    super(message, "MEMORY_CONFIGURATION_ERROR", false);
    this.name = "MemoryConfigurationError";
  }
}

export class MemoryEmbeddingError extends MemoryError {
  constructor(message: string) {
    super(message, "MEMORY_EMBEDDING_ERROR", true);
    this.name = "MemoryEmbeddingError";
  }
}

export class MemoryPersistenceError extends MemoryError {
  constructor(message: string) {
    super(message, "MEMORY_PERSISTENCE_ERROR", true);
    this.name = "MemoryPersistenceError";
  }
}

export class MemoryIndexError extends MemoryError {
  constructor(message: string) {
    super(message, "MEMORY_INDEX_ERROR", true);
    this.name = "MemoryIndexError";
  }
}

export class MemoryValidationError extends MemoryError {
  constructor(message: string) {
    super(message, "MEMORY_VALIDATION_ERROR", false);
    this.name = "MemoryValidationError";
  }
}

// ── Content Fingerprint ────────────────────────────────────────────────

/**
 * Deterministic fingerprint for deduplication. Normalizes content by
 * lowercasing, collapsing whitespace, and stripping trailing punctuation.
 */
export function computeMemoryFingerprint(content: string, memoryType: MemoryType): string {
  const normalized = content
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s]/g, "")
    .trim();
  // Simple hash prefix — the full SHA-256 is computed at the DB layer.
  return `${memoryType}:${normalized.slice(0, 256)}`;
}
