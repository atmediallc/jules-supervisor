import { eq, sql } from "drizzle-orm";
import { Database } from "../client.js";
import { sessionBudgets } from "../schema.js";

export type SessionBudgetSelect = typeof sessionBudgets.$inferSelect;

export class BudgetRepository {
  constructor(private readonly db: Database) {}

  /**
   * Loads persistent budget counters for a session (survive restarts, P0).
   */
  public async findBySession(sessionId: string): Promise<SessionBudgetSelect | null> {
    const rows = await this.db
      .select()
      .from(sessionBudgets)
      .where(eq(sessionBudgets.sessionId, sessionId))
      .limit(1);
    return rows[0] ?? null;
  }

  /**
   * Atomically increments budget counters using SQL-side arithmetic so
   * concurrent workers cannot lose updates.
   */
  public async incrementUsage(
    sessionId: string,
    delta: {
      aiCalls: number;
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
      estimatedCostUsd: number;
    },
    id?: string,
  ): Promise<SessionBudgetSelect> {
    const updated = await this.db
      .insert(sessionBudgets)
      .values({
        id: id ?? sessionId,
        sessionId,
        aiCalls: delta.aiCalls,
        promptTokens: delta.promptTokens,
        completionTokens: delta.completionTokens,
        totalTokens: delta.totalTokens,
        estimatedCostUsd: delta.estimatedCostUsd,
      })
      .onConflictDoUpdate({
        target: sessionBudgets.sessionId,
        set: {
          aiCalls: sql`${sessionBudgets.aiCalls} + ${delta.aiCalls}`,
          promptTokens: sql`${sessionBudgets.promptTokens} + ${delta.promptTokens}`,
          completionTokens: sql`${sessionBudgets.completionTokens} + ${delta.completionTokens}`,
          totalTokens: sql`${sessionBudgets.totalTokens} + ${delta.totalTokens}`,
          estimatedCostUsd: sql`${sessionBudgets.estimatedCostUsd} + ${delta.estimatedCostUsd}`,
          updatedAt: new Date(),
        },
      })
      .returning();
    return updated[0]!;
  }

  /**
   * Atomically increments the correction counter for a session.
   */
  public async incrementCorrections(sessionId: string, id?: string): Promise<SessionBudgetSelect> {
    const updated = await this.db
      .insert(sessionBudgets)
      .values({
        id: id ?? sessionId,
        sessionId,
        corrections: 1,
      })
      .onConflictDoUpdate({
        target: sessionBudgets.sessionId,
        set: {
          corrections: sql`${sessionBudgets.corrections} + 1`,
          updatedAt: new Date(),
        },
      })
      .returning();
    return updated[0]!;
  }
}
