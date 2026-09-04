import { eq, desc } from "drizzle-orm";
import { Database } from "../client.js";
import { sessions } from "../schema.js";

export type SessionInsert = typeof sessions.$inferInsert;
export type SessionSelect = typeof sessions.$inferSelect;

export class SessionRepository {
  constructor(private readonly db: Database) {}

  public async findById(id: string): Promise<SessionSelect | null> {
    const rows = await this.db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
    return rows[0] ?? null;
  }

  public async list(limit = 50, offset = 0): Promise<SessionSelect[]> {
    return this.db
      .select()
      .from(sessions)
      .orderBy(desc(sessions.updatedAt))
      .limit(limit)
      .offset(offset);
  }

  public async upsert(data: SessionInsert): Promise<SessionSelect> {
    // Atomic upsert: insert-or-update in a single statement, removing the
    // find-then-write TOCTOU race that could cause PK conflicts under
    // concurrent workers. On conflict we overwrite the row with the payload
    // (same net effect as the previous read-then-update path).
    const rows = await this.db
      .insert(sessions)
      .values(data)
      .onConflictDoUpdate({
        target: sessions.id,
        set: {
          ...data,
          updatedAt: new Date(),
        },
      })
      .returning();
    return rows[0]!;
  }

  public async updateState(
    id: string,
    state: string,
    supervisorStatus?: string,
  ): Promise<SessionSelect | null> {
    const updatePayload: Partial<SessionInsert> = {
      state,
      updatedAt: new Date(),
    };
    if (supervisorStatus) {
      updatePayload.supervisorStatus = supervisorStatus;
    }
    const result = await this.db
      .update(sessions)
      .set(updatePayload)
      .where(eq(sessions.id, id))
      .returning();
    return result[0] ?? null;
  }
}
