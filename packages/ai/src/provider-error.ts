import { classifyAiError } from "./openai-provider.js";

/**
 * Structured failure classification for AI provider attempts.
 *
 * This is the smallest useful taxonomy that lets the ProviderRouter and the
 * pipeline decide — deterministically — whether a failed provider attempt is:
 *   - worth a same-provider retry,
 *   - worth falling back to a secondary provider,
 *   - a permanent/config problem that must never be hammered.
 *
 * Deliberately NOT a sprawling error class hierarchy: a single discriminant
 * (`class`) drives every routing decision.
 */

export type ProviderFailureClass =
  | "RETRYABLE_PROVIDER_FAILURE"
  | "NON_RETRYABLE_PROVIDER_FAILURE"
  | "DECISION_OUTPUT_FAILURE";

export interface ProviderFailure {
  /** Stable, bounded class used for routing decisions. */
  class: ProviderFailureClass;
  /** Natural-language safe message (never contains credentials). */
  message: string;
  /** Underlying cause, preserved for logging (not exposed to operators). */
  cause?: unknown;
}

const NON_RETRYABLE_NAMES = new Set([
  "AuthenticationError",
  "InvalidApiKey",
  "InvalidRequestError",
  "BadRequestError",
  "PermissionDeniedError",
  "NotFoundError",
  "ConfigurationError",
  "UnsupportedProtocolError",
]);

/**
 * Classify an arbitrary thrown value from a provider into a bounded failure
 * class. Rules are ordered: schema/parse problems are output failures, config
 * and auth problems are permanent, everything transient is retryable.
 */
export function classifyProviderFailure(err: unknown): ProviderFailure {
  const shape = err as { name?: string; status?: number; message?: string };
  const name = shape?.name ?? "";
  const status = shape?.status;
  const message = shape?.message ?? "Unknown provider failure";

  // Schema/parse failures are output problems: the request is well-formed, the
  // response wasn't. Retrying the same provider on identical input is a waste
  // of tokens — route to a fallback provider (which may parse differently)
  // rather than retry in place.
  if (name === "ZodError" || name === "SyntaxError" || name.includes("parse")) {
    return { class: "DECISION_OUTPUT_FAILURE", message, cause: err };
  }

  // Permanent: auth, config, bad request, unsupported. Never retry/fallback on
  // these — the operator must fix configuration. Falling back would hide a
  // misconfiguration and burn money on the secondary provider for nothing.
  if (status === 400 || status === 401 || status === 403 || status === 404 || status === 409) {
    return { class: "NON_RETRYABLE_PROVIDER_FAILURE", message, cause: err };
  }
  if (NON_RETRYABLE_NAMES.has(name)) {
    return { class: "NON_RETRYABLE_PROVIDER_FAILURE", message, cause: err };
  }

  // 429, 5xx, timeouts, connection resets, and everything else are transient.
  return { class: "RETRYABLE_PROVIDER_FAILURE", message, cause: err };
}

/**
 * Stable metric bucket for a failure class (bounded label set).
 */
export function providerFailureClassToBucket(failureClass: ProviderFailureClass): string {
  switch (failureClass) {
    case "RETRYABLE_PROVIDER_FAILURE":
      return "retryable";
    case "NON_RETRYABLE_PROVIDER_FAILURE":
      return "permanent";
    case "DECISION_OUTPUT_FAILURE":
      return "output";
  }
}

/** Re-export the existing bounded metric bucketing for error-name cardinality. */
export { classifyAiError };
