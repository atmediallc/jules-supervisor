import { eq, and, sql } from "drizzle-orm";
import { Database } from "../client.js";
import { corrections } from "../schema.js";

export interface CorrectionRecord {
  id: string;
  sessionId: string;
  decisionId?: string | null;
  fingerprint: string;
  instruction: string;
  createdAt: Date;
}

/**
 * Durable correction-loop ledger (H5).
 *
 * Previously the correction loop's defect-fingerprint set and budget ceiling were
 * held only in-memory in the worker pipeline — the correction count and dedup set
 * vanish on restart, allowing the ceiling to be reset. Persisting each correction
 * makes dedup and the ceiling survive restarts and be shared across workers.
 */
export class CorrectionRepository {
  constructor(private readonly db: Database) {}

  /** Insert a correction, no-op if the same (session, fingerprint) already exists. */
  async record(input: {
    id: string;
    sessionId: string;
    decisionId?: string | null;
    fingerprint: string;
    instruction: string;
  }): Promise<boolean> {
    const result = await this.db
      .insert(corrections)
      .values({
        id: input.id,
        sessionId: input.sessionId,
        decisionId: input.decisionId ?? null,
        fingerprint: input.fingerprint,
        instruction: input.instruction,
      })
      .onConflictDoNothing({ target: [corrections.sessionId, corrections.fingerprint] })
      .returning({ id: corrections.id });
    return result.length > 0;
  }

  /** All fingerprints previously submitted for a session (for dedup). */
  async fingerprintsForSession(sessionId: string): Promise<string[]> {
    const rows = await this.db
      .select({ fingerprint: corrections.fingerprint })
      .from(corrections)
      .where(eq(corrections.sessionId, sessionId));
    return rows.map((r) => r.fingerprint);
  }

  /** Durable correction count for a session. */
  async countForSession(sessionId: string): Promise<number> {
    const rows = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(corrections)
      .where(eq(corrections.sessionId, sessionId));
    return rows[0]?.count ?? 0;
  }

  async listBySession(sessionId: string): Promise<CorrectionRecord[]> {
    const rows = await this.db
      .select()
      .from(corrections)
      .where(eq(corrections.sessionId, sessionId));
    return rows as CorrectionRecord[];
  }

  /** Whether a given fingerprint has already been submitted for the session. */
  async existsForSession(sessionId: string, fingerprint: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: corrections.id })
      .from(corrections)
      .where(and(eq(corrections.sessionId, sessionId), eq(corrections.fingerprint, fingerprint)))
      .limit(1);
    return rows.length > 0;
  }
}
