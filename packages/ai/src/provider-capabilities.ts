import { DecisionSchema } from "@jules/core";

/**
 * Capability metadata for a decision provider.
 *
 * Fallback must never assume all providers/models are equivalent: we only
 * fall back to a provider that can satisfy the *required* decision contract
 * for the current request. The central requirement is structured JSON decision
 * output validated by `DecisionSchema`; the secondary must support it too.
 */
export interface ProviderCapabilities {
  /** Implements the required decision contract (structured JSON + DecisionSchema). */
  supportsStructuredDecision: boolean;
  /** Upper bound on context the model can accept (tokens). Used to gate fallback. */
  maxContextTokens: number;
  /** Timeout for a single request to this provider (ms). */
  timeoutMs: number;
  /** Human-readable model identity for attribution. */
  model: string;
  /** Optional flag: whether this provider reports usage for accounting. */
  supportsUsageReporting: boolean;
  /** Optional cost metadata for estimation; absent means "estimate with defaults". */
  costPer1KPromptUsd?: number;
  costPer1KCompletionUsd?: number;
}

/**
 * Compute the required capability contract for a decision request. Currently
 * every decision requires structured JSON output; if request-specific context
 * size is known we also enforce a minimum context capacity.
 */
export interface DecisionRequirement {
  requiresStructuredDecision: boolean;
  estimatedPromptTokens: number;
  requiredTimeoutMs: number;
}

export function defaultDecisionRequirement(estimatedPromptTokens = 0): DecisionRequirement {
  return {
    requiresStructuredDecision: true,
    estimatedPromptTokens,
    requiredTimeoutMs: 30000,
  };
}

/**
 * True if `candidate` can satisfy `requirement`. A provider that cannot emit
 * structured decisions is never eligible, regardless of other metadata.
 */
export function canSatisfy(
  candidate: ProviderCapabilities,
  requirement: DecisionRequirement,
): boolean {
  if (requirement.requiresStructuredDecision && !candidate.supportsStructuredDecision) {
    return false;
  }
  if (candidate.maxContextTokens <= 0 && requirement.estimatedPromptTokens > 0) {
    return false;
  }
  return true;
}

/**
 * Capabilities inferred for a provider that implements the standard interface.
 * Providers are structured-decision capable by contract; consumers may
 * override with explicit metadata when they know more.
 */
export function standardCapabilities(input: {
  model: string;
  timeoutMs: number;
  maxContextTokens: number;
  supportsUsageReporting?: boolean;
}): ProviderCapabilities {
  return {
    supportsStructuredDecision: true,
    maxContextTokens: input.maxContextTokens,
    timeoutMs: input.timeoutMs,
    model: input.model,
    supportsUsageReporting: input.supportsUsageReporting ?? true,
  };
}

/** Validate that a parsed decision actually conforms to the contract. */
export function assertStructuredDecision(raw: unknown): void {
  DecisionSchema.parse(raw);
}
