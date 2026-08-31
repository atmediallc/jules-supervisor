import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MockAiDecisionProvider } from "@jules/ai";
import { EnvSchema } from "@jules/config";
import { MockJulesClient } from "@jules/jules-client";
import { PolicyEngine } from "@jules/policy";
import {
  getDatabase,
  closeDatabase,
  SessionRepository,
  ActivityRepository,
  DecisionRepository,
  ApprovalRepository,
  AuditRepository,
  BudgetRepository,
} from "@jules/db";
import { Redis } from "ioredis";
import { RedisDistributedLock } from "../../apps/worker/src/lock.js";
import { SupervisionPipeline } from "../../apps/worker/src/pipeline.js";
import { createMockActivity, createMockSession } from "@jules/test-utils";

const TEST_DB_URL =
  process.env["DATABASE_URL"] ||
  "postgresql://jules_user:jules_password@127.0.0.1:5439/jules_supervisor?sslmode=disable";
const REDIS_URL = process.env["REDIS_URL"] || "redis://127.0.0.1:6389";

describe("Supervision Pipeline with Real PostgreSQL 16 and Real Redis", () => {
  let db: ReturnType<typeof getDatabase>;
  let redisClient: Redis;
  let lock: RedisDistributedLock;
  let sessionRepo: SessionRepository;
  let activityRepo: ActivityRepository;
  let decisionRepo: DecisionRepository;
  let approvalRepo: ApprovalRepository;
  let auditRepo: AuditRepository;
  let budgetRepo: BudgetRepository;

  beforeAll(async () => {
    db = getDatabase(TEST_DB_URL);
    redisClient = new Redis(REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: null });
    await redisClient.connect();

    lock = new RedisDistributedLock(redisClient);
    sessionRepo = new SessionRepository(db);
    activityRepo = new ActivityRepository(db);
    decisionRepo = new DecisionRepository(db);
    approvalRepo = new ApprovalRepository(db);
    auditRepo = new AuditRepository(db);
    budgetRepo = new BudgetRepository(db);
  });

  afterAll(async () => {
    await redisClient.quit();
    await closeDatabase();
  });

  it("executes full DRY_RUN lifecycle against real PostgreSQL & Redis with ZERO mutations", async () => {
    const config = EnvSchema.parse({
      SUPERVISOR_MODE: "DRY_RUN",
      AUTO_RESPOND_ENABLED: "false",
      AUTO_PLAN_APPROVAL_ENABLED: "false",
    });

    const julesClient = new MockJulesClient();
    const aiProvider = new MockAiDecisionProvider();
    const policyEngine = new PolicyEngine();

    const pipeline = new SupervisionPipeline({
      config,
      julesClient,
      aiProvider,
      policyEngine,
      sessionRepo,
      activityRepo,
      decisionRepo,
      approvalRepo,
      auditRepo,
      budgetRepo,
      lock,
    });

    const testId = `real_${Date.now()}`;
    const session = createMockSession({
      id: `ses_${testId}`,
      repository: "octocat/real-service-repo",
      prompt: "Implement database audit logging",
      state: "AWAITING_USER_INPUT",
    });

    const activity = createMockActivity({
      id: `act_${testId}`,
      sessionId: session.id,
      content: "Should we log raw payloads or sanitized payloads?",
    });

    const result = await pipeline.processActivity({ session, activity });

    // Assertions
    expect(result).not.toBeNull();
    expect(result?.action).toBe("RESPOND");
    expect(result?.executed).toBe(false);
    expect(result?.executionGate.reason).toContain("DRY_RUN");

    // Zero mutations against Jules API
    expect(julesClient.sentMessages).toHaveLength(0);
    expect(julesClient.approvedPlans).toHaveLength(0);

    // Verify real PostgreSQL persistence
    const persistedSession = await sessionRepo.findById(session.id);
    expect(persistedSession).not.toBeNull();
    expect(persistedSession?.id).toBe(session.id);

    const persistedDecision = await decisionRepo.findById(result!.decisionId);
    expect(persistedDecision).not.toBeNull();
    expect(persistedDecision?.executionState).toBe("DRY_RUN_COMPLETED");
    expect(persistedDecision?.sessionId).toBe(session.id);

    // Verify duplicate activity idempotency over real Postgres
    const duplicateResult = await pipeline.processActivity({ session, activity });
    expect(duplicateResult?.decisionId).toBe(result?.decisionId);
    expect(duplicateResult?.executionGate.reason).toContain("Already processed");
    expect(julesClient.sentMessages).toHaveLength(0);
  });

  it("routes decision to Real PostgreSQL Approval Queue in ASSISTED mode", async () => {
    const config = EnvSchema.parse({
      SUPERVISOR_MODE: "ASSISTED",
      AUTO_RESPOND_ENABLED: "false",
    });

    const julesClient = new MockJulesClient();
    const aiProvider = new MockAiDecisionProvider();
    const policyEngine = new PolicyEngine();

    const pipeline = new SupervisionPipeline({
      config,
      julesClient,
      aiProvider,
      policyEngine,
      sessionRepo,
      activityRepo,
      decisionRepo,
      approvalRepo,
      auditRepo,
      budgetRepo,
      lock,
    });

    const testId = `assist_${Date.now()}`;
    const session = createMockSession({
      id: `ses_${testId}`,
      repository: "octocat/assisted-real-repo",
      prompt: "Configure human review",
      state: "AWAITING_USER_INPUT",
    });

    const activity = createMockActivity({
      id: `act_${testId}`,
      sessionId: session.id,
      content: "Would you like me to enable strict auth?",
    });

    const result = await pipeline.processActivity({ session, activity });

    expect(result?.requiresHumanReview).toBe(true);
    expect(result?.executed).toBe(false);

    // Verify approval request was created in real Postgres
    const pendingApprovals = await approvalRepo.listPending();
    const matching = pendingApprovals.find((a) => a.sessionId === session.id);
    expect(matching).toBeDefined();
    expect(matching?.status).toBe("PENDING");
  });
});
