import { PolicyEvaluationInput, PolicyRuleEvaluation } from "./types.js";

export interface IPolicyRule {
  name: string;
  description: string;
  evaluate(input: PolicyEvaluationInput): PolicyRuleEvaluation;
}

export class NoDestructiveCommandsRule implements IPolicyRule {
  public readonly name = "no-destructive-commands";
  public readonly description =
    "Blocks any destructive code or commands (e.g. DROP TABLE, rm -rf, git force push)";

  public evaluate(input: PolicyEvaluationInput): PolicyRuleEvaluation {
    // Normalize before matching so whitespace / Unicode homoglyph tricks
    // (e.g. `rm  -rf /`, `Dro\u200Bp TaBle`, full-width letters) cannot
    // bypass the destructive-command guard (M14). NFKC collapses confusables;
    // collapsing whitespace makes multi-space separators irrelevant; and
    // zero-width format characters (ZWSP \u200B, ZWNJ \u200C, ZWJ \u200D,
    // WORD JOINER \u2060, BOM \uFEFF) are treated as separators so
    // `dr\u200Bop table` or `dr\u200Bop\u200Btable` still match.
    const raw = `${input.decision.response ?? ""} ${input.diff ?? ""}`;
    const zeroWidthAsSpace = raw.replace(/[\u200B-\u200D\u2060\uFEFF]/g, " ");
    const textToCheck = zeroWidthAsSpace.normalize("NFKC").replace(/\s+/g, " ").toLowerCase();
    const destructivePatterns = [
      /drop\s+table/i,
      /truncate\s+table/i,
      /delete\s+from\s+users/i,
      /rm\s+-rf\s+[\/~]/i,
      /git\s+push\s+.*--force/i,
      /--no-verify/i,
    ];

    for (const pattern of destructivePatterns) {
      if (pattern.test(textToCheck)) {
        return {
          ruleName: this.name,
          passed: false,
          actionRequired: "HARD_BLOCK",
          reason: `Detected forbidden destructive pattern: ${pattern.source}`,
        };
      }
    }

    return { ruleName: this.name, passed: true, reason: "No destructive patterns detected" };
  }
}

export class SecurityPathsRule implements IPolicyRule {
  public readonly name = "security-paths-protection";
  public readonly description =
    "Requires human review for any changes touching security, auth, workflows, or credentials";

  public evaluate(input: PolicyEvaluationInput): PolicyRuleEvaluation {
    const files = input.filesChanged ?? [];
    const sensitiveFilePatterns = [
      /\.env/i,
      /auth\//i,
      /migrations\//i,
      /\.github\/workflows\//i,
      /secrets?\//i,
      /crypto\//i,
    ];

    for (const file of files) {
      for (const pattern of sensitiveFilePatterns) {
        if (pattern.test(file)) {
          return {
            ruleName: this.name,
            passed: false,
            actionRequired: "REQUIRE_HUMAN",
            reason: `Action touches sensitive path: ${file}`,
          };
        }
      }
    }

    return { ruleName: this.name, passed: true, reason: "No protected paths touched" };
  }
}

export class ConfidenceGateRule implements IPolicyRule {
  public readonly name = "confidence-threshold";
  public readonly description = "Requires human review if AI model confidence is below threshold";

  constructor(private readonly minConfidence = 0.85) {}

  public evaluate(input: PolicyEvaluationInput): PolicyRuleEvaluation {
    if (input.decision.confidence < this.minConfidence) {
      return {
        ruleName: this.name,
        passed: false,
        actionRequired: "REQUIRE_HUMAN",
        reason: `Model confidence (${input.decision.confidence.toFixed(2)}) is below safety threshold (${this.minConfidence.toFixed(2)})`,
      };
    }
    return { ruleName: this.name, passed: true, reason: "Model confidence meets threshold" };
  }
}

export class SessionCycleCeilingRule implements IPolicyRule {
  public readonly name = "session-cycle-ceiling";
  public readonly description =
    "Blocks further autonomous responses if session exceeds maximum loop cycles";

  public evaluate(input: PolicyEvaluationInput): PolicyRuleEvaluation {
    const current = input.cycleCount ?? 0;
    const max = input.maxCyclesAllowed ?? 5;

    if (current >= max) {
      return {
        ruleName: this.name,
        passed: false,
        actionRequired: "REQUIRE_HUMAN",
        reason: `Session cycle count (${current}) reached maximum allowed limit (${max})`,
      };
    }

    return { ruleName: this.name, passed: true, reason: "Cycle count within limits" };
  }
}
