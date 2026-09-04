import { and, desc, eq, lte, sql } from "drizzle-orm";
import { Database } from "../client.js";
import {
  aiMemories,
  aiMemoryEmbeddings,
  aiMemoryInfluences,
  aiMemoryRelations,
} from "../schema.js";
import { MemoryStatus, MemoryType } from "@jules/core";

export type AiMemoryInsert = typeof aiMemories.$inferInsert;
export type AiMemorySelect = typeof aiMemories.$inferSelect;
export type AiMemoryEmbeddingInsert = typeof aiMemoryEmbeddings.$inferInsert;
export type AiMemoryInfluenceInsert = typeof aiMemoryInfluences.$inferInsert;
export type AiMemoryRelationInsert = typeof aiMemoryRelations.$inferInsert;
export type AiMemoryInfluenceSelect = typeof aiMemoryInfluences.$inferSelect;
export type AiMemoryRelationSelect = typeof aiMemoryRelations.$inferSelect;

export interface MemoryListQuery {
  tenantId: string;
  projectId?: string;
  repositoryId?: string;
  memoryType?: MemoryType;
  status?: MemoryStatus;
  limit?: number;
  offset?: number;
}

export interface MemorySearchByFingerprintParams {
  tenantId: string;
  repositoryId: string;
  memoryType: MemoryType;
  fingerprint: string;
}

/**
 * Durable system-of-record for AI memory metadata (Phase B).
 *
 * PostgreSQL is canonical: identity, lifecycle state, provenance, supersession,
 * validation, usage, and audit. Qdrant holds vectors only. These are the
 * relational operations that support the memory engine.
 */
export class AiMemoryRepository {
  constructor(private readonly db: Database) {}

  public async findById(id: string): Promise<AiMemorySelect | null> {
    const rows = await this.db.select().from(aiMemories).where(eq(aiMemories.id, id)).limit(1);
    return rows[0] ?? null;
  }

  public async create(data: AiMemoryInsert): Promise<AiMemorySelect> {
    try {
      const rows = await this.db.insert(aiMemories).values(data).returning();
      return rows[0]!;
    } catch (err: unknown) {
      // Unique conflicts (fingerprint) → caller should treat as duplicate.
      const code = (err as { code?: string }).code;
      if (code === "23505") {
        const existing = await this.findByFingerprint({
          tenantId: data.tenantId ?? "default",
          repositoryId: data.repositoryId,
          memoryType: data.memoryType as MemoryType,
          fingerprint: data.fingerprint ?? "",
        });
        if (existing) return existing;
      }
      throw err;
    }
  }

  public async findByFingerprint(
    params: MemorySearchByFingerprintParams,
  ): Promise<AiMemorySelect | null> {
    if (!params.fingerprint) return null;
    const rows = await this.db
      .select()
      .from(aiMemories)
      .where(
        and(
          eq(aiMemories.tenantId, params.tenantId),
          eq(aiMemories.repositoryId, params.repositoryId),
          eq(aiMemories.memoryType, params.memoryType),
          eq(aiMemories.fingerprint, params.fingerprint),
        ),
      )
      .orderBy(desc(aiMemories.updatedAt))
      .limit(1);
    return rows[0] ?? null;
  }

  public async list(query: MemoryListQuery): Promise<AiMemorySelect[]> {
    const conditions = [];
    if (query.tenantId && query.tenantId !== "*") conditions.push(eq(aiMemories.tenantId, query.tenantId));
    if (query.projectId && query.projectId !== "*") conditions.push(eq(aiMemories.projectId, query.projectId));
    if (query.repositoryId && query.repositoryId !== "*") conditions.push(eq(aiMemories.repositoryId, query.repositoryId));
    if (query.memoryType) conditions.push(eq(aiMemories.memoryType, query.memoryType));
    if (query.status) conditions.push(eq(aiMemories.status, query.status));
    const base = this.db.select().from(aiMemories);
    return (conditions.length > 0 ? base.where(and(...conditions)) : base)
      .orderBy(desc(aiMemories.updatedAt))
      .limit(query.limit ?? 50)
      .offset(query.offset ?? 0);
  }

  /**
   * Active memory within a tenant/repository scope. Used for recall and
   * for the indexer/consolidator. Sql-wise, excludes superseded/stale/archived.
   */
  public async listActiveForRepository(
    repositoryId: string,
    opts: { limit?: number; memoryType?: MemoryType } = {},
  ): Promise<AiMemorySelect[]> {
    const conditions = [eq(aiMemories.status, "active")];
    if (repositoryId && repositoryId !== "*") {
      conditions.push(eq(aiMemories.repositoryId, repositoryId));
    }
    if (opts.memoryType) conditions.push(eq(aiMemories.memoryType, opts.memoryType));
    return this.db
      .select()
      .from(aiMemories)
      .where(and(...conditions))
      .orderBy(desc(aiMemories.updatedAt))
      .limit(opts.limit ?? 100);
  }

  /** Update lifecycle metadata. */
  public async update(id: string, patch: Partial<AiMemoryInsert>): Promise<AiMemorySelect | null> {
    const rows = await this.db
      .update(aiMemories)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(aiMemories.id, id))
      .returning();
    return rows[0] ?? null;
  }

  /** Supersede `id` with `supersededBy`, marking it historical. */
  public async supersede(id: string, supersededBy: string): Promise<void> {
    await this.db
      .update(aiMemories)
      .set({ status: "superseded", supersededBy, updatedAt: new Date() })
      .where(eq(aiMemories.id, id));
  }

  /** Invalidate (manual operator action — not hard delete, preserves audit). */
  public async invalidate(id: string): Promise<AiMemorySelect | null> {
    return this.update(id, { status: "invalidated" });
  }

  /** Archive (removed from active recall but preserved for audit). */
  public async archive(id: string): Promise<AiMemorySelect | null> {
    return this.update(id, { status: "archived" });
  }

  public async markAccessed(
    id: string,
    executionId: string,
    successful: boolean | null,
  ): Promise<void> {
    await this.db
      .update(aiMemories)
      .set({
        accessCount: sql`${aiMemories.accessCount} + 1`,
        ...(successful === null
          ? {}
          : successful
            ? { successfulUseCount: sql`${aiMemories.successfulUseCount} + 1` }
            : { negativeOutcomeCount: sql`${aiMemories.negativeOutcomeCount} + 1` }),
        lastAccessedAt: new Date(),
        lastUsedExecutionId: executionId,
      })
      .where(eq(aiMemories.id, id));
  }

  public async markValidated(id: string, confidence?: number): Promise<void> {
    await this.db
      .update(aiMemories)
      .set({
        lastValidatedAt: new Date(),
        ...(confidence !== undefined ? { confidence } : {}),
        ...(confidence !== undefined ? { status: "active" } : {}),
        updatedAt: new Date(),
      })
      .where(eq(aiMemories.id, id));
  }

  // ── Embeddings ──────────────────────────────────────────────────────

  public async upsertEmbedding(data: AiMemoryEmbeddingInsert): Promise<void> {
    await this.db
      .insert(aiMemoryEmbeddings)
      .values(data)
      .onConflictDoNothing({ target: [aiMemoryEmbeddings.id] });
  }

  public async listPendingEmbeddings(limit = 100): Promise<AiMemoryEmbeddingInsert[]> {
    return this.db
      .select()
      .from(aiMemoryEmbeddings)
      .where(eq(aiMemoryEmbeddings.status, "pending"))
      .limit(limit);
  }

  public async markEmbeddingIndexed(id: string, qdrantPointId: string): Promise<void> {
    await this.db
      .update(aiMemoryEmbeddings)
      .set({ status: "indexed", qdrantPointId, indexedAt: new Date(), updatedAt: new Date() })
      .where(eq(aiMemoryEmbeddings.id, id));
  }

  public async markEmbeddingFailed(id: string): Promise<void> {
    await this.db
      .update(aiMemoryEmbeddings)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(aiMemoryEmbeddings.id, id));
  }

  // ── Influence / Audit ───────────────────────────────────────────────

  public async recordInfluence(data: AiMemoryInfluenceInsert): Promise<void> {
    await this.db.insert(aiMemoryInfluences).values(data).onConflictDoNothing();
  }

  public async listInfluencesForExecution(executionId: string): Promise<Array<AiMemoryInfluenceSelect>> {
    return this.db
      .select()
      .from(aiMemoryInfluences)
      .where(eq(aiMemoryInfluences.executionId, executionId))
      .orderBy(desc(aiMemoryInfluences.rank));
  }

  public async listInfluencesForMemory(memoryId: string, limit = 50): Promise<Array<AiMemoryInfluenceSelect>> {
    return this.db
      .select()
      .from(aiMemoryInfluences)
      .where(eq(aiMemoryInfluences.memoryId, memoryId))
      .orderBy(desc(aiMemoryInfluences.createdAt))
      .limit(limit);
  }

  // ── Relationships ───────────────────────────────────────────────────

  public async createRelation(data: AiMemoryRelationInsert): Promise<void> {
    await this.db.insert(aiMemoryRelations).values(data).onConflictDoNothing();
  }

  public async listRelationsForMemory(memoryId: string): Promise<AiMemoryRelationSelect[]> {
    return this.db
      .select()
      .from(aiMemoryRelations)
      .where(
        sql`${aiMemoryRelations.sourceMemoryId} = ${memoryId} OR ${aiMemoryRelations.targetMemoryId} = ${memoryId}`,
      );
  }

  // ── Decay / Maintenance ─────────────────────────────────────────────

  /** Mark memories as expired whose expiresAt is in the past and status active. */
  public async expireOverdue(): Promise<number> {
    const now = new Date();
    const rows = await this.db
      .update(aiMemories)
      .set({ status: "expired", updatedAt: now })
      .where(and(eq(aiMemories.status, "active"), lte(aiMemories.expiresAt, now)))
      .returning({ id: aiMemories.id });
    return rows.length;
  }

  /** Find memories not validated within `staleDays`, to flag for revalidation. */
  public async findPotentiallyStale(
    repositoryId: string,
    staleDays: number,
    limit = 100,
  ): Promise<AiMemorySelect[]> {
    const cutoff = new Date(Date.now() - staleDays * 86_400_000);
    const conditions = [
      eq(aiMemories.status, "active"),
      sql`COALESCE(${aiMemories.lastValidatedAt}, ${aiMemories.createdAt}) < ${cutoff}`,
    ];
    if (repositoryId && repositoryId !== "*") {
      conditions.push(eq(aiMemories.repositoryId, repositoryId));
    }
    return this.db
      .select()
      .from(aiMemories)
      .where(and(...conditions))
      .limit(limit);
  }

  /** Count active memories (for metrics). */
  public async countActive(repositoryId?: string): Promise<number> {
    const conditions = [eq(aiMemories.status, "active")];
    if (repositoryId) conditions.push(eq(aiMemories.repositoryId, repositoryId));
    const rows = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(aiMemories)
      .where(and(...conditions));
    return rows[0]?.n ?? 0;
  }
}
