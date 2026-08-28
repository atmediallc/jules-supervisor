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

describe("Milestone 1 — DRY_RUN Full Vertical Slice E2E", () => {
  it("executes the full lifecycle: Ingest -> Context -> AI -> Policy -> Risk -> DRY_RUN Audit", async () => {
    const config = EnvSchema.parse({
      SUPERVISOR_MODE: "DRY_RUN",
      AUTO_RESPOND_ENABLED: "false",
      AUTO_PLAN_APPROVAL_ENABLED: "false",
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

    // 1. Session requesting feedback
    const session = createMockSession({
      id: "ses_e2e_001",
      repository: "octocat/project",
      prompt: "Add rate limiting",
      state: "AWAITING_USER_INPUT",
    });

    const activity = createMockActivity({
      id: "act_e2e_001",
      sessionId: "ses_e2e_001",
      content: "Should rate limiting apply per IP or per authenticated user?",
    });

    // 2. Process through Supervisor pipeline
    const result = await pipeline.processActivity({ session, activity });

    // 3. Verify assertions
    expect(result).not.toBeNull();
    expect(result?.action).toBe("RESPOND");
    expect(result?.executed).toBe(false); // MUST NOT execute under DRY_RUN
    expect(result?.executionGate.reason).toContain("DRY_RUN");

    // 4. Verify Zero Mutations occurred on Jules API
    expect(julesClient.sentMessages).toHaveLength(0);
    expect(julesClient.approvedPlans).toHaveLength(0);

    // 5. Verify Persistence & Audit Trail
    const storedSession = await store.getSession("ses_e2e_001");
    expect(storedSession).not.toBeNull();

    const storedDecisions = await store.listDecisions();
    expect(storedDecisions).toHaveLength(1);
    expect(storedDecisions[0]!.executionState).toBe("DRY_RUN_COMPLETED");
    expect(storedDecisions[0]!.contextDigest).toHaveLength(64);

    const auditTrail = await store.listAuditEvents();
    expect(auditTrail).toHaveLength(1);
    expect(auditTrail[0]!.targetId).toBe("ses_e2e_001");
  });
});
