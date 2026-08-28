import { describe, expect, it } from "vitest";
import { evaluateExecutionGate, ExecutionMode, DecisionAction, RiskLevel } from "@jules/core";
import { PolicyEngine } from "@jules/policy";

describe("Execution Modes & Policy Authority Exhaustive Matrix", () => {
  const modes: ExecutionMode[] = ["DISABLED", "DRY_RUN", "ASSISTED", "AUTO_RESPOND", "FULL_AUTO"];
  const actions: DecisionAction[] = [
    "RESPOND",
    "APPROVE_PLAN",
    "REQUEST_CHANGES",
    "REQUEST_HUMAN",
    "IGNORE",
    "BLOCK",
  ];
  const riskLevels: RiskLevel[] = ["low", "medium", "high", "critical"];
  const confidenceLevels = [0.5, 0.85, 0.95];
  const toggles = [
    { autoRespond: false, autoPlan: false },
    { autoRespond: true, autoPlan: false },
    { autoRespond: false, autoPlan: true },
    { autoRespond: true, autoPlan: true },
  ];

  describe("Core Invariant 1: Hard veto and CRITICAL risk always win (zero auto-execution)", () => {
    for (const mode of modes) {
      for (const action of actions) {
        for (const toggle of toggles) {
          it(`never auto-executes on CRITICAL risk [mode=${mode}, action=${action}, autoResp=${toggle.autoRespond}, autoPlan=${toggle.autoPlan}]`, () => {
            const gate = evaluateExecutionGate(action, "critical", 0.99, {
              mode,
              autoRespondEnabled: toggle.autoRespond,
              autoPlanApprovalEnabled: toggle.autoPlan,
            });
            expect(gate.autoExecuted).toBe(false);
            if (mode !== "DISABLED" && mode !== "DRY_RUN") {
              expect(gate.blocked).toBe(true);
            }
          });
        }
      }
    }
  });

  describe("Core Invariant 2: HIGH risk never auto-executes", () => {
    for (const mode of modes) {
      for (const action of actions) {
        for (const toggle of toggles) {
          it(`never auto-executes on HIGH risk [mode=${mode}, action=${action}]`, () => {
            const gate = evaluateExecutionGate(action, "high", 0.99, {
              mode,
              autoRespondEnabled: toggle.autoRespond,
              autoPlanApprovalEnabled: toggle.autoPlan,
            });
            expect(gate.autoExecuted).toBe(false);
          });
        }
      }
    }
  });

  describe("Core Invariant 3: DRY_RUN never auto-executes under any combination", () => {
    for (const action of actions) {
      for (const risk of riskLevels) {
        for (const conf of confidenceLevels) {
          for (const toggle of toggles) {
            it(`guarantees DRY_RUN zero mutations [action=${action}, risk=${risk}, conf=${conf}, toggles=${JSON.stringify(toggle)}]`, () => {
              const gate = evaluateExecutionGate(action, risk, conf, {
                mode: "DRY_RUN",
                autoRespondEnabled: toggle.autoRespond,
                autoPlanApprovalEnabled: toggle.autoPlan,
              });
              expect(gate.autoExecuted).toBe(false);
            });
          }
        }
      }
    }
  });

  describe("Core Invariant 4: AUTO_RESPOND cannot approve plans or execute non-response actions", () => {
    for (const action of actions.filter((a) => a !== "RESPOND")) {
      for (const risk of riskLevels) {
        for (const toggle of toggles) {
          it(`prevents AUTO_RESPOND from auto-executing ${action} [risk=${risk}]`, () => {
            const gate = evaluateExecutionGate(action, risk, 0.95, {
              mode: "AUTO_RESPOND",
              autoRespondEnabled: toggle.autoRespond,
              autoPlanApprovalEnabled: toggle.autoPlan,
            });
            expect(gate.autoExecuted).toBe(false);
          });
        }
      }
    }
  });

  describe("Core Invariant 5: Plan approval requires its independent toggle in FULL_AUTO", () => {
    it("permits low-risk plan approval only when autoPlanApprovalEnabled is TRUE", () => {
      const allowedGate = evaluateExecutionGate("APPROVE_PLAN", "low", 0.95, {
        mode: "FULL_AUTO",
        autoPlanApprovalEnabled: true,
      });
      expect(allowedGate.autoExecuted).toBe(true);

      const deniedGate = evaluateExecutionGate("APPROVE_PLAN", "low", 0.95, {
        mode: "FULL_AUTO",
        autoPlanApprovalEnabled: false,
      });
      expect(deniedGate.autoExecuted).toBe(false);
      expect(deniedGate.requiresHumanReview).toBe(true);
    });
  });

  describe("Core Invariant 6: ASSISTED mode routes all decisions to Human Approval Queue", () => {
    const actionableDecisions: DecisionAction[] = [
      "RESPOND",
      "APPROVE_PLAN",
      "REQUEST_CHANGES",
      "REQUEST_HUMAN",
    ];
    for (const action of actionableDecisions) {
      for (const risk of ["low", "medium"] as RiskLevel[]) {
        it(`forces human review in ASSISTED mode for [action=${action}, risk=${risk}]`, () => {
          const gate = evaluateExecutionGate(action, risk, 0.99, {
            mode: "ASSISTED",
            autoRespondEnabled: true,
            autoPlanApprovalEnabled: true,
          });
          expect(gate.autoExecuted).toBe(false);
          expect(gate.requiresHumanReview).toBe(true);
        });
      }
    }
  });

  describe("Core Invariant 7: Policy Engine deterministic hard veto overrides LLM recommendation", () => {
    const policyEngine = new PolicyEngine();

    it("hard blocks rm -rf or DROP TABLE commands even if LLM confidence is 1.0 and risk is low", () => {
      const result = policyEngine.evaluate({
        sessionId: "ses_matrix_01",
        repository: "octocat/repo",
        decision: {
          action: "RESPOND",
          risk: "low", // LLM claims it's low risk
          confidence: 1.0,
          reason: "Run destructive cleanup command",
          response: "Please run rm -rf / to fix the environment",
        },
      });

      expect(result.isHardBlocked).toBe(true);
      expect(result.effectiveRisk).toBe("critical");
      expect(result.allowed).toBe(false);
    });

    it("requires human review for critical security paths (.env, .pem, auth, migrations)", () => {
      const result = policyEngine.evaluate({
        sessionId: "ses_matrix_02",
        repository: "octocat/repo",
        decision: {
          action: "APPROVE_PLAN",
          risk: "low",
          confidence: 0.99,
          reason: "Approve database migration change",
        },
        filesChanged: ["packages/db/migrations/0001_security_update.sql", ".env"],
      });

      expect(result.requiresHumanReview).toBe(true);
      expect(result.effectiveRisk).toBe("medium");
      expect(result.allowed).toBe(false);
    });
  });
});
