import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";

const { Pool } = pg;

export type Database = NodePgDatabase<typeof schema>;

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
