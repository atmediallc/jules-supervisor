import { describe, expect, it } from "vitest";
import { MemoryReflectionRequest } from "@jules/core";
import {
  reflect,
  extractFailureCandidate,
  extractTaskOutcomeCandidate,
  extractProceduralCandidate,
} from "./memory-reflection.js";

function makeRequest(overrides: Partial<MemoryReflectionRequest> = {}): MemoryReflectionRequest {
  return {
    executionId: "exec_1",
    tenantId: "t",
    projectId: "p",
    repositoryId: "repo",
    task: "Add redis lock to the poller",
    branch: "main",
    commitSha: "abc123",
    actions: [
      "Explored poller implementation in apps/worker/src/poller.ts",
      "Added lock acquisition before processing each job",
    ],
    result: "Lock added and tests passing.",
    outcome: "success",
    affectedPaths: ["apps/worker/src/poller.ts"],
    ...overrides,
  };
}

describe("extractFailureCandidate", () => {
  it("returns null when outcome is not failure", () => {
    expect(extractFailureCandidate(makeRequest())).toBeNull();
  });

  it("returns null when there are no errors", () => {
    expect(extractFailureCandidate(makeRequest({ outcome: "failure", errors: undefined }))).toBeNull();
  });

  it("builds a failure memory with observed evidence", () => {
    const req = makeRequest({
      outcome: "failure",
      errors: ["Connection refused to redis:6379"],
      actions: ["Tried to connect to redis"],
    });
    const c = extractFailureCandidate(req);
    expect(c).not.toBeNull();
    expect(c!.memoryType).toBe("failure");
    expect(c!.evidenceClass).toBe("observed");
    expect(c!.canonicalContent).toContain("Connection refused");
  });
});

describe("extractTaskOutcomeCandidate", () => {
  it("builds a task_outcome candidate for success", () => {
    const c = extractTaskOutcomeCandidate(makeRequest());
    expect(c).not.toBeNull();
    expect(c!.memoryType).toBe("task_outcome");
    expect(c!.importance).toBeLessThan(0.5);
  });

  it("weights failures higher", () => {
    const success = extractTaskOutcomeCandidate(makeRequest());
    const fail = extractTaskOutcomeCandidate(makeRequest({ outcome: "failure", errors: ["boom"] }));
    expect(fail!.importance).toBeGreaterThan(success!.importance);
  });
});

describe("extractProceduralCandidate", () => {
  it("returns null for failures", () => {
    expect(
      extractProceduralCandidate(makeRequest({ outcome: "failure", errors: ["x"] })),
    ).toBeNull();
  });

  it("returns null when there is no clear repeatable sequence", () => {
    const req = makeRequest({ actions: ["just one short action"] });
    expect(extractProceduralCandidate(req)).toBeNull();
  });

  it("builds a procedural candidate from repeatable steps", () => {
    const req = makeRequest({
      actions: [
        "Located the poller and inspected its lock handling logic in detail",
        "Introduced an idempotency guard at the top of the process loop",
        "Verified the guard against the existing race-condition tests",
      ],
    });
    const c = extractProceduralCandidate(req);
    expect(c).not.toBeNull();
    expect(c!.memoryType).toBe("procedural");
    expect(c!.evidenceClass).toBe("inferred");
  });
});

describe("reflect", () => {
  it("returns only a task_outcome candidate for a trivial success", () => {
    const req = makeRequest({
      outcome: "success",
      actions: ["ok"],
      result: "done",
    });
    const candidates = reflect(req);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.memoryType).toBe("task_outcome");
  });

  it("returns failure and task_outcome candidates on failure", () => {
    const req = makeRequest({
      outcome: "failure",
      errors: ["test failed"],
      result: "failed",
      actions: [
        "Ran the test suite and observed a failing assertion in pipeline.test.ts",
        "Inspected the assertion and located the misconfigured dependency",
      ],
    });
    const candidates = reflect(req);
    expect(candidates.length).toBeGreaterThanOrEqual(2);
    expect(candidates.some((c) => c.memoryType === "failure")).toBe(true);
    expect(candidates.some((c) => c.memoryType === "task_outcome")).toBe(true);
  });

  it("deduplicates candidates with identical type+title", () => {
    const req = makeRequest({
      outcome: "failure",
      errors: ["err"],
      result: "failed",
      actions: ["step one that is long enough to be meaningful here"],
    });
    // Manually dedupe check: reflect should not return two identical failure candidates.
    const candidates = reflect(req);
    const failures = candidates.filter((c) => c.memoryType === "failure");
    expect(failures.length).toBeLessThanOrEqual(1);
  });
});
