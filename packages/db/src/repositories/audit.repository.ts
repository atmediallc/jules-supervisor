import { eq, desc } from "drizzle-orm";
import { Database } from "../client.js";
import { auditEvents } from "../schema.js";

export type AuditEventInsert = typeof auditEvents.$inferInsert;
export type AuditEventSelect = typeof auditEvents.$inferSelect;

export class AuditRepository {
  constructor(private readonly db: Database) {}

  public async list(limit = 100, offset = 0): Promise<AuditEventSelect[]> {
    return this.db
      .select()
      .from(auditEvents)
      .orderBy(desc(auditEvents.timestamp))
      .limit(limit)
      .offset(offset);
  }

  public async listBySession(sessionId: string, limit = 50): Promise<AuditEventSelect[]> {
    return this.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.sessionId, sessionId))
      .orderBy(desc(auditEvents.timestamp))
      .limit(limit);
  }

  public async record(data: AuditEventInsert): Promise<AuditEventSelect> {
    const inserted = await this.db.insert(auditEvents).values(data).returning();
    return inserted[0]!;
  }
}
