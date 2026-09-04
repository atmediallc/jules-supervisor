import { describe, expect, it } from "vitest";
import { PolicyEngine } from "./engine.js";

describe("PolicyEngine", () => {
  const engine = new PolicyEngine();

  it("hard blocks destructive commands regardless of decision confidence", () => {
    const result = engine.evaluate({
      decision: {
        action: "RESPOND",
        response: "Execute `DROP TABLE users;` to reset state",
        risk: "low",
        confidence: 1.0,
        reason: "Resetting DB",
        evidence: [],
        concerns: [],
      },
      sessionId: "ses_001",
      repository: "octocat/repo",
    });

    expect(result.allowed).toBe(false);
    expect(result.isHardBlocked).toBe(true);
    expect(result.effectiveRisk).toBe("critical");
    expect(result.reasons[0]).toContain("destructive pattern");
  });

  it("blocks destructive commands with whitespace/Unicode obfuscation (M14)", () => {
    const engine = new PolicyEngine();
    const cases = [
      "Run `rm  -rf  /` now", // extra whitespace
      "drop\u200Btable users", // zero-width space inside phrase
      "ＤＲＯＰ　ＴＡＢＬＥ　users", // full-width letters + ideographic space (NFKC)
      "rm -rf /tmp \u00A0 --force", // non-breaking space separators
    ];
    for (const response of cases) {
      const result = engine.evaluate({
        decision: {
          action: "RESPOND",
          response,
          risk: "low",
          confidence: 1.0,
          reason: "test",
          evidence: [],
          concerns: [],
        },
        sessionId: "ses_014",
        repository: "octocat/repo",
      });
      expect(result.allowed, `should block: ${response}`).toBe(false);
      expect(result.isHardBlocked, `should hard-block: ${response}`).toBe(true);
    }
  });

  it("requires human review for files in security and migration paths", () => {
    const result = engine.evaluate({
      decision: {
        action: "APPROVE_PLAN",
        response: "Approve migration",
        risk: "low",
        confidence: 0.95,
        reason: "Migration looks okay",
        evidence: [],
        concerns: [],
      },
      sessionId: "ses_002",
      repository: "octocat/repo",
      filesChanged: ["migrations/0002_add_roles.sql"],
    });

    expect(result.allowed).toBe(false);
    expect(result.requiresHumanReview).toBe(true);
    expect(result.effectiveRisk).toBe("medium");
  });

  it("permits safe, non-destructive low-risk operations", () => {
    const result = engine.evaluate({
      decision: {
        action: "RESPOND",
        response: "Use ES Module import syntax.",
        risk: "low",
        confidence: 0.95,
        reason: "Standard TypeScript recommendation",
        evidence: [],
        concerns: [],
      },
      sessionId: "ses_003",
      repository: "octocat/repo",
      filesChanged: ["docs/README.md"],
    });

    expect(result.allowed).toBe(true);
    expect(result.isHardBlocked).toBe(false);
    expect(result.requiresHumanReview).toBe(false);
  });
});
