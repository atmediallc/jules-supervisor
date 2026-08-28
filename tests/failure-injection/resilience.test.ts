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

describe("Failure Injection & Resilience Tests", () => {
  it("gracefully handles AI provider throwing network/parse error", async () => {
    const config = EnvSchema.parse({
      SUPERVISOR_MODE: "DRY_RUN",
    });

    const julesClient = new MockJulesClient();
    const aiProvider = new MockAiDecisionProvider();
    aiProvider.shouldFailWithError = new Error("AI provider rate limit 429: quota exceeded");

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

    const session = createMockSession({ id: "ses_fail_001", state: "AWAITING_USER_INPUT" });
    const activity = createMockActivity({ id: "act_fail_001", sessionId: "ses_fail_001" });

    await expect(pipeline.processActivity({ session, activity })).rejects.toThrow(
      "AI provider rate limit 429",
    );
  });

  it("aborts execution if Jules session state changes before execution dispatch", async () => {
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

    const session = createMockSession({ id: "ses_stale_001", state: "AWAITING_USER_INPUT" });
    const activity = createMockActivity({ id: "act_stale_001", sessionId: "ses_stale_001" });

    // Seed session in mock client, but mutate state to COMPLETED before execution completes
    julesClient.sessions.set(session.id, {
      ...session,
      state: "COMPLETED",
    });

    await expect(pipeline.processActivity({ session, activity })).rejects.toThrow(
      "Session state changed from AWAITING_USER_INPUT to COMPLETED before execution",
    );

    // Ensure no message was sent to the completed session
    expect(julesClient.sentMessages).toHaveLength(0);
  });
});
