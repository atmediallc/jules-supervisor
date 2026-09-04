import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";

const { Pool } = pg;

export type Database = NodePgDatabase<typeof schema>;

/**
 * Run a batch of repository writes inside a single Postgres transaction so they
 * commit atomically (all-or-nothing). Repositories are constructor-injected with
 * their db handle, so construct tx-bound repo instances inside the callback:
 *
 *   await runInTransaction(db, async (tx) => {
 *     const a = new AuditRepository(tx);
 *     const d = new DecisionRepository(tx);
 *     await d.markExecuted(id, "EXECUTED");
 *     await a.record({ ... });
 *   });
 *
 * If any step throws, every write in the callback is rolled back. Nested
 * runInTransaction calls are safe (drizzle uses savepoints).
 */
export async function runInTransaction<T>(
  db: Database,
  fn: (tx: Database) => Promise<T>,
): Promise<T> {
  return db.transaction((tx) => fn(tx as unknown as Database));
}

let _db: Database | null = null;
let _pool: pg.Pool | null = null;

export function getDatabase(databaseUrl?: string): Database {
  if (_db && _pool && !_pool.ending && !_pool.ended) return _db;

  const url =
    databaseUrl ||
    process.env["DATABASE_URL"] ||
    "postgresql://jules_user:jules_password@127.0.0.1:5439/jules_supervisor?sslmode=disable";

  _pool = new Pool({
    connectionString: url,
    ssl: false,
    max: Number(process.env["DB_MAX_CONNECTIONS"]) || 10,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
  });

  // CRITICAL: pg.Pool emits an 'error' event when an idle client's connection
  // dies (e.g. PostgreSQL restart, administrative termination, network blip).
  // With no listener, Node's default behavior rethrows the error and crashes
  // the entire process (web AND worker). Attaching a handler keeps the pool
  // alive — pg-pool destroys the dead client and allocates a fresh one for the
  // next query, so the daemon survives database restarts without intervention.
  _pool.on("error", (err) => {
    console.error("[jules-db] PostgreSQL pool error (idle client terminated):", err.message);
  });

  _db = drizzle(_pool, { schema });
  return _db;
}

export async function closeDatabase(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
    _db = null;
  }
}
