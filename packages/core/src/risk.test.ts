import { describe, expect, it } from "vitest";
import { calculateDeterministicRisk } from "./risk.js";

describe("calculateDeterministicRisk", () => {
  it("flags destructive SQL as critical risk", () => {
    const result = calculateDeterministicRisk({
      diff: "DROP TABLE users CASCADE;",
    });
    expect(result.level).toBe("critical");
    expect(result.reasons[0]).toContain("destructive pattern");
  });

  it("flags touching .env files as critical risk", () => {
    const result = calculateDeterministicRisk({
      filesChanged: ["src/index.ts", ".env.production"],
    });
    expect(result.level).toBe("critical");
    expect(result.reasons[0]).toContain("critical security or migration path");
  });

  it("flags touching migrations directory as critical risk", () => {
    const result = calculateDeterministicRisk({
      filesChanged: ["migrations/0001_init.sql"],
    });
    expect(result.level).toBe("critical");
  });

  it("flags package.json changes as medium risk", () => {
    const result = calculateDeterministicRisk({
      filesChanged: ["package.json"],
    });
    expect(result.level).toBe("medium");
  });

  it("classifies standard safe docs or tests as low risk", () => {
    const result = calculateDeterministicRisk({
      filesChanged: ["docs/README.md", "src/math.test.ts"],
    });
    expect(result.level).toBe("low");
  });
});
