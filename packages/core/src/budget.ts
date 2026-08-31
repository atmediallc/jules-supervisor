/**
 * Autonomy Budget Engine (deterministic, pure).
 *
 * Enforces hard ceilings on AI calls, tokens, estimated cost, and corrections
 * per Jules session. Budget state is persisted by the caller (session_budgets
 * table) so counters survive restarts and are safe under concurrent workers.
 */

export interface BudgetUsage {
  aiCalls: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  corrections: number;
}

export interface BudgetLimits {
  maxAiCalls: number;
  maxTotalTokens: number;
  maxCostUsd: number;
  maxCorrections: number;
}

export interface BudgetCheckResult {
  exceeded: boolean;
  reasons: string[];
}

export const EMPTY_BUDGET_USAGE: BudgetUsage = {
  aiCalls: 0,
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  estimatedCostUsd: 0,
  corrections: 0,
};

/**
 * Pure evaluation of accumulated usage against configured limits.
 * Any single violated ceiling marks the budget as exceeded.
 */
export function evaluateBudgetExhaustion(
  usage: BudgetUsage,
  limits: BudgetLimits,
): BudgetCheckResult {
  const reasons: string[] = [];

  if (usage.aiCalls >= limits.maxAiCalls) {
    reasons.push(`AI call budget exhausted (${usage.aiCalls}/${limits.maxAiCalls} calls)`);
  }
  if (usage.totalTokens >= limits.maxTotalTokens) {
    reasons.push(`Token budget exhausted (${usage.totalTokens}/${limits.maxTotalTokens} tokens)`);
  }
  if (usage.estimatedCostUsd >= limits.maxCostUsd) {
    reasons.push(
      `Cost budget exhausted ($${usage.estimatedCostUsd.toFixed(4)}/$${limits.maxCostUsd} USD)`,
    );
  }
  if (usage.corrections >= limits.maxCorrections) {
    reasons.push(
      `Correction budget exhausted (${usage.corrections}/${limits.maxCorrections} corrections)`,
    );
  }

  return { exceeded: reasons.length > 0, reasons };
}

/**
 * Deterministic cost estimation from token usage.
 * Mirrors typical OpenAI pricing inputs; configurable per 1K tokens.
 */
export function estimateCostUsd(
  promptTokens: number,
  completionTokens: number,
  costPer1kPromptTokensUsd: number,
  costPer1kCompletionTokensUsd: number,
): number {
  const cost =
    (promptTokens / 1000) * costPer1kPromptTokensUsd +
    (completionTokens / 1000) * costPer1kCompletionTokensUsd;
  return Math.round(cost * 1e6) / 1e6;
}

/**
 * Computes the delta of usage produced by a single AI decision call.
 */
export function usageFromAiCall(
  promptTokens: number,
  completionTokens: number,
  costPer1kPromptTokensUsd: number,
  costPer1kCompletionTokensUsd: number,
): BudgetUsage {
  return {
    aiCalls: 1,
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    estimatedCostUsd: estimateCostUsd(
      promptTokens,
      completionTokens,
      costPer1kPromptTokensUsd,
      costPer1kCompletionTokensUsd,
    ),
    corrections: 0,
  };
}

export function addUsage(base: BudgetUsage, delta: BudgetUsage): BudgetUsage {
  return {
    aiCalls: base.aiCalls + delta.aiCalls,
    promptTokens: base.promptTokens + delta.promptTokens,
    completionTokens: base.completionTokens + delta.completionTokens,
    totalTokens: base.totalTokens + delta.totalTokens,
    estimatedCostUsd: Math.round((base.estimatedCostUsd + delta.estimatedCostUsd) * 1e6) / 1e6,
    corrections: base.corrections + delta.corrections,
  };
}
