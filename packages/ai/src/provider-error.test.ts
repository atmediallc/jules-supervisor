import { describe, expect, it } from "vitest";
import { classifyProviderFailure } from "./provider-error.js";

describe("classifyProviderFailure (retry taxonomy)", () => {
  it("classifies timeout/429/5xx/connection reset as retryable", () => {
    expect(classifyProviderFailure({ name: "APIConnectionTimeoutError" }).class).toBe(
      "RETRYABLE_PROVIDER_FAILURE",
    );
    expect(classifyProviderFailure({ name: "RateLimitError", status: 429 }).class).toBe(
      "RETRYABLE_PROVIDER_FAILURE",
    );
    expect(classifyProviderFailure({ name: "InternalServerError", status: 500 }).class).toBe(
      "RETRYABLE_PROVIDER_FAILURE",
    );
    expect(classifyProviderFailure({ name: "APIConnectionError" }).class).toBe(
      "RETRYABLE_PROVIDER_FAILURE",
    );
  });

  it("classifies auth/4xx/config errors as non-retryable (no pointless retries)", () => {
    expect(classifyProviderFailure({ name: "AuthenticationError", status: 401 }).class).toBe(
      "NON_RETRYABLE_PROVIDER_FAILURE",
    );
    expect(classifyProviderFailure({ name: "InvalidApiKey" }).class).toBe(
      "NON_RETRYABLE_PROVIDER_FAILURE",
    );
    expect(classifyProviderFailure({ name: "BadRequestError", status: 400 }).class).toBe(
      "NON_RETRYABLE_PROVIDER_FAILURE",
    );
    expect(classifyProviderFailure({ name: "PermissionDeniedError", status: 403 }).class).toBe(
      "NON_RETRYABLE_PROVIDER_FAILURE",
    );
  });

  it("classifies malformed structured output as DECISION_OUTPUT_FAILURE", () => {
    expect(classifyProviderFailure(new SyntaxError("Unexpected token")).class).toBe(
      "DECISION_OUTPUT_FAILURE",
    );
    expect(classifyProviderFailure({ name: "ZodError" }).class).toBe(
      "DECISION_OUTPUT_FAILURE",
    );
  });
});
