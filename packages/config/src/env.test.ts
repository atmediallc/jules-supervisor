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
});
