import { describe, expect, it } from "vitest";
import { MockAiDecisionProvider } from "@jules/ai";
import { EnvSchema } from "@jules/config";
import {
  JulesActivity,
  JulesSession,
  MockJulesClient,
  SendMessageRequest,
} from "@jules/jules-client";
import { PolicyEngine } from "@jules/policy";
import { createMockRepositories, InMemoryRepositoryStore } from "@jules/test-utils";
import { InMemoryDistributedLock } from "./lock.js";
import { SupervisionPipeline } from "./pipeline.js";
import { SessionWatcher } from "./poller.js";

/**
 * A MockJulesClient whose `sendMessage` records the external mutation but does
 * NOT flip the session state to IN_PROGRESS. In a real deployment, the worker
 * auto-responding to a session awaiting user input does not move the session
 * out of AWAITING_USER_INPUT (the human still owes a reply), so multiple
 * accumulated AGENT_MESSAGE activities must all be reconciled. The stock mock
 * flips state as a simulation artifact that would break catch-up.
 */
class StableMockJulesClient extends MockJulesClient {
  public override async sendMessage(
    sessionId: string,
    request: SendMessageRequest,
  ): Promise<JulesActivity> {
    const err = this.hooks.shouldFail?.("sendMessage");
    if (err) throw err;
    this.hooks.onSendMessage?.(sessionId, request);
    this.sentMessages.push({ sessionId, request });

    const newActivity: JulesActivity = {
      id: `act_mock_${Date.now()}`,
      sessionId,
      type: "USER_MESSAGE",
      content: request.message,
      createTime: new Date().toISOString(),
    };
    const acts = this.activities.get(sessionId) || [];
    acts.push(newActivity);
    this.activities.set(sessionId, acts);
    return newActivity;
  }
}

function setupWatcher(mode: "DRY_RUN" | "ASSISTED" | "AUTO_RESPOND" | "FULL_AUTO" = "FULL_AUTO") {
  const config = EnvSchema.parse({
    SUPERVISOR_MODE: mode,
    AUTO_RESPOND_ENABLED: mode === "AUTO_RESPOND" || mode === "FULL_AUTO" ? "true" : "false",
    AUTO_PLAN_APPROVAL_ENABLED: mode === "FULL_AUTO" ? "true" : "false",
    RECONCILIATION_PAGE_SIZE: "100",
  });

  const julesClient = new StableMockJulesClient();
  const aiProvider = new MockAiDecisionProvider();
  const policyEngine = new PolicyEngine();
  const store = new InMemoryRepositoryStore();
  const lock = new InMemoryDistributedLock();
  const repos = createMockRepositories(store);

  const pipeline = new SupervisionPipeline({
    config,
    julesClient,
    aiProvider,
    policyEngine,
    ...repos,
    workerId: "test-worker",
    lock,
  });

  return {
    config,
    store,
    julesClient,
    pipeline,
    checkpointRepo: repos.checkpointRepo,
  };
}

function seedSession(
  julesClient: MockJulesClient,
  sessionId: string,
  activityContents: string[],
): void {
  // Remove default seeded data so counts are deterministic for this session.
  julesClient.sessions.clear();
  julesClient.activities.clear();

  const session: JulesSession = {
    id: sessionId,
    name: `sessions/${sessionId}`,
    title: "Reconciliation fixture",
    repository: "owner/repo",
    branch: "main",
    prompt: "Reconcile multiple activities",
    state: "AWAITING_USER_INPUT",
    createTime: new Date().toISOString(),
    updateTime: new Date().toISOString(),
    metadata: {},
  };
  julesClient.sessions.set(sessionId, session);

  julesClient.activities.set(
    sessionId,
    activityContents.map((content, i) => ({
      id: `act_${String.fromCharCode(97 + i)}_${sessionId}`,
      sessionId,
      type: "AGENT_MESSAGE",
      content,
      createTime: new Date(Date.now() - (activityContents.length - i) * 1000).toISOString(),
    })),
  );
}

describe("SessionWatcher reconciliation", () => {
  it("reconciles ALL accumulated activities (not just the last) after downtime", async () => {
    const { config, store, julesClient, pipeline, checkpointRepo } = setupWatcher("FULL_AUTO");
    seedSession(julesClient, "ses_recon_001", ["A", "B", "C"]);
    const watcher = new SessionWatcher(config, julesClient, pipeline, checkpointRepo);

    // The worker was offline while A, B and C all arrived. A single sync must
    // catch up on every one of them, not merely the most recent.
    await watcher.syncActiveSessions();

    const decisions = await store.listDecisions();
    expect(decisions.length).toBe(3);
    // In FULL_AUTO every decision auto-executes an external message.
    expect(julesClient.sentMessages.length).toBe(3);
    // Each activity produced its own decision row (distinct idempotency keys).
    const keys = new Set(decisions.map((d) => d.idempotencyKey));
    expect(keys.size).toBe(3);

    // The per-session cursor advanced to the last activity.
    const cp = await checkpointRepo.getBySession("ses_recon_001");
    expect(cp?.lastActivityId).toBeTruthy();
  });

  it("RECONCILIATION_REPLAY_IDEMPOTENT: re-running sync does not double-execute", async () => {
    const { config, store, julesClient, pipeline } = setupWatcher("FULL_AUTO");
    seedSession(julesClient, "ses_recon_002", ["A", "B", "C"]);

    // Watcher WITHOUT a checkpoint cursor: both sync passes re-feed every
    // activity through the pipeline, so the pipeline's deterministic
    // idempotency key must prevent duplicate external mutations.
    const watcher = new SessionWatcher(config, julesClient, pipeline);

    await watcher.syncActiveSessions();
    const decisionsAfterFirst = await store.listDecisions();
    expect(decisionsAfterFirst.length).toBe(3);
    expect(julesClient.sentMessages.length).toBe(3);

    // Replay the same reconciliation pass.
    await watcher.syncActiveSessions();

    const decisionsAfterReplay = await store.listDecisions();
    expect(decisionsAfterReplay.length).toBe(3); // no new decisions created
    expect(julesClient.sentMessages.length).toBe(3); // no duplicate external mutations
    expect(julesClient.approvedPlans.length).toBe(0);
  });

  it("respects a persisted checkpoint and skips already-seen activities", async () => {
    const { config, store, julesClient, pipeline, checkpointRepo } = setupWatcher("FULL_AUTO");
    seedSession(julesClient, "ses_recon_003", ["A", "B", "C"]);

    // Simulate a prior run that already advanced the cursor past A.
    await checkpointRepo.upsert("ses_recon_003", { lastActivityId: "act_a_ses_recon_003" });

    const watcher = new SessionWatcher(config, julesClient, pipeline, checkpointRepo);
    await watcher.syncActiveSessions();

    const decisions = await store.listDecisions();
    // A is skipped by the cursor; B and C are newly processed.
    expect(decisions.length).toBe(2);
    expect(julesClient.sentMessages.length).toBe(2);
  });
});
