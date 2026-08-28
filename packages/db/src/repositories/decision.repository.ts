import { eq, desc } from "drizzle-orm";
import { Database } from "../client.js";
import { decisions } from "../schema.js";

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
      })
      .where(eq(decisions.id, id))
      .returning();
    return updated[0] ?? null;
  }
}
