import { describe, expect, it } from "vitest";
import { MockAiDecisionProvider } from "@jules/ai";
import { EnvSchema } from "@jules/config";
import { MockJulesClient } from "@jules/jules-client";
import { PolicyEngine } from "@jules/policy";
import {
  createMockActivity,
  createMockRepositories,
  createMockSession,
  InMemoryRepositoryStore,
} from "@jules/test-utils";
import { InMemoryDistributedLock } from "../../apps/worker/src/lock.js";
import { SupervisionPipeline } from "../../apps/worker/src/pipeline.js";

describe("Concurrency & Race Condition Defenses", () => {
  it("prevents race condition and duplicate execution when multiple workers process same event simultaneously", async () => {
    const config = EnvSchema.parse({
      SUPERVISOR_MODE: "AUTO_RESPOND",
      AUTO_RESPOND_ENABLED: "true",
    });

    const julesClient = new MockJulesClient();
    const aiProvider = new MockAiDecisionProvider();
    const policyEngine = new PolicyEngine();
    const store = new InMemoryRepositoryStore();
    const lock = new InMemoryDistributedLock();

    const pipeline = new SupervisionPipeline({
      config,
      julesClient,
      aiProvider,
      policyEngine,
      ...createMockRepositories(store),
      lock,
    });

    const session = createMockSession({ id: "ses_race_001", state: "AWAITING_USER_INPUT" });
    const activity = createMockActivity({ id: "act_race_001", sessionId: "ses_race_001" });
    julesClient.sessions.set(session.id, session);

    // Simulate 5 parallel workers receiving the exact same activity simultaneously
    const workerPromises = Array.from({ length: 5 }, () =>
      pipeline.processActivity({ session, activity }),
    );

    const results = await Promise.all(workerPromises);

    // Exactly 1 execution must occur against Jules API
    expect(julesClient.sentMessages).toHaveLength(1);

    // All worker results should reference the same decision ID
    const decisionIds = results.map((r) => r?.decisionId);
    expect(new Set(decisionIds).size).toBe(1);

    // Exactly 1 decision record persisted in database
    const storedDecisions = await store.listDecisions();
    expect(storedDecisions).toHaveLength(1);
  });
});
