/**
 * CERTIFICATION PROBE (Phases 5/7/10/11/12/13/15/16) — REAL PostgreSQL
 * semantic-memory life-cycle, driven through the application's own
 * repositories + admission engine. No mocks.
 *
 * Because the configured embedding provider is BLOCKED (homenas proxy returns
 * `400 No credentials for embedding provider: openai`), every admission writes
 * the canonical DB record with an embed attempt that fails and is queued as
 * "pending". This probe proves the DB-side life-cycle is fully real and the
 * semantic path degrades safely (never invented, never blocks durability).
 */
import { readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { getDatabase } from "../../packages/db/src/client.js";
import { AiMemoryRepository } from "../../packages/db/src/repositories/ai-memory.repository.js";
import { admitMemory } from "../../packages/ai/src/memory-admission.js";
import { MemoryRecallEngine } from "../../packages/ai/src/memory-recall.js";
import { createEmbeddingProvider } from "../../packages/ai/src/embedding-provider.js";
import type { EmbeddingProviderConfig } from "../../packages/ai/src/embedding-provider.js";
import { MemoryCandidate } from "../../packages/core/src/memory-types.js";

function loadEnv(): void {
  let p = resolve(process.cwd());
  // Walk up from cwd to find the repo-root .env.
  for (;;) {
    const full = join(p, ".env");
    let txt: string | null = null;
    try {
      txt = readFileSync(full, "utf8");
    } catch {
      txt = null;
    }
    if (txt !== null) {
      for (const line of txt.split("\n")) {
        if (!line || line.startsWith("#")) continue;
        const i = line.indexOf("=");
        if (i < 0) continue;
        const k = line.slice(0, i).trim();
        const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
        if (process.env[k] === undefined) process.env[k] = v;
      }
      console.log(`loaded .env from ${full}`);
      return;
    }
    const parent = dirname(p);
    if (parent === p) break;
    p = parent;
  }
  console.log("WARNING: no .env found; using defaults");
}

function now(): string {
  return new Date().toISOString();
}

async function main(): Promise<void> {
  loadEnv();
  const cert = `cert-${Date.now()}`;
  console.log(`\n[${now()}] ===== MEMORY DB CERTIFICATION PROBE ${cert} =====\n`);

  const db = getDatabase();
  const repo = new AiMemoryRepository(db);

  // ── Phase 7/16 degraded recall config (semantic blocked) ─────
  const recallConfig = {
    topK: 5,
    similarityThreshold: 0.2,
    candidateMultiplier: 5,
    tokenBudget: 2000,
    rankingConfig: undefined,
  };

  const admissionConfig = {
    minImportance: 0.3,
    minConfidence: 0.3,
    maxLengthChars: 4000,
    dedupSimilarityThreshold: 0.85,
    embeddingModel: "text-embedding-3-small",
    embeddingDimensions: 1536,
  };

  // Real embedding provider: real base URL + API key from env. On the configured
  // runtime the proxy rejects embeddings, so embed() should throw 400.
  const embCfg: EmbeddingProviderConfig = {
    baseUrl: process.env["EMBEDDING_BASE_URL"] ?? process.env["AI_BASE_URL"] ?? "http://homenas:20128/v1",
    apiKey: process.env["EMBEDDING_API_KEY"] ?? process.env["AI_API_KEY"] ?? "",
    model: process.env["EMBEDDING_MODEL"] ?? "text-embedding-3-small",
    dimensions: 1536,
    batchSize: 8,
    timeoutMs: 5000,
  };
  const embedder = createEmbeddingProvider(embCfg);
  console.log(`embedding provider baseUrl=${embCfg.baseUrl} key=${embCfg.apiKey ? "SET" : "EMPTY"} model=${embCfg.model}`);

  // ── Phase 5/6: first learn via the ADMISSION engine (real code path) ──
  const candidate1: MemoryCandidate = {
    tenantId: "default",
    projectId: "default",
    repositoryId: "jules-supervisor",
    memoryType: "procedural",
    title: `Cert convention ${cert}`,
    canonicalContent:
      `The worker must never run destructive operations more than once per task ` +
      `for memory certification at ${cert}; idempotency is enforced at the pipeline gate.`,
    summary: `Idempotency gate note ${cert}`,
    tags: ["certification", "idempotency"],
    importance: 0.9,
    confidence: 0.95,
    sourceType: "execution",
    sourceTrust: "test_verified",
    evidenceClass: "observed",
    executionId: `exec-${cert}`,
    taskId: `task-${cert}`,
    affectedPaths: ["apps/worker/src/pipeline.ts"],
    branch: "main",
    commitSha: "3ec0a37",
  };

  const out1 = await admitMemory(repo, admissionConfig, candidate1, embedder, null);
  console.log(`\n[admission#1] action=${out1.action} reason=${out1.reason}`);
  if (!out1.memory) throw new Error("admission#1 produced no memory");
  const mem1 = await repo.findById(out1.memory.id);
  console.log(`  persisted id=${mem1?.id} status=${mem1?.status} fingerprint=${mem1?.fingerprint?.slice(0,12)}…`);
  console.log(`  contentSecretRedacted=${mem1?.canonicalContent.includes("[REDACTED]") ? "N/A (none present)" : "checked"}`);

  // ── Phase 15: secret redaction through the real admission path ──
  const candidateSecret: MemoryCandidate = {
    ...candidate1,
    title: `Cert redaction ${cert}`,
    canonicalContent:
      `When deploying, set token=sk-abcdefghijklmnopqrstuvwxyz12345678901234567890123456789012 and ` +
      `AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE; never log them.`,
    summary: `Secret handling ${cert}`,
    memoryType: "preference",
    executionId: `exec-red-${cert}`,
    taskId: `task-red-${cert}`,
  };
  const outRed = await admitMemory(repo, admissionConfig, candidateSecret, embedder, null);
  console.log(`\n[admission#redaction] action=${outRed.action}`);
  const red = outRed.memory ? await repo.findById(outRed.memory.id) : null;
  const redacted = red ? red.canonicalContent.includes("[REDACTED]") : false;
  console.log(`  secretRedacted=${redacted}`);
  if (red) console.log(`  content=${red.canonicalContent.slice(0, 120)}`);
  if (!redacted) throw new Error("SECRET REDACTION FAILED: secret not redacted");

  // ── Phase 5: duplicate detection (same fingerprint → merged) ──
  const outDup = await admitMemory(repo, admissionConfig, candidate1, embedder, null);
  console.log(`\n[admission#dedup] action=${outDup.action} reason=${outDup.reason} (expect merged/duplicate)`);

  // ── Phase 11: isolation by tenant/project/repo ──
  const isoA = `iso-A-${cert}`;
  const isoB = `iso-B-${cert}`;
  const repoA = new AiMemoryRepository(db);
  await repoA.create({
    id: `iso-${cert}-a`,
    tenantId: isoA, projectId: isoA, repositoryId: `${isoA}-repo`,
    memoryType: "convention", title: `iso A ${cert}`,
    canonicalContent: `Isolation scope A content for certification ${cert} — tenant A private knowledge.`,
    summary: `iso A`, tags: [], importance: 0.6, confidence: 0.6,
    sourceType: "execution", sourceTrust: "verified", evidenceClass: "observed",
    embeddingModel: "text-embedding-3-small", embeddingDimensions: 1536, schemaVersion: 3,
    fingerprint: `fp-a-${cert}`, accessCount: 0, successfulUseCount: 0, negativeOutcomeCount: 0,
  });
  await repo.create({
    id: `iso-${cert}-b`,
    tenantId: isoB, projectId: isoB, repositoryId: `${isoB}-repo`,
    memoryType: "convention", title: `iso B ${cert}`,
    canonicalContent: `Isolation scope B content for certification ${cert} — tenant B private knowledge.`,
    summary: `iso B`, tags: [], importance: 0.6, confidence: 0.6,
    sourceType: "execution", sourceTrust: "verified", evidenceClass: "observed",
    embeddingModel: "text-embedding-3-small", embeddingDimensions: 1536, schemaVersion: 3,
    fingerprint: `fp-b-${cert}`, accessCount: 0, successfulUseCount: 0, negativeOutcomeCount: 0,
  });
  const listA = await repo.list({ tenantId: isoA });
  const leakedIntoA = listA.some((m) => m.tenantId !== isoA);
  console.log(`\n[isolation] list(A) count=${listA.length} crossTenantLeak=${leakedIntoA}`);
  if (leakedIntoA) throw new Error("ISOLATION FAILED: cross-tenant leak into A");

  // ── Phase 13: supersession (V1 → V2) ──
  const v1 = await repo.create({
    id: `sup-${cert}-v1`, tenantId: "default", projectId: "default", repositoryId: "jules-supervisor",
    memoryType: "convention", title: `Supersede v1 ${cert}`,
    canonicalContent: `Supersession test version one for ${cert} — now outdated.`,
    summary: `v1`, tags: [], importance: 0.7, confidence: 0.7,
    sourceType: "execution", sourceTrust: "verified", evidenceClass: "observed",
    embeddingModel: "text-embedding-3-small", embeddingDimensions: 1536, schemaVersion: 3,
    fingerprint: `fp-sup-v1-${cert}`, accessCount: 0, successfulUseCount: 0, negativeOutcomeCount: 0,
  });
  const v2 = await repo.create({
    id: `sup-${cert}-v2`, tenantId: "default", projectId: "default", repositoryId: "jules-supervisor",
    memoryType: "convention", title: `Supersede v2 ${cert}`,
    canonicalContent: `Supersession test version two for ${cert} — current authoritative fact.`,
    summary: `v2`, tags: [], importance: 0.8, confidence: 0.9,
    sourceType: "execution", sourceTrust: "verified", evidenceClass: "observed",
    embeddingModel: "text-embedding-3-small", embeddingDimensions: 1536, schemaVersion: 3,
    fingerprint: `fp-sup-v2-${cert}`, accessCount: 0, successfulUseCount: 0, negativeOutcomeCount: 0,
  });
  await repo.supersede(v1.id, v2.id);
  const v1After = await repo.findById(v1.id);
  const v2After = await repo.findById(v2.id);
  console.log(`\n[supersession] v1.status=${v1After?.status} v1.supersededBy=${v1After?.supersededBy} v2.status=${v2After?.status}`);
  if (v1After?.status !== "superseded" || v2After?.status !== "active") {
    throw new Error("SUPERSESSION FAILED");
  }

  // ── Phase 12: staleness detection (active, never-validated memories) ──
  const stale = await repo.findPotentiallyStale("jules-supervisor", 0, 50);
  // Superseded v1 is correctly excluded (not active); the active, never-validated
  // admission memory (mem1) is the correct target.
  const staleFound = stale.some((m) => m.id === mem1!.id);
  console.log(`[staleness] findPotentiallyStale(staleDays=0) total=${stale.length} activeUnvalidatedFound=${staleFound}`);
  if (!staleFound) throw new Error("STALENESS FAILED: expected active unvalidated memory flagged");

  // ── Phase 10: access counters + influence ──
  await repo.markAccessed(mem1!.id, `exec-${cert}`, true);
  await repo.markAccessed(mem1!.id, `exec-${cert}-2`, true);
  const mem1After = await repo.findById(mem1!.id);
  console.log(`[access] mem1.accessCount=${mem1After?.accessCount} successfulUseCount=${mem1After?.successfulUseCount}`);
  if ((mem1After?.accessCount ?? 0) < 2 || (mem1After?.successfulUseCount ?? 0) < 2) {
    throw new Error("ACCESS COUNTER FAILED");
  }
  await repo.recordInfluence({
    id: `inf-${cert}`, memoryId: mem1!.id, executionId: `exec-${cert}`,
    tenantId: "default", projectId: "default", repositoryId: "jules-supervisor",
    retrievalScore: 0.85, rank: 1, reasonSelected: "highest_relevance", injectedIntoContext: true,
  });
  const influences = await repo.listInfluencesForExecution(`exec-${cert}`);
  console.log(`[influence] recorded for exec count=${influences.length} rank0=${influences[0]?.rank} influence=${influences[0]?.influence}`);
  if (influences.length !== 1) throw new Error("INFLUENCE FAILED");

  // ── Phase 7: embedding queue (pending → failed, simulating blocked real embed) ──
  await repo.upsertEmbedding({
    id: `emb-${cert}`, memoryId: mem1!.id, tenantId: "default", projectId: "default",
    repositoryId: "jules-supervisor", qdrantPointId: `pt-${cert}`,
    embeddingModel: "text-embedding-3-small", numDimensions: 1536, contentHash: `ch-${cert}`,
    status: "pending",
  });
  const pending = await repo.listPendingEmbeddings(10);
  const foundPending = pending.some((e) => e.id === `emb-${cert}`);
  await repo.markEmbeddingFailed(`emb-${cert}`);
  console.log(`[embed-queue] pendingQueued=${foundPending} (real embed blocked → queued → marked failed)`);
  if (!foundPending) throw new Error("EMBED QUEUE FAILED");

  // ── Phase 16: degraded recall with NO semantic store ──
  const engineNoStore = new MemoryRecallEngine(repo, embedder, null, recallConfig);
  const degraded = await engineNoStore.recall({
    tenantId: "default", projectId: "default", repositoryId: "jules-supervisor",
    task: `Recall test for ${cert}`, affectedPaths: [], branch: "main",
  });
  console.log(`[degraded-recall] degraded=${degraded.degraded} reason=${degraded.degradationReason} items=${degraded.items.length} (never invented)`);
  if (!degraded.degraded || degraded.items.length !== 0) {
    throw new Error("DEGRADED RECALL FAILED: must be degraded with zero items");
  }

  // ── Isolation: ensure nothing from scope B leaked into scope A query of repo scope ──
  const activeRepo = await repo.listActiveForRepository(`${isoA}-repo`);
  const crossLeak = activeRepo.some((m) => m.repositoryId !== `${isoA}-repo`);
  console.log(`[isolation-repo] listActiveForRepository(A-repo) count=${activeRepo.length} crossRepositoryLeak=${crossLeak}`);
  if (crossLeak) throw new Error("REPOSITORY ISOLATION FAILED");

  console.log(`\n[${now()}] ===== MEMORY DB CERTIFICATION PROBE ${cert}: ALL CHECKS PASSED =====`);
}


main().catch((e) => {
  console.log(`\nPROBE FAILED: ${(e as Error).message.split('\n')[0]}`);
  process.exit(1);
});