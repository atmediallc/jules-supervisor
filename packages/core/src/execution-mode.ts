import { DecisionAction, ExecutionGateResult, RiskLevel } from "./types.js";

export type ExecutionMode = "DISABLED" | "DRY_RUN" | "ASSISTED" | "AUTO_RESPOND" | "FULL_AUTO";

export interface ExecutionModeOptions {
  mode: ExecutionMode;
  autoRespondEnabled?: boolean;
  autoPlanApprovalEnabled?: boolean;
  confidenceThreshold?: number;
}

export function evaluateExecutionGate(
  action: DecisionAction,
  risk: RiskLevel,
  confidence: number,
  options: ExecutionModeOptions,
): ExecutionGateResult {
  const {
    mode,
    autoRespondEnabled = false,
    autoPlanApprovalEnabled = false,
    confidenceThreshold = 0.85,
  } = options;

  if (mode === "DISABLED") {
    return {
      action,
      allowed: false,
      requiresHumanReview: false,
      blocked: true,
      reason: "Supervisor is DISABLED",
      autoExecuted: false,
    };
  }

  if (mode === "DRY_RUN") {
    return {
      action,
      allowed: true,
      requiresHumanReview: false,
      blocked: false,
      reason: "Decision generated under DRY_RUN (No API mutations dispatched)",
      autoExecuted: false,
    };
  }

  if (risk === "critical") {
    return {
      action,
      allowed: false,
      requiresHumanReview: true,
      blocked: true,
      reason: "CRITICAL risk actions are blocked from autonomous execution",
      autoExecuted: false,
    };
  }

  if (risk === "high") {
    return {
      action,
      allowed: false,
      requiresHumanReview: true,
      blocked: false,
      reason: "HIGH risk actions require human review and cannot auto-execute",
      autoExecuted: false,
    };
  }

  if (action === "BLOCK" || action === "REQUEST_HUMAN" || action === "IGNORE") {
    return {
      action,
      allowed: false,
      requiresHumanReview: action !== "IGNORE",
      blocked: action === "BLOCK",
      reason: `Action ${action} is non-executable and requires operator review or termination`,
      autoExecuted: false,
    };
  }

  if (confidence < confidenceThreshold) {
    return {
      action: "REQUEST_HUMAN",
      allowed: false,
      requiresHumanReview: true,
      blocked: false,
      reason: `AI confidence (${confidence.toFixed(2)}) is below threshold (${confidenceThreshold.toFixed(2)})`,
      autoExecuted: false,
    };
  }

  if (mode === "ASSISTED") {
    return {
      action,
      allowed: false,
      requiresHumanReview: true,
      blocked: false,
      reason: "ASSISTED mode routes all decisions to Human Approval Queue",
      autoExecuted: false,
    };
  }

  if (mode === "AUTO_RESPOND") {
    if (action === "RESPOND" && risk === "low" && autoRespondEnabled) {
      return {
        action,
        allowed: true,
        requiresHumanReview: false,
        blocked: false,
        reason: "AUTO_RESPOND permitted for low-risk response",
        autoExecuted: true,
      };
    }
    return {
      action,
      allowed: false,
      requiresHumanReview: true,
      blocked: false,
      reason: "AUTO_RESPOND requires human approval for non-low-risk or non-response actions",
      autoExecuted: false,
    };
  }

  if (mode === "FULL_AUTO") {
    if (action === "APPROVE_PLAN") {
      if (autoPlanApprovalEnabled && (risk === "low" || risk === "medium")) {
        return {
          action,
          allowed: true,
          requiresHumanReview: false,
          blocked: false,
          reason: "FULL_AUTO plan approval permitted by policy",
          autoExecuted: true,
        };
      }
      return {
        action,
        allowed: false,
        requiresHumanReview: true,
        blocked: false,
        reason: "Plan approval requires human review or explicit policy enablement",
        autoExecuted: false,
      };
    }

    if (risk === "low" || risk === "medium") {
      return {
        action,
        allowed: true,
        requiresHumanReview: false,
        blocked: false,
        reason: "FULL_AUTO permitted action within policy risk boundaries",
        autoExecuted: true,
      };
    }

    return {
      action,
      allowed: false,
      requiresHumanReview: true,
      blocked: false,
      reason: "HIGH/CRITICAL risk requires human review even in FULL_AUTO",
      autoExecuted: false,
    };
  }

  return {
    action,
    allowed: false,
    requiresHumanReview: true,
    blocked: false,
    reason: "Default fallback to human review",
    autoExecuted: false,
  };
}
