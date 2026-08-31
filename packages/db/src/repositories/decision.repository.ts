import { eq, desc, and, sql, count, isNotNull } from "drizzle-orm";
import { Database } from "../client.js";
import { decisions, sessions } from "../schema.js";

export type DecisionInsert = typeof decisions.$inferInsert;
export type DecisionSelect = typeof decisions.$inferSelect;

export class DecisionRepository {
  constructor(private readonly db: Database) {}

  public async findById(id: string): Promise<DecisionSelect | null> {
    const rows = await this.db.select().from(decisions).where(eq(decisions.id, id)).limit(1);
    return rows[0] ?? null;
  }

  public async findByIdempotencyKey(key: string): Promise<DecisionSelect | null> {
    const rows = await this.db
      .select()
      .from(decisions)
      .where(eq(decisions.idempotencyKey, key))
      .limit(1);
    return rows[0] ?? null;
  }

  public async list(limit = 50, offset = 0): Promise<DecisionSelect[]> {
    return this.db
      .select()
      .from(decisions)
      .orderBy(desc(decisions.createdAt))
      .limit(limit)
      .offset(offset);
  }

  public async listBySession(sessionId: string): Promise<DecisionSelect[]> {
    return this.db
      .select()
      .from(decisions)
      .where(eq(decisions.sessionId, sessionId))
      .orderBy(desc(decisions.createdAt));
  }

  public async create(data: DecisionInsert): Promise<DecisionSelect> {
    const inserted = await this.db.insert(decisions).values(data).returning();
    return inserted[0]!;
  }

  public async markExecuted(
    id: string,
    executionState: string,
    executionError?: string,
  ): Promise<DecisionSelect | null> {
    const updated = await this.db
      .update(decisions)
      .set({
        executionState,
        executedAt: new Date(),
        executionError: executionError ?? null,
        // Outcome semantics (P1 Phase 43 repair):
        // "EXECUTED" only proves the Jules API ACCEPTED the mutation
        // (transport success). It is NOT a verified work outcome, so it is
        // stamped EXECUTED_ACCEPTED and must rank below human/explicitly
        // verified SUCCESS in precedent trust ordering.
        ...(executionState === "EXECUTED" && {
          outcome: "EXECUTED_ACCEPTED",
          outcomeObservedAt: new Date(),
        }),
        ...(executionState === "EXECUTION_FAILED" && {
          outcome: "FAILED",
          outcomeObservedAt: new Date(),
        }),
      })
      .where(eq(decisions.id, id))
      .returning();
    return updated[0] ?? null;
  }

  /**
   * Records the observable outcome of a decision (P0 outcome tracking).
   * This is the explicit, verified outcome path: SUCCESS / PARTIAL_SUCCESS /
   * FAILED / REJECTED / UNKNOWN. Only outcomes recorded through this method
   * (or human feedback) count as verified for precedent purposes.
   */
  public async recordOutcome(
    id: string,
    outcome: string,
    outcomeReason?: string,
  ): Promise<DecisionSelect | null> {
    const updated = await this.db
      .update(decisions)
      .set({
        outcome,
        outcomeObservedAt: new Date(),
        ...(outcomeReason && { executionError: outcomeReason }),
      })
      .where(eq(decisions.id, id))
      .returning();
    return updated[0] ?? null;
  }

  /**
   * Correlates explicit human feedback with an AI decision (P0 feedback loop).
   * A human REJECTION is itself a verified outcome of the proposal and is
   * stamped as such (P1 Phase 43 semantic repair).
   * Returns the updated decision, or null when the decision does not exist.
   */
  public async recordHumanFeedback(
    id: string,
    humanAction: string,
    humanReason?: string,
  ): Promise<DecisionSelect | null> {
    const updated = await this.db
      .update(decisions)
      .set({
        humanAction,
        humanReason: humanReason ?? null,
        humanReviewedAt: new Date(),
        ...(humanAction === "REJECTED" && {
          outcome: "REJECTED",
          outcomeObservedAt: new Date(),
        }),
      })
      .where(eq(decisions.id, id))
      .returning();
    return updated[0] ?? null;
  }

  /**
   * Persists the final approved response value on the originating decision
   * (P1 Phase 8): the exact text a human approved (possibly edited), so the
   * audit trail captures what was actually sanctioned — not only what the AI
   * proposed.
   */
  public async recordFinalApprovedResponse(
    id: string,
    finalApprovedResponse: string,
  ): Promise<DecisionSelect | null> {
    const updated = await this.db
      .update(decisions)
      .set({ finalApprovedResponse })
      .where(eq(decisions.id, id))
      .returning();
    return updated[0] ?? null;
  }

  /**
   * Aggregated AI usage for a session (budget engine source of truth).
   */
  public async getUsageBySession(sessionId: string): Promise<{
    aiCalls: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    estimatedCostUsd: number;
  }> {
    const rows = await this.db
      .select({
        aiCalls: count(),
        promptTokens: sql<number>`coalesce(sum(${decisions.promptTokens}), 0)::int`,
        completionTokens: sql<number>`coalesce(sum(${decisions.completionTokens}), 0)::int`,
        totalTokens: sql<number>`coalesce(sum(${decisions.totalTokens}), 0)::int`,
        estimatedCostUsd: sql<number>`coalesce(sum(${decisions.estimatedCostUsd}), 0)::double precision`,
      })
      .from(decisions)
      .where(eq(decisions.sessionId, sessionId));
    return (
      rows[0] ?? {
        aiCalls: 0,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        estimatedCostUsd: 0,
      }
    );
  }

  /**
   * Counts corrections in a session: decisions that follow a rejected decision
   * (basic correction loop, P0).
   */
  public async countCorrectionsBySession(sessionId: string): Promise<number> {
    const rows = await this.db
      .select({ corrections: count() })
      .from(decisions)
      .where(and(eq(decisions.sessionId, sessionId), isNotNull(decisions.correctionOfDecisionId)));
    return rows[0]?.corrections ?? 0;
  }

  /**
   * Cross-session precedent retrieval (P1 relational memory).
   *
   * Repository isolation: precedents are matched via JOIN decisions→sessions
   * filtered by sessions.repository = :repositoryId (canonical, normalized).
   * Retrieval NEVER spans repositories. The current session's own decisions
   * are excluded (already covered by recent-history retrieval).
   *
   * SQL-side filtering, hard LIMIT bounds, stable deterministic ordering
   * with id tie-breaker. No vector search, no embeddings — relational only.
   */
  public async findPrecedents(params: {
    repositoryId: string;
    excludeSessionId?: string;
    action?: string;
    limit?: number;
    requireHumanReview?: boolean;
    requireNonHumanReview?: boolean;
  }): Promise<DecisionSelect[]> {
    const limit = Math.min(Math.max(params.limit ?? 20, 1), 100);
    const conditions = [
      eq(sessions.repository, params.repositoryId),
      sql`${decisions.outcome} IS NOT NULL`,
    ];
    if (params.excludeSessionId) {
      conditions.push(sql`${decisions.sessionId} <> ${params.excludeSessionId}`);
    }
    if (params.action) {
      conditions.push(eq(decisions.action, params.action));
    }
    if (params.requireHumanReview) {
      conditions.push(isNotNull(decisions.humanReviewedAt));
    }
    if (params.requireNonHumanReview) {
      conditions.push(sql`${decisions.humanReviewedAt} IS NULL`);
    }

    const rows = await this.db
      .select({ decision: decisions })
      .from(decisions)
      .innerJoin(sessions, eq(decisions.sessionId, sessions.id))
      .where(and(...conditions))
      .orderBy(desc(decisions.outcomeObservedAt), desc(decisions.createdAt), decisions.id)
      .limit(limit);

    return rows.map((r) => r.decision);
  }
}
