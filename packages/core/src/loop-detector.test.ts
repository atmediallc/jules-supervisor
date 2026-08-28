import { describe, expect, it } from "vitest";
import { LoopDetector } from "./loop-detector.js";

describe("LoopDetector", () => {
  it("detects consecutive identical agent questions", () => {
    const detector = new LoopDetector({ maxConsecutiveIdenticalPrompts: 2 });
    const history = [
      { id: "1", type: "AGENT_MESSAGE", content: "Which DB to use?", timestamp: "t1" },
      { id: "2", type: "USER_MESSAGE", content: "PostgreSQL", timestamp: "t2" },
      { id: "3", type: "AGENT_MESSAGE", content: "Which DB to use?", timestamp: "t3" },
    ];

    const result = detector.evaluate(history);
    expect(result.isLoopDetected).toBe(true);
    expect(result.reason).toContain("Repeated identical agent prompt");
  });

  it("detects session exceeding maximum allowed cycles", () => {
    const detector = new LoopDetector({ maxTotalSessionCycles: 2 });
    const history = [
      { id: "1", type: "AGENT_MESSAGE", content: "Q1", timestamp: "t1" },
      { id: "2", type: "USER_MESSAGE", content: "A1", timestamp: "t2" },
      { id: "3", type: "AGENT_MESSAGE", content: "Q2", timestamp: "t3" },
      { id: "4", type: "USER_MESSAGE", content: "A2", timestamp: "t4" },
    ];

    const result = detector.evaluate(history);
    expect(result.isLoopDetected).toBe(true);
    expect(result.reason).toContain("maximum cycle limit");
  });
});
