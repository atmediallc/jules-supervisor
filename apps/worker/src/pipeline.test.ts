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
import { InMemoryDistributedLock } from "./lock.js";
import { SupervisionPipeline } from "./pipeline.js";

function setupTestPipeline(
  mode: "DRY_RUN" | "ASSISTED" | "AUTO_RESPOND" | "FULL_AUTO" = "DRY_RUN",
) {
  const config = EnvSchema.parse({
    SUPERVISOR_MODE: mode,
    AUTO_RESPOND_ENABLED: mode === "AUTO_RESPOND" || mode === "FULL_AUTO" ? "true" : "false",
    AUTO_PLAN_APPROVAL_ENABLED: mode === "FULL_AUTO" ? "true" : "false",
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

  return { pipeline, store, julesClient, aiProvider };
}

describe("SupervisionPipeline", () => {
  it("processes activity under DRY_RUN mode without calling Jules mutations", async () => {
    const { pipeline, store, julesClient } = setupTestPipeline("DRY_RUN");
    const session = createMockSession({ id: "ses_dry_001", state: "AWAITING_USER_INPUT" });
    const activity = createMockActivity({ id: "act_dry_001", sessionId: "ses_dry_001" });

    const result = await pipeline.processActivity({ session, activity });

    expect(result).not.toBeNull();
    expect(result?.executed).toBe(false);
    expect(result?.action).toBe("RESPOND");

    // Check decisions persisted
    const decisions = await store.listDecisions();
    expect(decisions).toHaveLength(1);
    expect(decisions[0]!.executionState).toBe("DRY_RUN_COMPLETED");

    // Verify Jules API was NOT called for mutations
    expect(julesClient.sentMessages).toHaveLength(0);

    // Verify audit record was created
    const audits = await store.listAuditEvents();
    expect(audits).toHaveLength(1);
    expect(audits[0]!.action).toBe("DECISION_RESPOND");
  });

  it("enforces idempotency on duplicate activity ingestion", async () => {
    const { pipeline, store } = setupTestPipeline("DRY_RUN");
    const session = createMockSession({ id: "ses_idem_001", state: "AWAITING_USER_INPUT" });
    const activity = createMockActivity({ id: "act_idem_001", sessionId: "ses_idem_001" });

    // First ingestion
    const firstResult = await pipeline.processActivity({ session, activity });
    expect(firstResult).not.toBeNull();

    // Second duplicate ingestion
    const secondResult = await pipeline.processActivity({ session, activity });
    expect(secondResult).not.toBeNull();
    expect(secondResult?.decisionId).toBe(firstResult?.decisionId);

    // DB should only have 1 decision
    const decisions = await store.listDecisions();
    expect(decisions).toHaveLength(1);
  });

  it("routes decision to Human Approval Queue in ASSISTED mode", async () => {
    const { pipeline, store } = setupTestPipeline("ASSISTED");
    const session = createMockSession({ id: "ses_assist_001", state: "AWAITING_USER_INPUT" });
    const activity = createMockActivity({ id: "act_assist_001", sessionId: "ses_assist_001" });

    const result = await pipeline.processActivity({ session, activity });

    expect(result?.requiresHumanReview).toBe(true);
    expect(result?.executed).toBe(false);

    const approvals = await store.listPendingApprovals();
    expect(approvals).toHaveLength(1);
    expect(approvals[0]!.sessionId).toBe("ses_assist_001");
  });

  it("auto-executes low-risk response in AUTO_RESPOND mode and updates Jules session", async () => {
    const { pipeline, store, julesClient } = setupTestPipeline("AUTO_RESPOND");
    const session = createMockSession({ id: "ses_auto_001", state: "AWAITING_USER_INPUT" });
    const activity = createMockActivity({ id: "act_auto_001", sessionId: "ses_auto_001" });

    // Seed session in mock client
    julesClient.sessions.set(session.id, session);

    const result = await pipeline.processActivity({ session, activity });

    expect(result?.executed).toBe(true);
    expect(julesClient.sentMessages).toHaveLength(1);
    expect(julesClient.sentMessages[0]!.sessionId).toBe("ses_auto_001");

    const decisions = await store.listDecisions();
    expect(decisions[0]!.executionState).toBe("EXECUTED");
  });

  it("proves DRY_RUN mode enforces ZERO mutations even if both automation flags are explicitly true", async () => {
    const config = EnvSchema.parse({
      SUPERVISOR_MODE: "DRY_RUN",
      AUTO_RESPOND_ENABLED: "true",
      AUTO_PLAN_APPROVAL_ENABLED: "true",
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

    const session = createMockSession({ id: "ses_dry_override", state: "AWAITING_USER_INPUT" });
    const activity = createMockActivity({ id: "act_dry_override", sessionId: "ses_dry_override" });
    julesClient.sessions.set(session.id, session);

    const result = await pipeline.processActivity({ session, activity });

    expect(result?.executed).toBe(false);
    expect(result?.requiresHumanReview).toBe(false);
    expect(julesClient.sentMessages).toHaveLength(0);
    expect(julesClient.approvedPlans).toHaveLength(0);

    const decisions = await store.listDecisions();
    expect(decisions[0]!.executionState).toBe("DRY_RUN_COMPLETED");
  });

  it("proves AUTO_RESPOND mode cannot auto-approve plans and places them in approval queue", async () => {
    const { pipeline, store, julesClient, aiProvider } = setupTestPipeline("AUTO_RESPOND");
    aiProvider.customDecision = {
      action: "APPROVE_PLAN",
      response: "Plan approved",
      risk: "low",
      confidence: 0.95,
      reason: "Low risk plan",
      evidence: [],
      concerns: [],
    };

    const session = createMockSession({ id: "ses_auto_plan", state: "AWAITING_PLAN_APPROVAL" });
    const activity = createMockActivity({
      id: "act_auto_plan",
      sessionId: "ses_auto_plan",
      type: "PLAN_GENERATED",
    });
    julesClient.sessions.set(session.id, session);

    const result = await pipeline.processActivity({ session, activity });

    expect(result?.executed).toBe(false);
    expect(result?.requiresHumanReview).toBe(true);
    expect(julesClient.approvedPlans).toHaveLength(0);

    const approvals = await store.listPendingApprovals();
    expect(approvals).toHaveLength(1);
    expect(approvals[0]!.action).toBe("APPROVE_PLAN");
  });

  it("proves FULL_AUTO mode NEVER auto-executes high or critical risk actions", async () => {
    const { pipeline, store, julesClient, aiProvider } = setupTestPipeline("FULL_AUTO");
    aiProvider.customDecision = {
      action: "RESPOND",
      response: "Dangerous command execution",
      risk: "critical",
      confidence: 0.99,
      reason: "High risk operation",
      evidence: [],
      concerns: [],
    };

    const session = createMockSession({ id: "ses_crit_001", state: "AWAITING_USER_INPUT" });
    const activity = createMockActivity({ id: "act_crit_001", sessionId: "ses_crit_001" });
    julesClient.sessions.set(session.id, session);

    const result = await pipeline.processActivity({ session, activity });

    expect(result?.executed).toBe(false);
    expect(result?.requiresHumanReview).toBe(true);
    expect(julesClient.sentMessages).toHaveLength(0);

    const decisions = await store.listDecisions();
    expect(decisions[0]!.executionState).toBe("AWAITING_APPROVAL");

    const approvals = await store.listPendingApprovals();
    expect(approvals).toHaveLength(1);
    expect(approvals[0]!.sessionId).toBe("ses_crit_001");
  });
});
