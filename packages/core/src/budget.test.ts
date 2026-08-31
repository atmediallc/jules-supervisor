import { describe, expect, it } from "vitest";
import {
  addUsage,
  EMPTY_BUDGET_USAGE,
  estimateCostUsd,
  evaluateBudgetExhaustion,
  usageFromAiCall,
} from "./budget.js";

const LIMITS = {
  maxAiCalls: 3,
  maxTotalTokens: 1000,
  maxCostUsd: 0.5,
  maxCorrections: 2,
};

describe("evaluateBudgetExhaustion", () => {
  it("returns not-exceeded for empty usage", () => {
    const result = evaluateBudgetExhaustion(EMPTY_BUDGET_USAGE, LIMITS);
    expect(result.exceeded).toBe(false);
    expect(result.reasons).toEqual([]);
  });

  it("flags exhaustion when AI call ceiling reached", () => {
    const result = evaluateBudgetExhaustion({ ...EMPTY_BUDGET_USAGE, aiCalls: 3 }, LIMITS);
    expect(result.exceeded).toBe(true);
    expect(result.reasons[0]).toContain("AI call budget exhausted");
  });

  it("flags exhaustion when token ceiling reached", () => {
    const result = evaluateBudgetExhaustion({ ...EMPTY_BUDGET_USAGE, totalTokens: 1000 }, LIMITS);
    expect(result.exceeded).toBe(true);
    expect(result.reasons.join(" ")).toContain("Token budget exhausted");
  });

  it("flags exhaustion when cost ceiling reached", () => {
    const result = evaluateBudgetExhaustion(
      { ...EMPTY_BUDGET_USAGE, estimatedCostUsd: 0.5 },
      LIMITS,
    );
    expect(result.exceeded).toBe(true);
    expect(result.reasons.join(" ")).toContain("Cost budget exhausted");
  });

  it("flags exhaustion when correction ceiling reached", () => {
    const result = evaluateBudgetExhaustion({ ...EMPTY_BUDGET_USAGE, corrections: 2 }, LIMITS);
    expect(result.exceeded).toBe(true);
    expect(result.reasons.join(" ")).toContain("Correction budget exhausted");
  });

  it("accumulates multiple violation reasons", () => {
    const result = evaluateBudgetExhaustion(
      {
        ...EMPTY_BUDGET_USAGE,
        aiCalls: 5,
        totalTokens: 2000,
        estimatedCostUsd: 1.5,
        corrections: 3,
      },
      LIMITS,
    );
    expect(result.exceeded).toBe(true);
    expect(result.reasons).toHaveLength(4);
  });
});

describe("estimateCostUsd", () => {
  it("computes cost from prompt and completion tokens deterministically", () => {
    // 2000 prompt tokens @ $2.50/1K = $5.00, 1000 completion @ $10/1K = $10 → total $15
    expect(estimateCostUsd(2000, 1000, 2.5, 10)).toBe(15);
  });

  it("returns 0 for zero tokens", () => {
    expect(estimateCostUsd(0, 0, 2.5, 10)).toBe(0);
  });

  it("rounds to 6 decimal places to avoid floating-point drift", () => {
    const cost = estimateCostUsd(1, 1, 0.333, 0.777);
    expect(cost).toBe(0.00111);
  });
});

describe("usageFromAiCall / addUsage", () => {
  it("derives per-call usage including deterministic cost", () => {
    const usage = usageFromAiCall(500, 100, 2.5, 10);
    expect(usage.aiCalls).toBe(1);
    expect(usage.totalTokens).toBe(600);
    expect(usage.estimatedCostUsd).toBe(2.25); // 500*2.5/1000 + 100*10/1000 = 1.25 + 1
  });

  it("adds usage without floating-point drift on cost accumulation", () => {
    const first = usageFromAiCall(333, 111, 0.1, 0.2);
    const second = usageFromAiCall(333, 111, 0.1, 0.2);
    const total = addUsage(first, second);
    expect(total.aiCalls).toBe(2);
    expect(total.totalTokens).toBe(888);
    expect(total.estimatedCostUsd).toBe(0.111); // 2 * (333*0.1/1000 + 111*0.2/1000) = 2 * 0.0555
  });
});
