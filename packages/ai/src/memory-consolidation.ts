/**
 * Background memory consolidation (Phase I).
 *
 * Runs on an interval (not inline in the hot path). Responsibilities:
 *   - expire overdue episodic/task_outcome memories
 *   - find potentially-stale repository memories needing validation
 *   - re-embed any pending embeddings (retry queue)
 *   - promote repeated lessons: a memory with high access+success and
 *     repeated reuse gets importance bump
 *   - archive redundant low-value memories past their window
 *
 * All operations are incremental and idempotent; safe to run again.
 */
import { AiMemoryRepository } from "@jules/db";
import { MemoryStatus } from "@jules/core";
import { IEmbeddingProvider } from "@jules/ai";
import { IQdrantSemanticStore } from "@jules/ai";
import { logger, metrics } from "@jules/observability";

export interface ConsolidationConfig {
  staleDays: number;
  batchSize: number;
  promoteRepeatThreshold: number;
  archiveLowValueAfterDays: number;
  embeddingModel: string;
}

export interface ConsolidationReport {
  expired: number;
  markedStale: number;
  reindexed: number;
  promoted: number;
  archived: number;
}

/**
 * Mark expirable memory types (episodic/task_outcome) past their window as
 * expired so recall filters them out.
 */
export async function expireMemories(
  repo: AiMemoryRepository,
  config: ConsolidationConfig,
): Promise<number> {
  const count = await repo.expireOverdue();
  if (count > 0) metrics.recordStaleMemory(count);
  return count;
}

/**
 * Find repository memories that look stale (long without revalidation) and
 * mark them stale so the operator / next recall re-validates them.
 */
export async function markStaleMemories(
  repo: AiMemoryRepository,
  config: ConsolidationConfig,
): Promise<number> {
  const stale = await repo.findPotentiallyStale("*", config.staleDays, config.batchSize ?? 100);
  let count = 0;
  for (const memory of stale) {
    if (memory.status !== "active") continue;
    await repo.update(memory.id, { status: "stale" as MemoryStatus, updatedAt: new Date() });
    count++;
  }
  if (count > 0) metrics.recordStaleMemory(count);
  return count;
}

/**
 * Retry indexing of memories whose embeddings are still `pending`.
 * Best-effort; failures leave the row pending for the next cycle.
 */
export async function reindexPendingEmbeddings(
  repo: AiMemoryRepository,
  embeddingProvider: IEmbeddingProvider,
  semanticStore: IQdrantSemanticStore | null,
  config: ConsolidationConfig,
): Promise<number> {
  if (!semanticStore) return 0;
  const pending = await repo.listPendingEmbeddings(config.batchSize ?? 100);
  let reindexed = 0;
  for (const emb of pending) {
    try {
      const memory = await repo.findById(emb.memoryId);
      if (!memory) continue;
      const embedding = await embeddingProvider.embed(memory.canonicalContent);
      const pointId = `pt_${emb.memoryId}`;
      await semanticStore.upsert([
        {
          id: pointId,
          vector: embedding.vector,
          payload: {
            memoryId: memory.id,
            tenantId: memory.tenantId,
            projectId: memory.projectId,
            repositoryId: memory.repositoryId,
            memoryType: memory.memoryType,
            status: "active",
            branch: memory.branch ?? null,
            commitSha: memory.commitSha ?? null,
            title: memory.title,
            summary: memory.summary,
          },
        },
      ]);
      await repo.markEmbeddingIndexed(emb.id, pointId);
      reindexed++;
    } catch {
      // Leave pending; retried next cycle.
    }
  }
  return reindexed;
}

/**
 * Promote repeated, successfully-used lessons into higher-confidence durable
 * memories. Only applies to memories that have been validated through reuse.
 */
export async function promoteRepeatedLessons(
  repo: AiMemoryRepository,
  config: ConsolidationConfig,
): Promise<number> {
  const promoted = await repo.listActiveForRepository("*", {
    limit: config.batchSize ?? 200,
  });
  let count = 0;
  for (const memory of promoted) {
    if (memory.successfulUseCount / Math.max(1, memory.accessCount) >= 0.5 &&
        memory.successfulUseCount >= config.promoteRepeatThreshold) {
      // Already promoted enough.
      if (memory.importance >= 0.85) continue;
      await repo.update(memory.id, {
        importance: Math.min(1, memory.importance * 1.1),
        confidence: Math.min(1, memory.confidence * 1.05),
        updatedAt: new Date(),
      });
      metrics.recordConsolidated(1);
      count++;
    }
  }
  return count;
}

/**
 * Archive redundant low-value memories that have aged past the window.
 * Kept in `archived` status (soft delete) so audit history is preserved.
 */
export async function archiveLowValue(
  repo: AiMemoryRepository,
  config: ConsolidationConfig,
): Promise<number> {
  const candidates = await repo.list({ tenantId: "*", repositoryId: "*", limit: config.batchSize ?? 200 });
  const cutoff = Date.now() - config.archiveLowValueAfterDays * 86_400_000;
  let count = 0;
  for (const memory of candidates) {
    if (memory.importance < 0.3 && memory.accessCount < 3 &&
        memory.createdAt.getTime() < cutoff && memory.status === "active") {
      await repo.archive(memory.id);
      count++;
    }
  }
  return count;
}

/**
 * Run a full consolidation pass. Idempotent, bounded, fed to telemetry.
 */
export async function consolidate(
  repo: AiMemoryRepository,
  embeddingProvider: IEmbeddingProvider,
  semanticStore: IQdrantSemanticStore | null,
  config: ConsolidationConfig,
): Promise<ConsolidationReport> {
  const report: ConsolidationReport = {
    expired: await expireMemories(repo, config),
    markedStale: await markStaleMemories(repo, config),
    reindexed: await reindexPendingEmbeddings(repo, embeddingProvider, semanticStore, config),
    promoted: await promoteRepeatedLessons(repo, config),
    archived: await archiveLowValue(repo, config),
  };
  logger.info("Memory consolidation pass complete", { ...report });
  return report;
}
