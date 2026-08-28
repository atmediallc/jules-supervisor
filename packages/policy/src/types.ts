import { Decision, RiskLevel } from "@jules/core";

export interface PolicyEvaluationInput {
  decision: Decision;
  sessionId: string;
  repository: string;
  filesChanged?: string[];
  diff?: string;
  cycleCount?: number;
  maxCyclesAllowed?: number;
}

export interface PolicyRuleEvaluation {
  ruleName: string;
  passed: boolean;
  actionRequired?: "APPROVE" | "REQUIRE_HUMAN" | "HARD_BLOCK";
  reason: string;
}

export interface PolicyEvaluationResult {
  allowed: boolean;
  effectiveRisk: RiskLevel;
  requiresHumanReview: boolean;
  isHardBlocked: boolean;
  ruleEvaluations: PolicyRuleEvaluation[];
  reasons: string[];
}
