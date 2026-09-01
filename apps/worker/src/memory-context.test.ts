import { describe, expect, it } from "vitest";
import { InMemoryMemoryStore, createMockMemoryRepositories } from "@jules/test-utils";
import { metrics } from "@jules/observability";
import { MemoryContextService, MemoryRetrievalConfig } from "./memory-context.js";

const CONFIG: MemoryRetrievalConfig = {
  maxSuccess: 5,
  maxHumanReviewed: 3,
  maxFailures: 2,
  maxKnowledgeItems: 10,
};

function makeService(store: InMemoryMemoryStore) {
  const { decisionRepo, knowledgeRepo } = createMockMemoryRepositories(store);
  return new MemoryContextService(decisionRepo, knowledgeRepo, CONFIG);
}

function seedDecision(
  store: InMemoryMemoryStore,
  args: {
    id: string;
    sessionId: string;
    repositoryId: string;
    action: string;
    outcome: string | null;
    humanAction?: string | null;
    proposedResponse?: string;
    finalApprovedResponse?: string;
    outcomeObservedAt?: Date;
    humanReviewedAt?: Date | null;
  },
): void {
  store.decisions.push({
    id: args.id,
    sessionId: args.sessionId,
    activityId: "act_x",
    idempotencyKey: `idem_${args.id}`,
    action: args.action,
    proposedResponse: args.proposedResponse ?? "proposed text",
    finalApprovedResponse: args.finalApprovedResponse ?? null,
    precedentDecisionIds: [],
    repositoryKnowledgeIds: [],
    risk: "low",
    confidence: 0.9,
    reason: "test",
    evidence: [],
    concerns: [],
    provider: "mock",
    model: "mock",
    contextDigest: "digest",
    executionState: "EXECUTED",
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
    aiLatencyMs: 0,
    humanAction: args.humanAction ?? null,
    humanReviewedAt: args.humanReviewedAt ?? null,
    outcome: args.outcome,
    outcomeObservedAt: args.outcomeObservedAt ?? new Date("2026-01-01T00:00:00Z"),
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  });
}

describe("MemoryContextService", () => {
  it("returns empty memory when the repository has no history", async () => {
    const store = new InMemoryMemoryStore();
    store.repositoryBySession.set("ses_none", "owner/repo");
    const service = makeService(store);

    const result = await service.retrieve("owner/repo", "ses_none");
    expect(result.historicalPrecedents).toEqual([]);
    expect(result.repositoryKnowledge).toEqual([]);
    expect(result.precedentDecisionIds).toEqual([]);
    expect(result.repositoryKnowledgeIds).toEqual([]);
  });

  it("classifies and returns precedents with sanitized excerpts", async () => {
    const store = new InMemoryMemoryStore();
    store.repositoryBySession.set("ses_prev", "owner/repo");
    seedDecision(store, {
      id: "dec_ok",
      sessionId: "ses_prev",
      repositoryId: "owner/repo",
      action: "RESPOND",
      outcome: "SUCCESS",
      humanAction: "APPROVED_UNCHANGED",
      humanReviewedAt: new Date("2026-02-01T00:00:00Z"),
      finalApprovedResponse: "Use pnpm exec vitest run for tests.",
      outcomeObservedAt: new Date("2026-02-01T00:00:00Z"),
    });

    const service = makeService(store);
    const result = await service.retrieve("owner/repo", "ses_cur");
    expect(result.historicalPrecedents.length).toBe(1);
    const p = result.historicalPrecedents[0]!;
    expect(p.outcomeClass).toBe("HUMAN_APPROVED_SUCCESS");
    expect(p.humanReviewed).toBe(true);
    expect(p.excerpt).toContain("Use pnpm exec vitest run");
    expect(result.precedentDecisionIds).toEqual(["dec_ok"]);
  });

  it("excludes the current session's own decisions (no self-reference)", async () => {
    const store = new InMemoryMemoryStore();
    store.repositoryBySession.set("ses_cur", "owner/repo");
    store.repositoryBySession.set("ses_prev", "owner/repo");
    seedDecision(store, {
      id: "dec_self",
      sessionId: "ses_cur",
      repositoryId: "owner/repo",
      action: "RESPOND",
      outcome: "SUCCESS",
    });
    seedDecision(store, {
      id: "dec_other",
      sessionId: "ses_prev",
      repositoryId: "owner/repo",
      action: "RESPOND",
      outcome: "SUCCESS",
    });

    const service = makeService(store);
    const result = await service.retrieve("owner/repo", "ses_cur");
    expect(result.precedentDecisionIds).toEqual(["dec_other"]);
  });

  it("never returns another repository's decisions (cross-repository isolation)", async () => {
    const store = new InMemoryMemoryStore();
    store.repositoryBySession.set("ses_a", "owner/alpha");
    store.repositoryBySession.set("ses_b", "owner/beta");
    seedDecision(store, {
      id: "dec_alpha",
      sessionId: "ses_a",
      repositoryId: "owner/alpha",
      action: "RESPOND",
      outcome: "SUCCESS",
    });
    seedDecision(store, {
      id: "dec_beta",
      sessionId: "ses_b",
      repositoryId: "owner/beta",
      action: "RESPOND",
      outcome: "SUCCESS",
    });

    const service = makeService(store);
    const betaResult = await service.retrieve("owner/beta", "ses_new");
    expect(betaResult.precedentDecisionIds).toEqual(["dec_beta"]);

    const alphaResult = await service.retrieve("owner/alpha", "ses_new");
    expect(alphaResult.precedentDecisionIds).toEqual(["dec_alpha"]);
  });

  it("redacts secrets inside precedent excerpts (inherited from prior sessions)", async () => {
    const store = new InMemoryMemoryStore();
    store.repositoryBySession.set("ses_prev", "owner/repo");
    seedDecision(store, {
      id: "dec_secret",
      sessionId: "ses_prev",
      repositoryId: "owner/repo",
      action: "RESPOND",
      outcome: "SUCCESS",
      finalApprovedResponse: "The deploy key is Authorization: Bearer sk-secret99secret99secret99",
    });

    const service = makeService(store);
    const result = await service.retrieve("owner/repo", "ses_cur");
    const allExcerpts = result.historicalPrecedents.map((p) => p.excerpt).join(" ");
    expect(allExcerpts).not.toContain("sk-secret99secret99secret99");
    expect(allExcerpts).toContain("[REDACTED]");
  });

  it("caps precedent excerpts at PRECEDENT_EXCERPT_MAX_CHARS", async () => {
    const store = new InMemoryMemoryStore();
    store.repositoryBySession.set("ses_prev", "owner/repo");
    seedDecision(store, {
      id: "dec_long",
      sessionId: "ses_prev",
      repositoryId: "owner/repo",
      action: "RESPOND",
      outcome: "SUCCESS",
      finalApprovedResponse: "L".repeat(5_000),
    });

    const service = makeService(store);
    const result = await service.retrieve("owner/repo", "ses_cur");
    expect(result.historicalPrecedents[0]!.excerpt.length).toBeLessThanOrEqual(1_500);
  });

  it("degrades to empty memory (and counts the failure) when the repos throw", async () => {
    const failingDecisionRepo = {
      findPrecedents: () => {
        throw new Error("db down");
      },
    };
    const failingKnowledgeRepo = {
      listActive: () => {
        throw new Error("db down");
      },
    };
    const service = new MemoryContextService(
      failingDecisionRepo as never,
      failingKnowledgeRepo as never,
      CONFIG,
    );
    metrics.reset();

    const result = await service.retrieve("owner/repo", "ses_cur");
    expect(result.historicalPrecedents).toEqual([]);
    expect(result.repositoryKnowledge).toEqual([]);
    const snapshot = metrics.getSnapshot();
    expect(snapshot.memoryRetrievalFailuresTotal).toBe(2);
    expect(snapshot.precedentQueriesTotal).toBe(1);
    expect(snapshot.knowledgeQueriesTotal).toBe(1);
    metrics.reset();
  });

  it("respects per-class quotas (failures never displace successes)", async () => {
    const store = new InMemoryMemoryStore();
    store.repositoryBySession.set("ses_prev", "owner/repo");
    for (let i = 0; i < 6; i++) {
      seedDecision(store, {
        id: `dec_fail_${i}`,
        sessionId: "ses_prev",
        repositoryId: "owner/repo",
        action: "RESPOND",
        outcome: "REJECTED",
        outcomeObservedAt: new Date(`2026-03-0${(i % 8) + 1}T00:00:00Z`),
      });
    }
    seedDecision(store, {
      id: "dec_success",
      sessionId: "ses_prev",
      repositoryId: "owner/repo",
      action: "RESPOND",
      outcome: "SUCCESS",
    });

    const service = makeService(store);
    const result = await service.retrieve("owner/repo", "ses_cur");
    // maxFailures = 2 → only 2 REJECTED + the success must still be there.
    const classes = result.historicalPrecedents.map((p) => p.outcomeClass);
    expect(classes.filter((c) => c === "HUMAN_REJECTED").length).toBe(2);
    expect(classes).toContain("AUTOMATED_ACCEPTED");
  });

  it("returns repository knowledge sanitized and capped", async () => {
    const store = new InMemoryMemoryStore();
    const { knowledgeRepo } = createMockMemoryRepositories(store);
    await knowledgeRepo.upsert({
      id: "kn_1",
      repositoryId: "owner/repo",
      knowledgeType: "TEST_COMMAND",
      trustLevel: "HUMAN_VERIFIED",
      content: "Token Authorization: Bearer sk-knsecret123456789 must not leak",
      sourcePath: "AGENTS.md",
    });
    store.repositoryBySession.set("ses_cur", "owner/repo");

    const service = makeService(store);
    const result = await service.retrieve("owner/repo", "ses_cur");
    expect(result.repositoryKnowledge.length).toBe(1);
    const k = result.repositoryKnowledge[0]!;
    expect(k.trustLevel).toBe("HUMAN_VERIFIED");
    expect(k.knowledgeType).toBe("TEST_COMMAND");
    expect(k.content).not.toContain("sk-knsecret123456789");
    expect(k.content).toContain("[REDACTED]");
    expect(result.repositoryKnowledgeIds).toEqual(["kn_1"]);
  });

  it("never returns knowledge from another repository", async () => {
    const store = new InMemoryMemoryStore();
    const { knowledgeRepo } = createMockMemoryRepositories(store);
    await knowledgeRepo.upsert({
      id: "kn_alpha",
      repositoryId: "owner/alpha",
      knowledgeType: "CONVENTION",
      trustLevel: "HUMAN_VERIFIED",
      content: "alpha convention",
      sourcePath: "AGENTS.md",
    });
    await knowledgeRepo.upsert({
      id: "kn_beta",
      repositoryId: "owner/beta",
      knowledgeType: "CONVENTION",
      trustLevel: "HUMAN_VERIFIED",
      content: "beta convention",
      sourcePath: "AGENTS.md",
    });
    store.repositoryBySession.set("ses_cur", "owner/beta");

    const service = makeService(store);
    const result = await service.retrieve("owner/beta", "ses_cur");
    expect(result.repositoryKnowledgeIds).toEqual(["kn_beta"]);
    const contents = result.repositoryKnowledge.map((k) => k.content).join(" ");
    expect(contents).not.toContain("alpha convention");
  });
});
