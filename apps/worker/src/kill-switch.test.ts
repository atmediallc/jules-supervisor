import { describe, expect, it } from "vitest";
import { MockAiDecisionProvider } from "@jules/ai";
import { EnvSchema } from "@jules/config";
import { KillSwitch, SafetyState, safetyActionForState } from "@jules/db";
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

/**
 * A minimal in-memory SystemSettingsRepository so we can exercise the real
 * KillSwitch without a Postgres instance.
 */
class FakeSettingsRepo {
  private map = new Map<string, { value: string; category: string; isSecret: boolean }>();
  constructor(seed: Record<string, string> = {}) {
    for (const [k, v] of Object.entries(seed)) {
      this.map.set(k, { value: v, category: "safety", isSecret: false });
    }
  }
  async getByKey(key: string) {
    const row = this.map.get(key);
    return row ? { key, value: row.value, category: row.category, isSecret: row.isSecret } : null;
  }
  async upsertMany(rows: { key: string; value: string; category: string; isSecret: boolean }[]) {
    for (const r of rows) this.map.set(r.key, r);
    return rows;
  }
}

function fakeKillSwitch(state?: SafetyState, reason?: string): KillSwitch {
  const seed: Record<string, string> = {};
  if (state) {
    seed["AUTONOMY_SAFETY_STATE"] = state;
    if (reason) seed["AUTONOMY_SAFETY_REASON"] = reason;
  }
  return new KillSwitch(new FakeSettingsRepo(seed) as never);
}

/** A kill switch stub that flips states between calls (pre-AI vs pre-mutation). */
class FlipKillSwitch {
  private calls = 0;
  constructor(
    private readonly first: SafetyState,
    private readonly second: SafetyState,
  ) {}
  async getState() {
    this.calls++;
    const s = this.calls === 1 ? this.first : this.second;
    return { state: s, changedAt: null, changedBy: "test", reason: `flip->${s}` };
  }
  isRunning(rec: { state: SafetyState }) {
    return rec.state === "RUNNING";
  }
}

function setup(mode: "DRY_RUN" | "ASSISTED" | "AUTO_RESPOND" | "FULL_AUTO", killSwitch?: unknown) {
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
    workerId: "test-worker",
    lock,
    killSwitch: killSwitch as never,
  });
  return { pipeline, store, julesClient };
}

describe("KillSwitch service (runtime safety state)", () => {
  it("defaults to RUNNING when no safety row exists", async () => {
    const ks = fakeKillSwitch();
    const state = await ks.getState();
    expect(state.state).toBe("RUNNING");
  });

  it("transitions state and records metadata", async () => {
    const ks = fakeKillSwitch();
    await ks.setState("PAUSED", { by: "operator-1", reason: "nightly maintenance" });
    const state = await ks.getState();
    expect(state.state).toBe("PAUSED");
    expect(state.changedBy).toBe("operator-1");
    expect(state.reason).toBe("nightly maintenance");
    expect(state.changedAt).toBeTruthy();
    expect(ks.isRunning(state)).toBe(false);
  });

  it("isRunning is true only for RUNNING", () => {
    const ks = fakeKillSwitch();
    expect(ks.isRunning({ state: "RUNNING", changedAt: null, changedBy: null, reason: null })).toBe(
      true,
    );
    expect(ks.isRunning({ state: "PAUSED", changedAt: null, changedBy: null, reason: null })).toBe(
      false,
    );
    expect(
      ks.isRunning({ state: "SAFETY_LOCKED", changedAt: null, changedBy: null, reason: null }),
    ).toBe(false);
  });

  it("safetyActionForState maps SAFETY_LOCKED to BLOCK action", () => {
    const guard = safetyActionForState({
      state: "SAFETY_LOCKED",
      changedAt: null,
      changedBy: null,
      reason: "incident",
    });
    expect(guard.action).toBe("BLOCK");
    expect(guard.blocked).toBe(true);
  });

  it("safetyActionForState maps PAUSED to REQUEST_HUMAN escalation", () => {
    const guard = safetyActionForState({
      state: "PAUSED",
      changedAt: null,
      changedBy: null,
      reason: null,
    });
    expect(guard.action).toBe("REQUEST_HUMAN");
    expect(guard.blocked).toBe(false);
  });
});

describe("Kill switch — PRE-AI gate", () => {
  it("refuses to invoke the AI when SAFETY_LOCKED and escalates to BLOCKED", async () => {
    const config = EnvSchema.parse({ SUPERVISOR_MODE: "FULL_AUTO" });
    const julesClient = new MockJulesClient();
    const store = new InMemoryRepositoryStore();
    const aiProvider = new MockAiDecisionProvider();
    let decideInvocations = 0;
    const originalDecide = aiProvider.decide.bind(aiProvider);
    aiProvider.decide = async (context) => {
      decideInvocations++;
      return originalDecide(context);
    };
    const pipeline = new SupervisionPipeline({
      config,
      julesClient,
      aiProvider,
      policyEngine: new PolicyEngine(),
      ...createMockRepositories(store),
      workerId: "test-worker",
      lock: new InMemoryDistributedLock(),
      killSwitch: fakeKillSwitch("SAFETY_LOCKED", "security incident"),
    });

    const session = createMockSession({ id: "ses_ks_001", state: "AWAITING_USER_INPUT" });
    const activity = createMockActivity({ id: "act_ks_001", sessionId: "ses_ks_001" });
    const result = await pipeline.processActivity({ session, activity });

    expect(result).not.toBeNull();
    expect(result?.action).toBe("BLOCK");
    expect(result?.executed).toBe(false);
    // Assert no external mutation happened despite FULL_AUTO.
    expect(julesClient.sentMessages).toHaveLength(0);
    expect(julesClient.approvedPlans).toHaveLength(0);
    // The decision persisted is a safety-interlock BLOCK — never auto-executed.
    const decisions = await store.listDecisions();
    expect(decisions).toHaveLength(1);
    expect(decisions[0]!.action).toBe("BLOCK");
    expect(decisions[0]!.executionState).not.toBe("EXECUTED");
    expect(decisions[0]!.executionState).not.toBe("EXECUTING");
    // Assert the AI provider was NOT invoked (safety pre-AI gate).
    expect(decideInvocations).toBe(0);
  });
});

describe("Kill switch — REQUIRED PRE-MUTATION gate", () => {
  it("refuses the external mutation when the switch flips between AI call and execution", async () => {
    // Matches FULL_AUTO so the gate would normally auto-execute RESPOND.
    // The FlipKillSwitch returns RUNNING for the pre-AI check, then
    // SAFETY_LOCKED for the pre-mutation re-check — proving the mutation is
    // independently guarded even if the AI already produced an action.
    const { pipeline, julesClient } = setup(
      "FULL_AUTO",
      new FlipKillSwitch("RUNNING", "SAFETY_LOCKED"),
    );

    const session = createMockSession({ id: "ses_ks_premut", state: "AWAITING_USER_INPUT" });
    const activity = createMockActivity({ id: "act_ks_premut", sessionId: "ses_ks_premut" });

    // The pre-mutation safety block throws, so processActivity rejects.
    await expect(pipeline.processActivity({ session, activity })).rejects.toThrow(
      /pre-mutation safety block/i,
    );

    // The critical assertion: NO external mutation was performed.
    expect(julesClient.sentMessages).toHaveLength(0);
    expect(julesClient.approvedPlans).toHaveLength(0);
  });

  it("does not mutate when PAUSED lands before execution", async () => {
    const { pipeline, julesClient } = setup(
      "FULL_AUTO",
      new FlipKillSwitch("RUNNING", "PAUSED"),
    );

    const session = createMockSession({ id: "ses_ks_premut2", state: "AWAITING_USER_INPUT" });
    const activity = createMockActivity({ id: "act_ks_premut2", sessionId: "ses_ks_premut2" });

    await expect(pipeline.processActivity({ session, activity })).rejects.toThrow(
      /pre-mutation safety block/i,
    );
    expect(julesClient.sentMessages).toHaveLength(0);
    expect(julesClient.approvedPlans).toHaveLength(0);
  });
});
