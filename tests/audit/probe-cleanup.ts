/** Certification probe — clean up CRUD probe rows via raw pg. */
import pg from "pg";
const URL =
  process.env["DATABASE_URL"] ??
  "postgresql://jules_user:jules_password@127.0.0.1:5439/jules_supervisor?sslmode=disable";

const p = new pg.Pool({ connectionString: URL });
const ids = ["mem_crud_probe", "mem_newer", "inf_crud_a", "emb_crud"];
for (const id of ids) {
  for (const t of ["ai_memory_influences", "ai_memory_relations", "ai_memory_embeddings"]) {
    await p.query(`DELETE FROM ${t} WHERE memory_id = $1`, [id]).catch(() => {});
  }
  await p.query(`DELETE FROM ai_memories WHERE id = $1`, [id]).catch(() => {});
}
const leftovers = await p.query(`SELECT count(*)::int AS n FROM ai_memories`);
console.log("CLEANUP done, remaining ai_memories rows:", leftovers.rows[0].n);
await p.end();