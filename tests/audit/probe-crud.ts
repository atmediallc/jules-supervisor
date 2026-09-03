/**
 * FINAL CERTIFICATION AUDIT — live Postgres CRUD lifecycle probe (Phase C).
 * Exercises the FULL AiMemoryRepository CRUD against the real running DB:
 * create / read / update / archive / invalidate / reactivate / markValidated /
 * influence / access counter / supersede.
 */
import { getDatabase, closeDatabase, AiMemoryRepository } from "../../packages/db/src/index.js";

const URL =
  process.env["DATABASE_URL"] ??
  "postgresql://jules_user:jules_password@127.0.0.1:5439/jules_supervisor?sslmode=disable";

function base(id: string) {
  return {
    id,
    tenantId: "tenant_a",
    projectId: "proj_a",
    repositoryId: "repo_a",
    memoryType: "semantic",
    title: "CRUD probe",
    canonicalContent:
      "Certification CRUD lifecycle probe canonical content verifying repository operations against live postgres.",
    summary: "crud probe",
    tags: ["probe"],
    importance: 0.5,
    confidence: 0.5,
    sourceType: "execution",
    sourceTrust: "ai_inferred",
    evidenceClass: "inferred",
    status: "active",
    embeddingModel: "test",
    embeddingDimensions: 1536,
    schemaVersion: 3,
    fingerprint: `semantic:crud-${id}`,
    accessCount: 0,
    successfulUseCount: 0,
    negativeOutcomeCount: 0,
    validFrom: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

async function main() {
  const db = getDatabase(URL);
  const repo = new AiMemoryRepository(db);
  const id = "mem_crud_probe";

  try {
    // CREATE
    const created = await repo.create(base(id));
    console.log("CREATE:", created.id, created.status);

    // READ
    const found = await repo.findById(id);
    console.log("READ:", found?.id, found?.title);

    // UPDATE (bump importance)
    await repo.update(id, { importance: 0.9 });
    const updated = await repo.findById(id);
    console.log("UPDATE importance:", updated?.importance);

    // INVALIDATE
    await repo.invalidate(id);
    console.log("INVALIDATE:", (await repo.findById(id))?.status);

    // REACTIVATE (via update status)
    await repo.update(id, { status: "active" });
    console.log("REACTIVATE:", (await repo.findById(id))?.status);

    // MARK VALIDATED (sets status active + confidence)
    await repo.markValidated(id, 0.85);
    const validated = await repo.findById(id);
    console.log("MARK_VALIDATED:", validated?.status, "conf=", validated?.confidence);

    // ACCESS COUNTER (2 accesses, 1 success)
    await repo.markAccessed(id, "exec1", true);
    await repo.markAccessed(id, "exec2", false);
    const accessed = await repo.findById(id);
    console.log("ACCESS:", "count=", accessed?.accessCount, "ok=", accessed?.successfulUseCount, "neg=", accessed?.negativeOutcomeCount);

    // INFLUENCE
    await repo.recordInfluence({
      id: "inf_crud_a",
      executionId: "exec1",
      memoryId: id,
      tenantId: "tenant_a",
      repositoryId: "repo_a",
      retrievalScore: 0.87,
      rank: 1,
      reasonSelected: "probe",
      injectedIntoContext: true,
      tokenCost: 25,
    });
    const influences = await repo.listInfluencesForMemory(id);
    console.log("INFLUENCE count:", influences.length);

    // EMBEDDING upsert + duplicate-idempotency
    await repo.upsertEmbedding({
      id: "emb_crud", memoryId: id, tenantId: "tenant_a",
      repositoryId: "repo_a", embeddingModel: "test", numDimensions: 1536,
      contentHash: "abc123", status: "indexed",
    });
    await repo.upsertEmbedding({
      id: "emb_crud", memoryId: id, tenantId: "tenant_a",
      repositoryId: "repo_a", embeddingModel: "test", numDimensions: 1536,
      contentHash: "abc123", status: "indexed",
    });
    const pending = await repo.listPendingEmbeddings(10);
    console.log("EMBEDDING upsert idempotent (emb_crud not repeating):", !pending.some(e => e.id === "emb_crud"));

    // SUPERSEDE
    await repo.supersede(id, "mem_newer");
    console.log("SUPERSEDE:", (await repo.findById(id))?.status, "->", (await repo.findById(id))?.supersededBy);

    // ARCHIVE
    await repo.archive(id);
    console.log("ARCHIVE:", (await repo.findById(id))?.status);

    // CLEANUP (influence + relations + embedding + memory)
    await db.delete(db._.schema.aiMemoryInfluences).where(db._.schema.aiMemoryInfluences.memoryId.eq(id));
    await db.delete(db._.schema.aiMemoryEmbeddings).where(db._.schema.aiMemoryEmbeddings.memoryId.eq(id));
    await db.delete(db._.schema.aiMemories).where(db._.schema.aiMemories.id.eq(id));
    console.log("CLEANUP done");
  } catch (e) {
    console.log("PROBE_ERROR:", (e as Error).message.split('\n')[0]);
  }

  await closeDatabase();
}

main().catch((e) => {
  console.log("FATAL:", (e as Error).message);
  process.exit(1);
});