import { RiskLevel } from "@jules/core";
import { logger } from "@jules/observability";
import {
  ConfidenceGateRule,
  IPolicyRule,
  NoDestructiveCommandsRule,
  SecurityPathsRule,
  SessionCycleCeilingRule,
} from "./rules.js";
import { PolicyEvaluationInput, PolicyEvaluationResult } from "./types.js";

export class PolicyEngine {
  private readonly rules: IPolicyRule[];

  constructor(rules?: IPolicyRule[]) {
    this.rules = rules ?? [
      new NoDestructiveCommandsRule(),
      new SecurityPathsRule(),
      new ConfidenceGateRule(),
      new SessionCycleCeilingRule(),
    ];
  }

  public evaluate(input: PolicyEvaluationInput): PolicyEvaluationResult {
    const evaluations = this.rules.map((rule) => rule.evaluate(input));
    const failedEvals = evaluations.filter((e) => !e.passed);

    let isHardBlocked = false;
    let requiresHumanReview = false;
    const reasons: string[] = [];

    for (const fail of failedEvals) {
      reasons.push(fail.reason);
      if (fail.actionRequired === "HARD_BLOCK") {
        isHardBlocked = true;
      } else if (fail.actionRequired === "REQUIRE_HUMAN") {
        requiresHumanReview = true;
      }
    }

    let effectiveRisk: RiskLevel = input.decision.risk;
    if (isHardBlocked) {
      effectiveRisk = "critical";
    } else if (requiresHumanReview && effectiveRisk === "low") {
      effectiveRisk = "medium";
    }

    const allowed = !isHardBlocked && !requiresHumanReview;

    logger.debug("Policy Engine evaluation complete", {
      sessionId: input.sessionId,
      allowed,
      effectiveRisk,
      isHardBlocked,
      requiresHumanReview,
      rulesTested: this.rules.length,
      failedRules: failedEvals.length,
    });

    return {
      allowed,
      effectiveRisk,
      requiresHumanReview,
      isHardBlocked,
      ruleEvaluations: evaluations,
      reasons: reasons.length > 0 ? reasons : ["All policy rules passed"],
    };
  }
}
