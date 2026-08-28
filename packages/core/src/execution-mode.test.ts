import { describe, expect, it } from "vitest";
import { evaluateExecutionGate } from "./execution-mode.js";

describe("evaluateExecutionGate", () => {
  it("never auto-executes under DRY_RUN mode", () => {
    const gate = evaluateExecutionGate("RESPOND", "low", 0.95, {
      mode: "DRY_RUN",
      autoRespondEnabled: true,
    });
    expect(gate.allowed).toBe(true);
    expect(gate.autoExecuted).toBe(false);
    expect(gate.requiresHumanReview).toBe(false);
    expect(gate.reason).toContain("DRY_RUN");
  });

  it("blocks autonomous execution on CRITICAL risk", () => {
    const gate = evaluateExecutionGate("RESPOND", "critical", 1.0, {
      mode: "FULL_AUTO",
      autoRespondEnabled: true,
    });
    expect(gate.allowed).toBe(false);
    expect(gate.autoExecuted).toBe(false);
    expect(gate.blocked).toBe(true);
    expect(gate.requiresHumanReview).toBe(true);
  });

  it("forces human review when confidence is below threshold", () => {
    const gate = evaluateExecutionGate("RESPOND", "low", 0.75, {
      mode: "AUTO_RESPOND",
      autoRespondEnabled: true,
      confidenceThreshold: 0.85,
    });
    expect(gate.requiresHumanReview).toBe(true);
    expect(gate.autoExecuted).toBe(false);
    expect(gate.reason).toContain("below threshold");
  });

  it("permits auto-execution in AUTO_RESPOND mode for low-risk responses", () => {
    const gate = evaluateExecutionGate("RESPOND", "low", 0.95, {
      mode: "AUTO_RESPOND",
      autoRespondEnabled: true,
      confidenceThreshold: 0.85,
    });
    expect(gate.allowed).toBe(true);
    expect(gate.autoExecuted).toBe(true);
    expect(gate.requiresHumanReview).toBe(false);
  });

  it("routes all decisions to human approval queue in ASSISTED mode", () => {
    const gate = evaluateExecutionGate("RESPOND", "low", 0.99, {
      mode: "ASSISTED",
    });
    expect(gate.requiresHumanReview).toBe(true);
    expect(gate.autoExecuted).toBe(false);
  });
});
