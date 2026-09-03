/**
 * Memory admission pipeline (Phase E).
 *
 * Critical gate: NOT every AI output becomes durable memory. Every candidate
 * passes through eligibility, security filtering, secret sanitization,
 * normalization, duplicate detection, importance/confidence scoring, and
 * only then persistence + embedding.
 */
import { generateId, redactSensitiveData, sha256 } from "@jules/shared";
import {
  EvidenceClass,
  MemoryCandidate,
  MemoryCandidateSchema,
  MemoryStatus,
  MemoryType,
  MemoryValidationError,
  computeMemoryFingerprint,
  MEMORY_CONTENT_REJECTION_PATTERNS,
  MemoryPersistenceError,
} from "@jules/core";
import { AiMemoryRepository, AiMemorySelect } from "@jules/db";
import { IEmbeddingProvider } from "./embedding-provider.js";
import { IQdrantSemanticStore } from "./qdrant-adapter.js";
import { logger, metrics } from "@jules/observability";

export interface AdmissionConfig {
  minImportance: number;
  minConfidence: number;
  maxLengthChars: number;
  dedupSimilarityThreshold: number;
  embeddingModel: string;
  embeddingDimensions: number;
}

export type AdmissionDecision =
  | { accepted: true; reason: string }
  | { accepted: false; reason: string };

/**
 * Deterministic eligibility: rejects greetings, generic prose, excessive
 * length, and content with no future reuse value.
 */
export function evaluateEligibility(
  content: string,
  importance: number,
  confidence: number,
  config: AdmissionConfig,
): AdmissionDecision {
  const trimmed = content.trim();
  if (trimmed.length < 20) {
    return { accepted: false, reason: "content_too_short" };
  }
  if (trimmed.length > config.maxLengthChars) {
    return { accepted: false, reason: "content_too_long" };
  }
  for (const pattern of MEMORY_CONTENT_REJECTION_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { accepted: false, reason: "low_value_pattern" };
    }
  }
  if (importance < config.minImportance) {
    return { accepted: false, reason: "below_importance_threshold" };
  }
  if (confidence < config.minConfidence) {
    return { accepted: false, reason: "below_confidence_threshold" };
  }
  return { accepted: true, reason: "eligible" };
}

/** Strip secrets from canonical content before persistence. */
export function sanitizeMemoryContent(content: string): string {
  return redactSensitiveData(content);
}

/**
 * Duplicate detection: exact fingerprint + semantic similarity.
 * Returns an existing memory when a near-duplicate exists.
 */
export async function detectDuplicate(
  repo: AiMemoryRepository,
  candidate: MemoryCandidate,
  fingerprint: string,
  embeddingProvider: IEmbeddingProvider,
  semanticStore: IQdrantSemanticStore | null,
  similarityThreshold: number,
): Promise<AiMemorySelect | null> {
  // 1. Exact fingerprint match (PostgreSQL, authoritative).
  const byFp = await repo.findByFingerprint({
    tenantId: candidate.tenantId,
    repositoryId: candidate.repositoryId,
    memoryType: candidate.memoryType,
    fingerprint,
  });
  if (byFp) return byFp;

  // 2. Semantic similarity via Qdrant (optional; skipped when unavailable).
  if (semanticStore) {
    try {
      const vector = await embeddingProvider.embed(candidate.canonicalContent);
      const hits = await semanticStore.search(
        vector.vector,
        {
          tenantId: candidate.tenantId,
          repositoryId: candidate.repositoryId,
          memoryType: candidate.memoryType,
        },
        5,
      );
      if (hits.length > 0 && hits[0]!.score >= similarityThreshold) {
        const id = hits[0]!.id;
        return repo.findById(id);
      }
    } catch {
      // Semantic dedup is best-effort; degrade to fingerprint-only.
    }
  }
  return null;
}

export interface AdmissionOutput {
  action: "created" | "merged" | "rejected";
  memory?: AiMemorySelect;
  reason: string;
}

/**
 * Runs the full admission pipeline for a candidate.
 * Returns created/merged/rejected. Never throws for low-value content —
 * rejection is a normal outcome. Throws only on infrastructure failure.
 */
export async function admitMemory(
  repo: AiMemoryRepository,
  config: AdmissionConfig,
  candidateRaw: MemoryCandidate,
  embeddingProvider: IEmbeddingProvider,
  semanticStore: IQdrantSemanticStore | null,
): Promise<AdmissionOutput> {
  // Validate at trust boundary.
  const parsed = MemoryCandidateSchema.safeParse(candidateRaw);
  if (!parsed.success) {
    throw new MemoryValidationError(`Invalid memory candidate: ${parsed.error.message}`);
  }
  const candidate = parsed.data;

  // 1. Eligibility.
  const eligibility = evaluateEligibility(
    candidate.canonicalContent,
    candidate.importance,
    candidate.confidence,
    config,
  );
  if (!eligibility.accepted) {
    metrics.incrementAdmissionRejected();
    logger.debug("Memory admission rejected", { reason: eligibility.reason });
    return { action: "rejected", reason: eligibility.reason };
  }

  // 2. Secret sanitization.
  const canonical = sanitizeMemoryContent(candidate.canonicalContent);
  const summary = sanitizeMemoryContent(candidate.summary);
  if (canonical.includes("[REDACTED]") && canonical === candidate.canonicalContent) {
    // Nothing secret present; fine.
  }

  // 3. Normalization + fingerprint.
  const fingerprint = computeMemoryFingerprint(canonical, candidate.memoryType);

  // 4. Duplicate detection.
  const existing = await detectDuplicate(
    repo,
    candidate,
    fingerprint,
    embeddingProvider,
    semanticStore,
    config.dedupSimilarityThreshold,
  );
  if (existing) {
    metrics.incrementDuplicateMerged();
    // Merge: bump confidence toward the newer candidate, refresh timestamps.
    const mergedConfidence = Math.max(existing.confidence, candidate.confidence);
    await repo.update(existing.id, { confidence: mergedConfidence, updatedAt: new Date() });
    logger.debug("Memory duplicate merged", { existingId: existing.id, reason: fingerprint });
    return { action: "merged", memory: existing, reason: "duplicate_merge" };
  }

  // 5. Persist canonical record.
  const id = generateId("mem");
  const now = new Date();
  let created: AiMemorySelect;
  try {
    created = await repo.create({
      id,
      tenantId: candidate.tenantId,
      projectId: candidate.projectId,
      repositoryId: candidate.repositoryId,
      memoryType: candidate.memoryType,
      title: candidate.title,
      canonicalContent: canonical,
      summary,
      tags: candidate.tags ?? [],
      importance: candidate.importance,
      confidence: candidate.confidence,
      sourceType: candidate.sourceType,
      sourceTrust: candidate.sourceTrust,
      evidenceClass: candidate.evidenceClass as EvidenceClass,
      sourceId: candidate.executionId ?? null,
      executionId: candidate.executionId ?? null,
      taskId: candidate.taskId ?? null,
      affectedPaths: candidate.affectedPaths ?? [],
      branch: candidate.branch ?? null,
      commitSha: candidate.commitSha ?? null,
      status: "active" as MemoryStatus,
      embeddingModel: config.embeddingModel,
      embeddingDimensions: config.embeddingDimensions,
      schemaVersion: 3,
      supersededBy: null,
      fingerprint,
      accessCount: 0,
      successfulUseCount: 0,
      negativeOutcomeCount: 0,
      lastAccessedAt: null,
      lastUsedExecutionId: null,
      lastValidatedAt: null,
      validFrom: now,
      validUntil: null,
      expiresAt: computeExpiry(candidate.memoryType),
      createdAt: now,
      updatedAt: now,
    });
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === "23505") {
      // Race: another worker created the same fingerprint concurrently. Merge.
      metrics.incrementDuplicateMerged();
      const raced = await repo.findByFingerprint({
        tenantId: candidate.tenantId,
        repositoryId: candidate.repositoryId,
        memoryType: candidate.memoryType,
        fingerprint,
      });
      if (raced) return { action: "merged", memory: raced, reason: "concurrent_duplicate" };
    }
    throw new MemoryPersistenceError(`Failed to persist memory: ${(err as Error).message}`);
  }

  metrics.incrementAdmissionAccepted();
  logger.info("Memory admitted", { id, memoryType: candidate.memoryType });

  // 6. Embedding + indexing (best-effort; never blocks admission success).
  if (semanticStore) {
    try {
      const embedding = await embeddingProvider.embed(canonical);
      const pointId = generateId("pt");
      await semanticStore.upsert([
        {
          id: pointId,
          vector: embedding.vector,
          payload: {
            memoryId: id,
            tenantId: candidate.tenantId,
            projectId: candidate.projectId,
            repositoryId: candidate.repositoryId,
            memoryType: candidate.memoryType,
            status: "active",
            branch: candidate.branch ?? null,
            commitSha: candidate.commitSha ?? null,
            title: candidate.title,
            summary,
          },
        },
      ]);
      await repo.upsertEmbedding({
        id: generateId("emb"),
        memoryId: id,
        tenantId: candidate.tenantId,
        projectId: candidate.projectId,
        repositoryId: candidate.repositoryId,
        qdrantPointId: pointId,
        embeddingModel: config.embeddingModel,
        numDimensions: config.embeddingDimensions,
        contentHash: sha256(canonical),
        status: "indexed",
        indexedAt: new Date(),
      });
    } catch (err: unknown) {
      // Indexing failure must not lose the durable memory; queue for retry.
      logger.warn("Memory indexing failed (will retry)", { id, error: (err as Error).message });
      await repo
        .upsertEmbedding({
          id: generateId("emb"),
          memoryId: id,
          tenantId: candidate.tenantId,
          projectId: candidate.projectId,
          repositoryId: candidate.repositoryId,
          qdrantPointId: undefined,
          embeddingModel: config.embeddingModel,
          numDimensions: config.embeddingDimensions,
          contentHash: sha256(canonical),
          status: "pending",
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .catch(() => undefined);
    }
  }

  return { action: "created", memory: created, reason: "created" };
}

/** Per-type expiry. Stable semantics persist; transient state expires. */
function computeExpiry(memoryType: MemoryType): Date | null {
  const now = Date.now();
  switch (memoryType) {
    case "episodic":
      return new Date(now + 30 * 86_400_000);
    case "task_outcome":
      return new Date(now + 90 * 86_400_000);
    case "preference":
      return new Date(now + 365 * 86_400_000);
    default:
      // semantic, procedural, decision, failure, repository — long-lived.
      return null;
  }
}
