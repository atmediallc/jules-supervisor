import { eq, desc, asc } from "drizzle-orm";
import { Database } from "../client.js";
import { activities } from "../schema.js";

export type ActivityInsert = typeof activities.$inferInsert;
export type ActivitySelect = typeof activities.$inferSelect;

export class ActivityRepository {
  constructor(private readonly db: Database) {}

  public async findById(id: string): Promise<ActivitySelect | null> {
    const rows = await this.db.select().from(activities).where(eq(activities.id, id)).limit(1);
    return rows[0] ?? null;
  }

  public async listBySession(
    sessionId: string,
    order: "asc" | "desc" = "asc",
  ): Promise<ActivitySelect[]> {
    return this.db
      .select()
      .from(activities)
      .where(eq(activities.sessionId, sessionId))
      .orderBy(order === "asc" ? asc(activities.createdAt) : desc(activities.createdAt));
  }

  public async create(data: ActivityInsert): Promise<ActivitySelect> {
    const existing = await this.findById(data.id);
    if (existing) return existing;
    const inserted = await this.db.insert(activities).values(data).returning();
    return inserted[0]!;
  }
}
