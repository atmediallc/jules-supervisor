import {
  ActiveKnowledgeQuery,
  DecisionSelect,
  KNOWLEDGE_TYPES,
  KnowledgeType,
  RepositoryKnowledgeInsert,
  RepositoryKnowledgeSelect,
  RepositoryKnowledgeRepository,
  TRUST_LEVEL_RANK,
  TrustLevel,
  TRUST_LEVELS,
} from "@jules/db";

const RECENT_DEDUP_SCAN = 10;

/**
 * In-memory mirror of the P1 relational memory repositories:
 * - decision findPrecedents (repository-isolated, deterministic ordering)
 * - repository knowledge (dedup, supersession, active-only queries)
 *
 * Semantics mirror the SQL implementations in @jules/db so unit tests
 * exercise the same filtering/bounds/ordering rules.
 */
export class InMemoryMemoryStore {
  public decisions: DecisionSelect[] = [];
  public repositoryBySession = new Map<string, string>();
  public knowledge = new Map<string, RepositoryKnowledgeSelect>();

  public clear(): void {
    this.decisions = [];
    this.repositoryBySession.clear();
    this.knowledge.clear();
  }

  // ---- Cross-session decision precedents (P1) ----

  /**
   * Mirror of DecisionRepository.findPrecedents: repository-isolated via
   * session→repository mapping, outcome NOT NULL, optional exclusion of the
   * current session, optional action/human-review filters, clamped limit,
   * deterministic ordering (outcomeObservedAt desc, createdAt desc, id).
   */
  public async findDecisionPrecedents(params: {
    repositoryId: string;
    excludeSessionId?: string;
    action?: string;
    limit?: number;
    requireHumanReview?: boolean;
    requireNonHumanReview?: boolean;
  }): Promise<DecisionSelect[]> {
    const limit = Math.min(Math.max(params.limit ?? 20, 1), 100);
    const repoOf = (sessionId: string): string | undefined =>
      this.repositoryBySession.get(sessionId);
    const repo = params.repositoryId;

    const filtered = this.decisions.filter((d) => {
      if (repoOf(d.sessionId) !== repo) return false;
      if (d.outcome === null || d.outcome === undefined) return false;
      if (params.excludeSessionId && d.sessionId === params.excludeSessionId) return false;
      if (params.action && d.action !== params.action) return false;
      if (params.requireHumanReview && d.humanReviewedAt === null) return false;
      if (params.requireNonHumanReview && d.humanReviewedAt !== null) return false;
      return true;
    });

    return filtered
      .sort((a, b) => {
        const at = a.outcomeObservedAt?.getTime() ?? 0;
        const bt = b.outcomeObservedAt?.getTime() ?? 0;
        if (bt !== at) return bt - at;
        const ac = a.createdAt.getTime();
        const bc = b.createdAt.getTime();
        if (bc !== ac) return bc - ac;
        return b.id.localeCompare(a.id);
      })
      .slice(0, limit);
  }

  // ---- Repository knowledge (P1) ----

  /** Mirror of RepositoryKnowledgeRepository.upsert semantics. */
  public async upsertKnowledge(
    data: RepositoryKnowledgeInsert,
  ): Promise<RepositoryKnowledgeSelect> {
    const now = new Date();
    const trustLevel = (data.trustLevel ?? "INFERRED") as TrustLevel;
    const row: RepositoryKnowledgeSelect = {
      id: data.id,
      repositoryId: data.repositoryId,
      knowledgeType: data.knowledgeType,
      content: data.content,
      sourceType: data.sourceType,
      sourcePath: data.sourcePath ?? null,
      sourceHash: data.sourceHash ?? null,
      trustLevel,
      validFrom: data.validFrom ?? now,
      validUntil: data.validUntil ?? null,
      supersededBy: data.supersededBy ?? null,
      createdAt: now,
      updatedAt: now,
    };

    const recentSameScope = Array.from(this.knowledge.values())
      .filter(
        (k) =>
          k.repositoryId === row.repositoryId &&
          k.knowledgeType === row.knowledgeType &&
          k.sourceType === row.sourceType,
      )
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .slice(0, RECENT_DEDUP_SCAN);

    const exact = recentSameScope.find(
      (k) => k.sourceHash !== null && k.sourceHash === row.sourceHash,
    );
    if (exact) {
      // Exact content dedup: update in place, no supersession.
      exact.updatedAt = now;
      this.knowledge.set(exact.id, exact);
      return exact;
    }

    // Insert new knowledge; supersede stale rows with the same non-null path.
    this.knowledge.set(row.id, row);
    for (const k of this.knowledge.values()) {
      if (
        k.id !== row.id &&
        k.repositoryId === row.repositoryId &&
        k.knowledgeType === row.knowledgeType &&
        k.sourcePath !== null &&
        row.sourcePath !== null &&
        k.sourcePath === row.sourcePath &&
        k.supersededBy === null
      ) {
        k.supersededBy = row.id;
        this.knowledge.set(k.id, k);
      }
    }
    return row;
  }

  /** Mirror of RepositoryKnowledgeRepository.listActive semantics. */
  public async listActiveKnowledge(
    query: ActiveKnowledgeQuery,
  ): Promise<RepositoryKnowledgeSelect[]> {
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 100);
    const now = Date.now();
    const rows = Array.from(this.knowledge.values())
      .filter(
        (k) =>
          k.repositoryId === query.repositoryId &&
          k.supersededBy === null &&
          (k.validUntil === null || k.validUntil.getTime() > now) &&
          (query.knowledgeTypes === undefined ||
            query.knowledgeTypes.length === 0 ||
            (query.knowledgeTypes as string[]).includes(k.knowledgeType)),
      )
      .sort((a, b) => {
        const ra = TRUST_LEVEL_RANK[a.trustLevel as TrustLevel] ?? 99;
        const rb = TRUST_LEVEL_RANK[b.trustLevel as TrustLevel] ?? 99;
        if (ra !== rb) return ra - rb;
        return b.updatedAt.getTime() - a.updatedAt.getTime();
      })
      .slice(0, limit);
    return rows;
  }

  public async findKnowledgeById(id: string): Promise<RepositoryKnowledgeSelect | null> {
    return this.knowledge.get(id) ?? null;
  }

  /** Mirror of RepositoryKnowledgeRepository.countActive semantics. */
  public async countActiveKnowledge(repositoryId?: string): Promise<number> {
    const now = Date.now();
    return Array.from(this.knowledge.values()).filter(
      (k) =>
        (repositoryId === undefined || k.repositoryId === repositoryId) &&
        k.supersededBy === null &&
        (k.validUntil === null || k.validUntil.getTime() > now),
    ).length;
  }

  public async deleteKnowledge(id: string): Promise<boolean> {
    return this.knowledge.delete(id);
  }
}

/** Converts the memory store into repository-shaped mocks. */
export function createMockMemoryRepositories(store: InMemoryMemoryStore): {
  decisionRepo: Pick<DecisionRepositoryLike, "findPrecedents">;
  knowledgeRepo: RepositoryKnowledgeRepositoryLike;
} {
  return {
    decisionRepo: {
      findPrecedents: async (params: PrecedentQuery) => store.findDecisionPrecedents(params),
    },
    knowledgeRepo: {
      findById: async (id: string) => store.findKnowledgeById(id),
      upsert: async (data: RepositoryKnowledgeInsert) => store.upsertKnowledge(data),
      listActive: async (query: ActiveKnowledgeQuery) => store.listActiveKnowledge(query),
      delete: async (id: string) => store.deleteKnowledge(id),
      countActive: async (repositoryId?: string) => store.countActiveKnowledge(repositoryId),
    },
  };
}

// Structural types so tests can pass the mocks wherever the concrete
// repositories are expected without importing runtime class values.
interface PrecedentQuery {
  repositoryId: string;
  excludeSessionId?: string;
  action?: string;
  limit?: number;
  requireHumanReview?: boolean;
  requireNonHumanReview?: boolean;
}

interface DecisionRepositoryLike {
  findPrecedents(params: PrecedentQuery): Promise<DecisionSelect[]>;
}

interface RepositoryKnowledgeRepositoryLike {
  findById(id: string): Promise<RepositoryKnowledgeSelect | null>;
  upsert(data: RepositoryKnowledgeInsert): Promise<RepositoryKnowledgeSelect>;
  listActive(query: ActiveKnowledgeQuery): Promise<RepositoryKnowledgeSelect[]>;
  delete(id: string): Promise<boolean>;
  countActive(repositoryId?: string): Promise<number>;
}

// Re-exports for test convenience.
export {
  KNOWLEDGE_TYPES,
  TRUST_LEVELS,
  type KnowledgeType,
  type TrustLevel,
  type ActiveKnowledgeQuery,
  type RepositoryKnowledgeInsert,
  type RepositoryKnowledgeSelect,
};
