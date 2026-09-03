import { describe, expect, it } from "vitest";
import {
  evaluateEligibility,
  sanitizeMemoryContent,
  AdmissionConfig,
} from "./memory-admission.js";

const baseConfig: AdmissionConfig = {
  minImportance: 0.4,
  minConfidence: 0.5,
  maxLengthChars: 8_000,
  dedupSimilarityThreshold: 0.9,
  embeddingModel: "test-model",
  embeddingDimensions: 128,
};

describe("evaluateEligibility", () => {
  it("rejects content that is too short", () => {
    const d = evaluateEligibility("hi", 0.9, 0.9, baseConfig);
    expect(d.accepted).toBe(false);
    if (!d.accepted) expect(d.reason).toBe("content_too_short");
  });

  it("rejects content that is too long", () => {
    const d = evaluateEligibility("x".repeat(9_000), 0.9, 0.9, baseConfig);
    expect(d.accepted).toBe(false);
    if (!d.accepted) expect(d.reason).toBe("content_too_long");
  });

  it("rejects low-value greeting patterns", () => {
    const d = evaluateEligibility("hey", 0.9, 0.9, baseConfig);
    expect(d.accepted).toBe(false);
  });

  it("rejects content below importance threshold", () => {
    const d = evaluateEligibility("a reasonably long piece of content that has value", 0.1, 0.9, baseConfig);
    expect(d.accepted).toBe(false);
    if (!d.accepted) expect(d.reason).toBe("below_importance_threshold");
  });

  it("rejects content below confidence threshold", () => {
    const d = evaluateEligibility("a reasonably long piece of content that has value", 0.9, 0.1, baseConfig);
    expect(d.accepted).toBe(false);
    if (!d.accepted) expect(d.reason).toBe("below_confidence_threshold");
  });

  it("accepts eligible durable content", () => {
    const d = evaluateEligibility(
      "Repository uses Turborepo with pnpm workspaces; build pipeline is tsc --build.",
      0.8,
      0.9,
      baseConfig,
    );
    expect(d.accepted).toBe(true);
  });
});

describe("sanitizeMemoryContent", () => {
  it("redacts secrets from canonical content", () => {
    const raw = "API key sk-abcdefghijklmnopqrstuvwxyz1234567890 is used by the worker.";
    const cleaned = sanitizeMemoryContent(raw);
    expect(cleaned).not.toContain("sk-abcdefghijklmnopqrstuvwxyz1234567890");
    expect(cleaned).toContain("REDACTED");
  });

  it("passes through benign content unchanged", () => {
    const raw = "The database uses PostgreSQL 16.";
    expect(sanitizeMemoryContent(raw)).toBe(raw);
  });
});
