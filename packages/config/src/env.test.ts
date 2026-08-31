import { describe, expect, it } from "vitest";
import { EnvSchema } from "./env.js";

describe("Environment Configuration Schema", () => {
  it("defaults to DRY_RUN execution mode and false for auto flags", () => {
    const parsed = EnvSchema.parse({});
    expect(parsed.SUPERVISOR_MODE).toBe("DRY_RUN");
    expect(parsed.AUTO_RESPOND_ENABLED).toBe(false);
    expect(parsed.AUTO_PLAN_APPROVAL_ENABLED).toBe(false);
    expect(parsed.CONFIDENCE_THRESHOLD).toBe(0.85);
  });

  it("parses valid custom environment options", () => {
    const parsed = EnvSchema.parse({
      SUPERVISOR_MODE: "AUTO_RESPOND",
      AUTO_RESPOND_ENABLED: "true",
      CONFIDENCE_THRESHOLD: "0.90",
      POLL_INTERVAL_MS: "3000",
    });
    expect(parsed.SUPERVISOR_MODE).toBe("AUTO_RESPOND");
    expect(parsed.AUTO_RESPOND_ENABLED).toBe(true);
    expect(parsed.CONFIDENCE_THRESHOLD).toBe(0.9);
    expect(parsed.POLL_INTERVAL_MS).toBe(3000);
  });

  it("defaults P1 memory retrieval bounds to safe values", () => {
    const parsed = EnvSchema.parse({});
    expect(parsed.MEMORY_PRECEDENT_MAX_SUCCESS).toBe(10);
    expect(parsed.MEMORY_PRECEDENT_MAX_HUMAN_REVIEWED).toBe(5);
    expect(parsed.MEMORY_PRECEDENT_MAX_FAILURES).toBe(3);
    expect(parsed.MEMORY_KNOWLEDGE_MAX_ITEMS).toBe(20);
    expect(parsed.MEMORY_ADVISORY_TOKEN_BUDGET).toBe(1024);
  });

  it("coerces string MEMORY_* values and enforces MEMORY_ADVISORY_TOKEN_BUDGET range", () => {
    const parsed = EnvSchema.parse({
      MEMORY_PRECEDENT_MAX_SUCCESS: "7",
      MEMORY_PRECEDENT_MAX_HUMAN_REVIEWED: "4",
      MEMORY_PRECEDENT_MAX_FAILURES: "2",
      MEMORY_KNOWLEDGE_MAX_ITEMS: "15",
      MEMORY_ADVISORY_TOKEN_BUDGET: "2048",
    });
    expect(parsed.MEMORY_PRECEDENT_MAX_SUCCESS).toBe(7);
    expect(parsed.MEMORY_PRECEDENT_MAX_HUMAN_REVIEWED).toBe(4);
    expect(parsed.MEMORY_PRECEDENT_MAX_FAILURES).toBe(2);
    expect(parsed.MEMORY_KNOWLEDGE_MAX_ITEMS).toBe(15);
    expect(parsed.MEMORY_ADVISORY_TOKEN_BUDGET).toBe(2048);

    // Out-of-range advisory budget must be rejected (min 128, max 4096).
    const invalid = EnvSchema.safeParse({ MEMORY_ADVISORY_TOKEN_BUDGET: "64" });
    expect(invalid.success).toBe(false);
  });
});
