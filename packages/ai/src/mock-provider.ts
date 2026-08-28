import { Decision } from "@jules/core";
import { AiDecisionResponse, BuiltContext, IAiDecisionProvider } from "./types.js";

export class MockAiDecisionProvider implements IAiDecisionProvider {
  public readonly name = "mock";
  public customDecision: Decision | null = null;
  public shouldFailWithError: Error | null = null;

  public async decide(context: BuiltContext): Promise<AiDecisionResponse> {
    if (this.shouldFailWithError) {
      throw this.shouldFailWithError;
    }

    if (this.customDecision) {
      return {
        decision: this.customDecision,
        provider: "mock",
        model: "mock-model-v1",
        usage: { promptTokens: 50, completionTokens: 25, totalTokens: 75 },
        latencyMs: 15,
      };
    }

    // Default intelligent mock response: checks context content
    const isPlan = context.userPrompt.includes("PLAN_GENERATED");
    const isDestructive =
      context.userPrompt.toLowerCase().includes("drop table") ||
      context.userPrompt.toLowerCase().includes("rm -rf");

    let decision: Decision;
    if (isDestructive) {
      decision = {
        action: "BLOCK",
        response: "Destructive operations are forbidden by supervisor policy.",
        risk: "critical",
        confidence: 0.99,
        reason: "Detected destructive code pattern in context",
        evidence: ["Found DROP TABLE or destructive file deletion"],
        concerns: ["Data loss risk"],
      };
    } else if (isPlan) {
      decision = {
        action: "APPROVE_PLAN",
        response: "Plan is verified and compliant with safety guidelines.",
        risk: "low",
        confidence: 0.95,
        reason: "Plan steps are standard, non-destructive, and well-structured.",
        evidence: ["All plan steps verified"],
        concerns: [],
      };
    } else {
      decision = {
        action: "RESPOND",
        response:
          "Please implement the rate limiter per authenticated user ID with a fallback to client IP.",
        risk: "low",
        confidence: 0.92,
        reason: "Standard architectural best practice for API rate limiting.",
        evidence: ["Matches project standard auth pattern"],
        concerns: [],
      };
    }

    return {
      decision,
      provider: "mock",
      model: "mock-model-v1",
      usage: { promptTokens: 120, completionTokens: 40, totalTokens: 160 },
      latencyMs: 10,
    };
  }
}
