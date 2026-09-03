/**
 * Semantic Memory Facade (Phase B2-cert wiring).
 *
 * Bridges the AI Memory Engine (packages/ai) into the worker. Constructed only
 * when AI_MEMORY_ENABLED; otherwise a null-safe no-op. Every operation degrades
 * gracefully:
 *   - recall() returns [] when embeddings/Qdrant are unavailable (never invents).
 *   - reflectAndAdmit() and consolidate() are fire-and-forget best-effort.
 *
 * This is the ONLY place in apps/ that instantiates the semantic engine, so the
 * learn -> persist -> embed -> recall -> inject -> influence lifecycle becomes
 * reachable from production instead of dead code.
 */
import {
  AdmissionConfig,
  admitMemory,
  consolidate,
  ConsolidationConfig,
  createEmbeddingProvider,
  MemoryRecallEngine,
  QdrantSemanticStore,
  RecallConfig,
  RecalledMemoryDto,
  reflect,
} from "@jules/ai";
import { AppConfig } from "@jules/config";
import { AiMemoryRepository } from "@jules/db";
import {
  MemoryCandidate,
  MemoryRecallRequest,
  MemoryReflectionRequest,
} from "@jules/core";
import { logger } from "@jules/observability";

/** Map a recall result into the context-builder DTO shape (sanitized, advisory). */
function toRecallDtos(
  result: Awaited<ReturnType<MemoryRecallEngine["recall"]>>,
): RecalledMemoryDto[] {
  return result.items.map((item) => ({
    memoryId: item.memory.id,
    memoryType: item.memory.memoryType,
    title: item.memory.title,
    content: item.memory.canonicalContent,
    confidence: item.memory.confidence,
    sourceTrust: item.memory.sourceTrust,
    relevanceScore: item.relevanceScore,
    whySelected: item.whySelected,
  }));
}

export class SemanticMemoryService {
  private readonly repo: AiMemoryRepository;
  private readonly embeddingProvider: ReturnType<typeof createEmbeddingProvider>;
  private readonly semanticStore: QdrantSemanticStore | null;
  private readonly recallEngine: MemoryRecallEngine | null;
  private readonly admissionConfig: AdmissionConfig;
  private readonly consolidationConfig: ConsolidationConfig;
  private readonly recallConfig: RecallConfig;
  private readonly tenantId: string;
  private readonly projectId: string;

  constructor(repo: AiMemoryRepository, config: AppConfig) {
    this.repo = repo;
    this.tenantId = "default";
    this.projectId = "default";

    this.embeddingProvider = createEmbeddingProvider({
      baseUrl: config.EMBEDDING_BASE_URL,
      apiKey: config.EMBEDDING_API_KEY,
      model: config.EMBEDDING_MODEL,
      dimensions: config.EMBEDDING_DIMENSIONS,
      batchSize: config.EMBEDDING_BATCH_SIZE,
      timeoutMs: config.EMBEDDING_TIMEOUT_MS,
    });

    // Qdrant store — null when disabled/unreachable config; recall degrades.
    this.semanticStore = config.AI_MEMORY_ENABLED
      ? new QdrantSemanticStore({
          url: config.QDRANT_URL,
          apiKey: config.QDRANT_API_KEY,
          collection: config.QDRANT_COLLECTION,
          vectorSize: config.EMBEDDING_DIMENSIONS,
          timeoutMs: config.QDRANT_TIMEOUT_MS,
          maxRetries: config.QDRANT_MAX_RETRIES,
          allowInsecureLocal: true,
          embeddingModel: config.EMBEDDING_MODEL,
        })
      : null;

    this.recallConfig = {
      topK: config.MEMORY_RECALL_TOP_K,
      similarityThreshold: config.MEMORY_RECALL_SIMILARITY_THRESHOLD,
      candidateMultiplier: config.MEMORY_RECALL_CANDIDATE_MULTIPLIER,
      tokenBudget: config.MEMORY_RECALL_TOKEN_BUDGET,
    };

    this.admissionConfig = {
      minImportance: config.MEMORY_ADMISSION_MIN_IMPORTANCE,
      minConfidence: config.MEMORY_ADMISSION_MIN_CONFIDENCE,
      maxLengthChars: config.MEMORY_ADMISSION_MAX_LENGTH_CHARS,
      dedupSimilarityThreshold: config.MEMORY_ADMISSION_DEDUP_SIMILARITY,
      embeddingModel: config.EMBEDDING_MODEL,
      embeddingDimensions: config.EMBEDDING_DIMENSIONS,
    };

    this.consolidationConfig = {
      staleDays: config.MEMORY_STALE_DAYS,
      batchSize: 50,
      promoteRepeatThreshold: 3,
      archiveLowValueAfterDays: config.MEMORY_EXPIRY_DAYS_PROCEDURAL,
      embeddingModel: config.EMBEDDING_MODEL,
    };

    this.recallEngine = config.AI_MEMORY_RECALL_ENABLED
      ? new MemoryRecallEngine(this.repo, this.embeddingProvider, this.semanticStore, this.recallConfig)
      : null;
  }

  get enabled(): boolean {
    return this.recallEngine !== null;
  }

  /** Ensure the Qdrant collection exists (best-effort, logged). */
  public async ensureIndex(): Promise<void> {
    if (!this.semanticStore) return;
    try {
      await this.semanticStore.ensureCollection();
    } catch (e) {
      logger.warn("Semantic memory: failed to ensure Qdrant collection", {
        error: (e as Error).message,
      });
    }
  }

  /**
   * Recall semantic memories for a task. Returns advisory DTOs ready for the
   * context builder. Never throws — degrades to [] on any failure.
   */
  public async recall(
    request: Omit<MemoryRecallRequest, "tenantId" | "projectId">,
  ): Promise<RecalledMemoryDto[]> {
    if (!this.recallEngine) return [];
    try {
      const result = await this.recallEngine.recall({
        ...request,
        tenantId: this.tenantId,
        projectId: this.projectId,
      });
      if (result.degraded) {
        logger.debug("Semantic memory recall degraded", {
          reason: result.degradationReason,
        });
      }
      return toRecallDtos(result);
    } catch (e) {
      logger.warn("Semantic memory recall failed; degrading to empty", {
        error: (e as Error).message,
      });
      return [];
    }
  }

  /**
   * Reflect over an execution and admit durable lessons (best-effort, post-AI).
   */
  public async reflectAndAdmit(
    req: Omit<MemoryReflectionRequest, "tenantId" | "projectId">,
  ): Promise<void> {
    if (!this.recallEngine) return;
    try {
      const candidates = reflect({ ...req, tenantId: this.tenantId, projectId: this.projectId });
      for (const candidate of candidates) {
        const out = await admitMemory(
          this.repo,
          this.admissionConfig,
          candidate as MemoryCandidate,
          this.embeddingProvider,
          this.semanticStore,
        );
        logger.debug("Semantic memory admission", {
          action: out.action,
          reason: out.reason,
          memoryId: out.memory?.id,
        });
      }
    } catch (e) {
      logger.warn("Semantic memory reflection/admission failed", {
        error: (e as Error).message,
      });
    }
  }

  /** Run a consolidation pass (expire/stale/reindex/promote/archive). */
  public async consolidateNow(): Promise<void> {
    if (!this.recallEngine) return;
    try {
      await consolidate(this.repo, this.embeddingProvider, this.semanticStore, this.consolidationConfig);
    } catch (e) {
      logger.warn("Semantic memory consolidation failed", {
        error: (e as Error).message,
      });
    }
  }
}
