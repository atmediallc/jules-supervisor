import { z } from "zod";

export const JulesSessionStateSchema = z.enum([
  "QUEUED",
  "INITIALIZING",
  "PLANNING",
  "AWAITING_PLAN_APPROVAL",
  "IN_PROGRESS",
  "AWAITING_USER_INPUT",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
]);
export type JulesSessionState = z.infer<typeof JulesSessionStateSchema>;

export const JulesActivityTypeSchema = z.enum([
  "AGENT_MESSAGE",
  "USER_MESSAGE",
  "PLAN_GENERATED",
  "PLAN_APPROVED",
  "PLAN_REJECTED",
  "PROGRESS_UPDATE",
  "TOOL_CALL",
  "TOOL_RESULT",
  "PATCH_CREATED",
  "SESSION_STATE_CHANGED",
]);
export type JulesActivityType = z.infer<typeof JulesActivityTypeSchema>;

export const DecisionActionSchema = z.enum([
  "RESPOND",
  "APPROVE_PLAN",
  "REQUEST_CHANGES",
  "REQUEST_HUMAN",
  "IGNORE",
  "BLOCK",
]);
export type DecisionAction = z.infer<typeof DecisionActionSchema>;

export const RiskLevelSchema = z.enum(["low", "medium", "high", "critical"]);
export type RiskLevel = z.infer<typeof RiskLevelSchema>;

export const DecisionSchema = z.object({
  action: DecisionActionSchema,
  response: z.string().nullable().default(null),
  risk: RiskLevelSchema,
  confidence: z.number().min(0).max(1),
  reason: z.string(),
  evidence: z.array(z.string()).default([]),
  concerns: z.array(z.string()).default([]),
});
export type Decision = z.infer<typeof DecisionSchema>;

export interface ExecutionGateResult {
  action: DecisionAction;
  allowed: boolean;
  requiresHumanReview: boolean;
  blocked: boolean;
  reason: string;
  autoExecuted: boolean;
}
