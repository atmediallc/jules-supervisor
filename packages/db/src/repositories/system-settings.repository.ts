import { eq } from "drizzle-orm";
import { Database } from "../client.js";
import { systemSettings } from "../schema.js";

export type SystemSettingInsert = typeof systemSettings.$inferInsert;
export type SystemSettingSelect = typeof systemSettings.$inferSelect;

export class SystemSettingsRepository {
  constructor(private readonly db: Database) {}

  public async getAll(): Promise<SystemSettingSelect[]> {
    return this.db.select().from(systemSettings).orderBy(systemSettings.category, systemSettings.key);
  }

  public async getByKey(key: string): Promise<SystemSettingSelect | null> {
    const rows = await this.db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, key))
      .limit(1);
    return rows[0] ?? null;
  }

  public async getByCategory(category: string): Promise<SystemSettingSelect[]> {
    return this.db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.category, category))
      .orderBy(systemSettings.key);
  }

  public async upsert(setting: SystemSettingInsert): Promise<SystemSettingSelect> {
    const existing = await this.getByKey(setting.key!);
    if (existing) {
      const updated = await this.db
        .update(systemSettings)
        .set({ value: setting.value, updatedAt: new Date() })
        .where(eq(systemSettings.key, setting.key!))
        .returning();
      return updated[0]!;
    }
    const inserted = await this.db.insert(systemSettings).values(setting).returning();
    return inserted[0]!;
  }

  public async upsertMany(settings: SystemSettingInsert[]): Promise<SystemSettingSelect[]> {
    const results: SystemSettingSelect[] = [];
    for (const s of settings) {
      results.push(await this.upsert(s));
    }
    return results;
  }

  public async deleteByKey(key: string): Promise<boolean> {
    const result = await this.db.delete(systemSettings).where(eq(systemSettings.key, key));
    return (result.rowCount ?? 0) > 0;
  }

  /** Returns a plain key→value map for config override lookups. */
  public async getAsMap(): Promise<Record<string, string>> {
    const all = await this.getAll();
    const map: Record<string, string> = {};
    for (const row of all) {
      map[row.key] = row.value;
    }
    return map;
  }
}
