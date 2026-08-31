import {
  classifyPrecedent,
  MEMORY_RETRIEVAL_BOUNDS,
  selectPrecedentsWithinBounds,
} from "@jules/core";
import type { HistoricalPrecedentDto, RepositoryKnowledgeDto } from "@jules/ai";
import type { DecisionRepository, RepositoryKnowledgeRepository } from "@jules/db";
import { logger, metrics } from "@jules/observability";
import { redactSensitiveData } from "@jules/shared";

/** Configuration for one memory-retrieval run (already clamped by env). */
export interface MemoryRetrievalConfig {
  maxSuccess: number;
  maxHumanReviewed: number;
  maxFailures: number;
  maxKnowledgeItems: number;
}

/** Advisory memory context attached to a decision prompt. */
export interface MemoryContext {
  historicalPrecedents: HistoricalPrecedentDto[];
  repositoryKnowledge: RepositoryKnowledgeDto[];
  /** Decision IDs actually used (for provenance persistence). */
  precedentDecisionIds: string[];
  /** Knowledge IDs actually used (for provenance persistence). */
  repositoryKnowledgeIds: string[];
}

interface PrecedentLikeRow {
  id: string;
  action: string;
  outcome: string | null;
  humanAction: string | null;
  humanReviewedAt: Date | null;
  outcomeObservedAt: Date | null;
  finalApprovedResponse: string | null;
  proposedResponse: string | null;
}

interface KnowledgeLikeRow {
  id: string;
  knowledgeType: string;
  trustLevel: string;
  content: string;
}

/**
 * P1: retrieves advisory cross-session memory (decision precedents and
 * repository knowledge) scoped to a single repository. All content is
 * redacted before leaving this service; failures degrade to empty memory
 * (never invented, never fatal) and are counted in
 * jules_memory_retrieval_failures_total.
 */
export class MemoryContextService {
  constructor(
    private readonly decisionRepo: Pick<DecisionRepository, "findPrecedents">,
    private readonly knowledgeRepo: Pick<RepositoryKnowledgeRepository, "listActive">,
    private readonly config: MemoryRetrievalConfig,
  ) {}

  /**
   * Retrieves precedents + knowledge for a repository. `excludeSessionId`
   * guarantees no self-referencing noise from the current session.
   */
  public async retrieve(repositoryId: string, excludeSessionId: string): Promise<MemoryContext> {
    const [precedents, knowledge] = await Promise.all([
      this.safeGetPrecedents(repositoryId, excludeSessionId),
      this.safeGetKnowledge(repositoryId),
    ]);

    return {
      historicalPrecedents: precedents.dtos,
      repositoryKnowledge: knowledge.dtos,
      precedentDecisionIds: precedents.ids,
      repositoryKnowledgeIds: knowledge.ids,
    };
  }

  private async safeGetPrecedents(
    repositoryId: string,
    excludeSessionId: string,
  ): Promise<{ dtos: HistoricalPrecedentDto[]; ids: string[] }> {
    try {
      metrics.incrementPrecedentQuery();
      const rows = (await this.decisionRepo.findPrecedents({
        repositoryId,
        excludeSessionId,
        limit: 100,
      })) as unknown as PrecedentLikeRow[];

      const classified = rows.map((row) => {
        const precedentClass = classifyPrecedent({
          outcome: row.outcome ?? null,
          humanAction: row.humanAction ?? null,
        });
        return { row, precedentClass };
      });

      const selected = selectPrecedentsWithinBounds({
        rows: classified.map(({ row, precedentClass }) => ({
          precedentClass,
          observedAt: row.outcomeObservedAt,
          id: row.id,
        })),
        maxSuccess: this.config.maxSuccess,
        maxHumanReviewed: this.config.maxHumanReviewed,
        maxFailures: this.config.maxFailures,
      });

      const selectedIds = new Set(selected.map((s) => s.id));
      const byId = new Map(
        classified.map(({ row, precedentClass }) => [row.id, { row, precedentClass }]),
      );

      const dtos: HistoricalPrecedentDto[] = [];
      for (const sel of selected) {
        const found = byId.get(sel.id);
        if (!found) continue;
        const rawExcerpt = found.row.finalApprovedResponse ?? found.row.proposedResponse ?? "";
        const excerpt = redactSensitiveData(rawExcerpt).slice(
          0,
          MEMORY_RETRIEVAL_BOUNDS.PRECEDENT_EXCERPT_MAX_CHARS,
        );
        dtos.push({
          decisionId: found.row.id,
          action: found.row.action,
          outcomeClass: found.precedentClass,
          observedAt: found.row.outcomeObservedAt?.toISOString() ?? null,
          excerpt,
          humanReviewed: found.row.humanReviewedAt !== null,
        });
      }

      metrics.recordPrecedentsReturned(dtos.length);
      return { dtos, ids: [...selectedIds] };
    } catch (err: unknown) {
      metrics.incrementMemoryRetrievalFailure();
      logger.warn("Precedent retrieval failed; degrading to empty memory", {
        repositoryId,
        error: (err as Error).message,
      });
      return { dtos: [], ids: [] };
    }
  }

  private async safeGetKnowledge(
    repositoryId: string,
  ): Promise<{ dtos: RepositoryKnowledgeDto[]; ids: string[] }> {
    try {
      metrics.incrementKnowledgeQuery();
      const rows = (await this.knowledgeRepo.listActive({
        repositoryId,
        limit: 100,
      })) as unknown as KnowledgeLikeRow[];

      const dtos: RepositoryKnowledgeDto[] = [];
      const ids: string[] = [];
      for (const row of rows.slice(0, this.config.maxKnowledgeItems)) {
        dtos.push({
          knowledgeId: row.id,
          knowledgeType: row.knowledgeType,
          trustLevel: row.trustLevel,
          content: redactSensitiveData(row.content),
        });
        ids.push(row.id);
      }

      metrics.recordKnowledgeItemsReturned(dtos.length);
      return { dtos, ids };
    } catch (err: unknown) {
      metrics.incrementMemoryRetrievalFailure();
      logger.warn("Repository knowledge retrieval failed; degrading to empty memory", {
        repositoryId,
        error: (err as Error).message,
      });
      return { dtos: [], ids: [] };
    }
  }
}
