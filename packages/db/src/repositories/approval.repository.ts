import { eq, and, desc } from "drizzle-orm";
import { Database } from "../client.js";
import { approvalRequests } from "../schema.js";

export type ApprovalRequestInsert = typeof approvalRequests.$inferInsert;
export type ApprovalRequestSelect = typeof approvalRequests.$inferSelect;

export class ApprovalRepository {
  constructor(private readonly db: Database) {}

  public async findById(id: string): Promise<ApprovalRequestSelect | null> {
    const rows = await this.db
      .select()
      .from(approvalRequests)
      .where(eq(approvalRequests.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  public async findPendingByDecisionId(decisionId: string): Promise<ApprovalRequestSelect | null> {
    const rows = await this.db
      .select()
      .from(approvalRequests)
      .where(eq(approvalRequests.decisionId, decisionId))
      .limit(1);
    return rows[0] ?? null;
  }

  public async listPending(limit = 50): Promise<ApprovalRequestSelect[]> {
    return this.db
      .select()
      .from(approvalRequests)
      .where(eq(approvalRequests.status, "PENDING"))
      .orderBy(desc(approvalRequests.createdAt))
      .limit(limit);
  }

  public async create(data: ApprovalRequestInsert): Promise<ApprovalRequestSelect> {
    const inserted = await this.db.insert(approvalRequests).values(data).returning();
    return inserted[0]!;
  }

  public async updateStatus(
    id: string,
    status: "APPROVED" | "REJECTED" | "EDITED" | "CANCELLED",
    reviewer: string,
    modifiedResponse?: string,
    comment?: string,
  ): Promise<ApprovalRequestSelect | null> {
    const updated = await this.db
      .update(approvalRequests)
      .set({
        status,
        reviewer,
        modifiedResponse: modifiedResponse ?? null,
        reviewComment: comment ?? null,
        reviewedAt: new Date(),
      })
      .where(and(eq(approvalRequests.id, id), eq(approvalRequests.status, "PENDING")))
      .returning();
    return updated[0] ?? null;
  }
}
