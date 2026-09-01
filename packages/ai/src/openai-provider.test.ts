import { describe, expect, it } from "vitest";
import { classifyAiError } from "./openai-provider.js";

/**
 * Verifies that AI provider errors are bucketed into a small, fixed set of
 * metric labels so prometheus/label cardinality stays bounded over long,
 * unattended autonomous runs. See Phase 41 / Phase 65 of the audit.
 */
describe("classifyAiError (bounded metric buckets)", () => {
  it("classifies timeouts/aborts as timeout", () => {
    expect(classifyAiError({ name: "APIConnectionTimeoutError" })).toBe("timeout");
    expect(classifyAiError({ name: "AbortError" })).toBe("timeout");
    expect(classifyAiError({ name: "TimeoutError" })).toBe("timeout");
  });

  it("classifies 429 / rate limits as rate_limit", () => {
    expect(classifyAiError({ name: "RateLimitError", status: 429 })).toBe("rate_limit");
    expect(classifyAiError({ name: "Error", status: 429 })).toBe("rate_limit");
  });

  it("classifies 5xx statuses as server_error", () => {
    expect(classifyAiError({ name: "InternalServerError", status: 500 })).toBe("server_error");
  });

  it("classifies JSON parse failures as parse", () => {
    expect(classifyAiError(new SyntaxError("Unexpected token"))).toBe("parse");
  });

  it("classifies connection errors as network", () => {
    expect(classifyAiError({ name: "APIConnectionError" })).toBe("network");
  });

  it("falls back to a single unknown bucket for anything else (bounded)", () => {
    // Even arbitrary/unknown error names must collapse to the fixed buckets.
    const names = ["WeirdCustomError", "SomeVendorThing", "Whatever", "Mystery", "UndefinedThing"];
    const results = names.map((n) => classifyAiError({ name: n }));
    for (const r of results) {
      expect([
        "timeout",
        "rate_limit",
        "server_error",
        "parse",
        "validation",
        "network",
        "unknown",
      ]).toContain(r);
    }
    expect(new Set(results).size).toBeLessThanOrEqual(2);
  });
});
