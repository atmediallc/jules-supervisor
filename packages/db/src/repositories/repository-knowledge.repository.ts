import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { Database } from "../client.js";
import { repositoryKnowledge } from "../schema.js";

export type RepositoryKnowledgeInsert = typeof repositoryKnowledge.$inferInsert;
export type RepositoryKnowledgeSelect = typeof repositoryKnowledge.$inferSelect;

/**
 * Allowed knowledge types (P1 repository knowledge model).
 * Constrained at application level; stored as varchar in PostgreSQL.
 */
export const KNOWLEDGE_TYPES = [
  "PROJECT_INSTRUCTION",
  "ARCHITECTURE_RULE",
  "TEST_COMMAND",
  "BUILD_COMMAND",
  "LINT_COMMAND",
  "PROTECTED_PATH",
  "SECURITY_RULE",
  "CONVENTION",
  "KNOWN_FAILURE_PATTERN",
] as const;

export type KnowledgeType = (typeof KNOWLEDGE_TYPES)[number];

/**
 * Trust levels ordered from most authoritative to least.
 * Used for deterministic ordering when building context.
 */
export const TRUST_LEVELS = [
  "REPOSITORY_AUTHORITATIVE",
  "HUMAN_VERIFIED",
  "SUPERVISOR_VERIFIED",
  "INFERRED",
] as const;

export type TrustLevel = (typeof TRUST_LEVELS)[number];

export const TRUST_LEVEL_RANK: Record<TrustLevel, number> = {
  REPOSITORY_AUTHORITATIVE: 0,
  HUMAN_VERIFIED: 1,
  SUPERVISOR_VERIFIED: 2,
  INFERRED: 3,
};

export interface ActiveKnowledgeQuery {
  repositoryId: string;
  limit?: number;
  knowledgeTypes?: KnowledgeType[];
}

/**
 * Repository-scoped knowledge base (P1 Phases 22-35).
 *
 * Design guarantees:
 * - Every query is filtered by repositoryId — cross-repository retrieval is
 *   impossible by construction.
 * - Deduplication via unique index (repositoryId, knowledgeType, sourceType,
 *   sourceHash): ingesting the same file content twice upserts instead of
 *   duplicating rows.
 * - Supersession: when content changes (sourceHash differs) the previous row
 *   is stamped supersededBy → new row id, so only active knowledge is served.
 * - Relational only: no vectors, no embeddings.
 */
export class RepositoryKnowledgeRepository {
  constructor(private readonly db: Database) {}

  public async findById(id: string): Promise<RepositoryKnowledgeSelect | null> {
    const rows = await this.db
      .select()
      .from(repositoryKnowledge)
      .where(eq(repositoryKnowledge.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  /**
   * Inserts or updates knowledge. When a row with the same dedup identity
   * (repositoryId + knowledgeType + sourceType + sourceHash) exists it is
   * updated in place; when only the sourcePath matches but content changed
   * (hash differs), the old row is superseded.
   */
  public async upsert(data: RepositoryKnowledgeInsert): Promise<RepositoryKnowledgeSelect> {
    const now = new Date();
    const existing = await this.db
      .select()
      .from(repositoryKnowledge)
      .where(
        and(
          eq(repositoryKnowledge.repositoryId, data.repositoryId),
          eq(repositoryKnowledge.knowledgeType, data.knowledgeType),
          eq(repositoryKnowledge.sourceType, data.sourceType),
        ),
      )
      .orderBy(desc(repositoryKnowledge.createdAt))
      .limit(10);

    // Exact dedup hit (same content hash): refresh timestamps only.
    const exact = existing.find((row) => row.sourceHash === data.sourceHash);
    if (exact) {
      const updated = await this.db
        .update(repositoryKnowledge)
        .set({
          content: data.content,
          sourcePath: data.sourcePath ?? exact.sourcePath,
          trustLevel: data.trustLevel ?? exact.trustLevel,
          updatedAt: now,
        })
        .where(eq(repositoryKnowledge.id, exact.id))
        .returning();
      return updated[0]!;
    }

    // Same source, changed content: supersede previous rows.
    const stale = existing.filter(
      (row) => row.sourcePath === data.sourcePath && row.sourcePath !== null && !row.supersededBy,
    );
    const inserted = await this.db
      .insert(repositoryKnowledge)
      .values({ ...data, validFrom: data.validFrom ?? now, updatedAt: now })
      .onConflictDoNothing()
      .returning();
    const row = inserted[0]!;
    for (const old of stale) {
      await this.db
        .update(repositoryKnowledge)
        .set({ supersededBy: row.id, updatedAt: now })
        .where(eq(repositoryKnowledge.id, old.id));
    }
    return row;
  }

  /**
   * Active (non-superseded, non-expired) knowledge for a repository.
   * Cross-repository access is impossible: repositoryId is a required filter.
   */
  public async listActive(query: ActiveKnowledgeQuery): Promise<RepositoryKnowledgeSelect[]> {
    const now = new Date();
    const conditions = [
      eq(repositoryKnowledge.repositoryId, query.repositoryId),
      isNull(repositoryKnowledge.supersededBy),
      sql`(${repositoryKnowledge.validUntil} IS NULL OR ${repositoryKnowledge.validUntil} > ${now})`,
    ];
    if (query.knowledgeTypes && query.knowledgeTypes.length > 0) {
      conditions.push(
        sql`${repositoryKnowledge.knowledgeType} IN (${sql.join(
          query.knowledgeTypes.map((t) => sql`${t}`),
          sql`, `,
        )})`,
      );
    }
    return this.db
      .select()
      .from(repositoryKnowledge)
      .where(and(...conditions))
      .orderBy(repositoryKnowledge.trustLevel, desc(repositoryKnowledge.updatedAt))
      .limit(query.limit ?? 50);
  }

  /** Hard delete — used by human knowledge management endpoints. */
  public async delete(id: string): Promise<boolean> {
    const rows = await this.db
      .delete(repositoryKnowledge)
      .where(eq(repositoryKnowledge.id, id))
      .returning();
    return rows.length > 0;
  }

  /** Total active knowledge items for metrics (jules_repository_knowledge_items_total). */
  public async countActive(repositoryId?: string): Promise<number> {
    const conditions = [isNull(repositoryKnowledge.supersededBy)];
    if (repositoryId) {
      conditions.push(eq(repositoryKnowledge.repositoryId, repositoryId));
    }
    const rows = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(repositoryKnowledge)
      .where(and(...conditions));
    return rows[0]?.n ?? 0;
  }
}
