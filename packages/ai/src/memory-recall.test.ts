import { describe, expect, it } from "vitest";
import {
  AiMemory,
  DEFAULT_RANKING_CONFIG,
  MemoryRankingConfig,
  MemoryRecallRequest,
} from "@jules/core";
import { SemanticSearchHit } from "./qdrant-adapter.js";
import { scoreMemory } from "./memory-recall.js";

function makeMemory(overrides: Partial<AiMemory> = {}): AiMemory {
  const now = new Date();
  return {
    id: "mem_1",
    tenantId: "t",
    projectId: "p",
    repositoryId: "repo",
    memoryType: "semantic",
    title: "Test memory",
    canonicalContent: "content",
    summary: "summary",
    tags: [],
    importance: 0.7,
    confidence: 0.8,
    sourceType: "repository",
    sourceTrust: "test_verified",
    evidenceClass: "test_verified",
    sourceId: null,
    executionId: null,
    taskId: null,
    affectedPaths: [],
    branch: null,
    commitSha: null,
    status: "active",
    embeddingModel: "test",
    embeddingDimensions: 128,
    schemaVersion: 3,
    supersededBy: null,
    fingerprint: "fp",
    accessCount: 0,
    successfulUseCount: 0,
    negativeOutcomeCount: 0,
    lastAccessedAt: null,
    lastUsedExecutionId: null,
    lastValidatedAt: null,
    validFrom: now,
    validUntil: null,
    expiresAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

const request: MemoryRecallRequest = {
  tenantId: "t",
  projectId: "p",
  repositoryId: "repo",
  task: "fix the auth flow",
  executionId: "exec_1",
  affectedPaths: ["src/auth/login.ts"],
};

function hit(score: number): SemanticSearchHit {
  return { id: "p1", score, payload: { memoryId: "mem_1" } };
}

describe("scoreMemory", () => {
  it("scores higher for higher semantic similarity", () => {
    const m = makeMemory();
    const low = scoreMemory(hit(0.4), m, request, DEFAULT_RANKING_CONFIG);
    const high = scoreMemory(hit(0.9), m, request, DEFAULT_RANKING_CONFIG);
    expect(high.score).toBeGreaterThan(low.score);
  });

  it("scores higher for higher importance", () => {
    const a = scoreMemory(hit(0.5), makeMemory({ importance: 0.1 }), request, DEFAULT_RANKING_CONFIG);
    const b = scoreMemory(hit(0.5), makeMemory({ importance: 0.9 }), request, DEFAULT_RANKING_CONFIG);
    expect(b.score).toBeGreaterThan(a.score);
  });

  it("penalizes stale memories", () => {
    const stale = makeMemory({ status: "stale" });
    const fresh = makeMemory({ status: "active" });
    const s = scoreMemory(hit(0.5), stale, request, DEFAULT_RANKING_CONFIG);
    const f = scoreMemory(hit(0.5), fresh, request, DEFAULT_RANKING_CONFIG);
    expect(f.score).toBeGreaterThan(s.score);
  });

  it("penalizes superseded memories", () => {
    const superseded = makeMemory({ status: "superseded" });
    const active = makeMemory({ status: "active" });
    const s = scoreMemory(hit(0.5), superseded, request, DEFAULT_RANKING_CONFIG);
    const a = scoreMemory(hit(0.5), active, request, DEFAULT_RANKING_CONFIG);
    expect(a.score).toBeGreaterThan(s.score);
  });

  it("awards path affinity for matching affected files", () => {
    const sharedPath = makeMemory({ affectedPaths: ["src/auth/login.ts"] });
    const unrelated = makeMemory({ affectedPaths: ["src/billing/calc.ts"] });
    const a = scoreMemory(hit(0.5), sharedPath, request, DEFAULT_RANKING_CONFIG);
    const b = scoreMemory(hit(0.5), unrelated, request, DEFAULT_RANKING_CONFIG);
    expect(a.score).toBeGreaterThan(b.score);
  });

  it("penalizes low-trust sources", () => {
    const lowTrust = makeMemory({ sourceTrust: "unverified" });
    const highTrust = makeMemory({ sourceTrust: "human_approved" });
    const l = scoreMemory(hit(0.5), lowTrust, request, DEFAULT_RANKING_CONFIG);
    const h = scoreMemory(hit(0.5), highTrust, request, DEFAULT_RANKING_CONFIG);
    expect(h.score).toBeGreaterThan(l.score);
  });

  it("never returns a negative score", () => {
    const expired = makeMemory({ status: "expired", sourceTrust: "unverified" });
    const s = scoreMemory(hit(0.01), expired, request, DEFAULT_RANKING_CONFIG);
    expect(s.score).toBeGreaterThanOrEqual(0);
  });

  it("respects custom ranking weights", () => {
    const weights: MemoryRankingConfig = {
      ...DEFAULT_RANKING_CONFIG,
      wImportance: 10,
      wConfidence: 0,
      wSemanticSimilarity: 0,
      wTaskRelevance: 0,
      wFreshness: 0,
      wRepoAffinity: 0,
      wPathAffinity: 0,
    };
    const low = scoreMemory(hit(0.5), makeMemory({ importance: 0.1 }), request, weights);
    const high = scoreMemory(hit(0.5), makeMemory({ importance: 0.9 }), request, weights);
    expect(high.score).toBeGreaterThan(low.score);
  });
});
