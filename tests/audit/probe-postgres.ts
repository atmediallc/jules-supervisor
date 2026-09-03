/**
 * FINAL CERTIFICATION AUDIT — live Postgres probe (Phase C).
 * Connects to the ACTUAL running local Postgres and exercises the
 * AiMemoryRepository to prove or refute real persistence.
 */
import pg from "pg";

async function main() {
  const url =
    process.env["DATABASE_URL"] ??
    "postgresql://jules_user:jules_password@127.0.0.1:5439/jules_supervisor?sslmode=disable";
  console.log("Probe target:", url.replace(/:[^:@/]+@/, ":***@"));

  const pool = new pg.Pool({ connectionString: url, ssl: false });

  // 1. Check if memory tables exist
  const tables = await pool.query(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'ai_memory%'"
  );
  console.log("AI_MEMORY_TABLES:", JSON.stringify(tables.rows.map(r => r.tablename)));

  // 2. Try a raw INSERT into ai_memories (will fail if table missing)
  try {
    await pool.query(
      `INSERT INTO ai_memories (id, tenant_id, repository_id, memory_type, title,
         canonical_content, summary, tags, importance, confidence, source_type,
         source_trust, evidence_class, status, embedding_model, embedding_dimensions,
         schema_version, fingerprint, access_count, successful_use_count,
         negative_outcome_count, valid_from, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)`,
      [
        "mem_probe_001", "default", "probe", "semantic", "Probe",
        "Certification probe content.", "probe", '["probe"]',
        0.5, 0.5, "execution", "ai_inferred", "inferred",
        "active", "test", 1536, 3, "semantic:probe",
        0, 0, 0, new Date(), new Date(), new Date(),
      ]
    );
    console.log("INSERT_RESULT: OK");
  } catch (e) {
    console.log("INSERT_RESULT:", (e as Error).message.split('\n')[0]);
  }

  // 3. Try querying ai_memories
  try {
    const result = await pool.query("SELECT count(*) FROM ai_memories");
    console.log("SELECT_RESULT: rows =", result.rows[0]?.count);
  } catch (e) {
    console.log("SELECT_RESULT:", (e as Error).message.split('\n')[0]);
  }

  // 4. Try ai_memory_influences
  try {
    await pool.query("SELECT count(*) FROM ai_memory_influences");
    console.log("INFLUENCES_RESULT: OK");
  } catch (e) {
    console.log("INFLUENCES_RESULT:", (e as Error).message.split('\n')[0]);
  }

  await pool.end();
}

main().catch((e) => {
  console.log("FATAL:", (e as Error).message);
  process.exit(1);
});

