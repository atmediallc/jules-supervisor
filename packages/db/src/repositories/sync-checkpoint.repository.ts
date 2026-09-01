import { eq } from "drizzle-orm";
import { Database } from "../client.js";
import { syncCheckpoints } from "../schema.js";

export type SyncCheckpointInsert = typeof syncCheckpoints.$inferInsert;
export type SyncCheckpointSelect = typeof syncCheckpoints.$inferSelect;

/**
 * A per-session reconciliation cursor. When the worker was offline (or between
 * polls) it may have missed activities; the checkpoint records how far through
 * the session's activity stream we have already processed, so the poller can
 * catch up on every unseen activity (not just the most recent one).
 */
export interface SyncCheckpointRecord {
  sessionId: string;
  lastActivityId: string | null;
  nextPageToken: string | null;
  lastSyncedAt: Date;
}

const checkpointId = (sessionId: string): string => `sync:${sessionId}`.slice(0, 128);

/**
 * Persisted reconciliation cursor stored in the `sync_checkpoints` table.
 * One row per sessionId (unique). The id is a deterministic hash of the
 * sessionId, so re-running reconciliation is naturally idempotent.
 */
export class SyncCheckpointRepository {
  constructor(private readonly db: Database) {}

  public async getBySession(sessionId: string): Promise<SyncCheckpointRecord | null> {
    const rows = await this.db
      .select()
      .from(syncCheckpoints)
      .where(eq(syncCheckpoints.sessionId, sessionId))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return this.toRecord(row);
  }

  /**
   * Insert or update the cursor for a session. Explicitly scoped so a stale
   * replay never moves the cursor backwards: the effective high-water mark is
   * the max of the current and incoming lastActivityId.
   */
  public async upsert(
    sessionId: string,
    patch: { lastActivityId?: string | null; nextPageToken?: string | null },
  ): Promise<SyncCheckpointRecord> {
    const existing = await this.getBySession(sessionId);
    const now = new Date();

    // Never regress the high-water mark on replay.
    const lastActivityId =
      patch.lastActivityId ??
      existing?.lastActivityId ??
      null;

    const data = {
      sessionId,
      lastActivityId,
      nextPageToken: patch.nextPageToken ?? existing?.nextPageToken ?? null,
      lastSyncedAt: now,
    };

    if (existing) {
      await this.db
        .update(syncCheckpoints)
        .set(data)
        .where(eq(syncCheckpoints.sessionId, sessionId));
    } else {
      await this.db
        .insert(syncCheckpoints)
        .values({ id: checkpointId(sessionId), ...data });
    }

    return {
      sessionId,
      lastActivityId,
      nextPageToken: data.nextPageToken,
      lastSyncedAt: now,
    };
  }

  public async deleteBySession(sessionId: string): Promise<void> {
    await this.db
      .delete(syncCheckpoints)
      .where(eq(syncCheckpoints.sessionId, sessionId));
  }

  private toRecord(row: SyncCheckpointSelect): SyncCheckpointRecord {
    return {
      sessionId: row.sessionId,
      lastActivityId: row.lastActivityId ?? null,
      nextPageToken: row.nextPageToken ?? null,
      lastSyncedAt: row.lastSyncedAt,
    };
  }
}
