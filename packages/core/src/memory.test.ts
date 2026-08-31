import { describe, expect, it } from "vitest";
import {
  MEMORY_ADVISORY_TEXT,
  MEMORY_RETRIEVAL_BOUNDS,
  PRECEDENT_CLASS_RANK,
  PRECEDENT_POLARITY,
  classifyPrecedent,
  orderPrecedentsByTrust,
  selectPrecedentsWithinBounds,
} from "./memory.js";
import type { PrecedentClass, SortablePrecedent } from "./memory.js";

function p(id: string, precedentClass: PrecedentClass, observedAt: Date | null): SortablePrecedent {
  return { id, precedentClass, observedAt };
}

describe("classifyPrecedent", () => {
  it("classifies human-edited success as HUMAN_EDITED_SUCCESS", () => {
    expect(classifyPrecedent({ outcome: "SUCCESS", humanAction: "APPROVED_AFTER_EDIT" })).toBe(
      "HUMAN_EDITED_SUCCESS",
    );
  });

  it("classifies human-approved success as HUMAN_APPROVED_SUCCESS", () => {
    expect(classifyPrecedent({ outcome: "SUCCESS", humanAction: "APPROVED_UNCHANGED" })).toBe(
      "HUMAN_APPROVED_SUCCESS",
    );
  });

  it("classifies partial success with edit as HUMAN_EDITED_SUCCESS", () => {
    expect(
      classifyPrecedent({ outcome: "PARTIAL_SUCCESS", humanAction: "APPROVED_AFTER_EDIT" }),
    ).toBe("HUMAN_EDITED_SUCCESS");
  });

  it("classifies unreviewed success as AUTOMATED_ACCEPTED", () => {
    expect(classifyPrecedent({ outcome: "SUCCESS", humanAction: null })).toBe("AUTOMATED_ACCEPTED");
  });

  it("classifies EXECUTED_ACCEPTED as AUTOMATED_ACCEPTED", () => {
    expect(classifyPrecedent({ outcome: "EXECUTED_ACCEPTED", humanAction: null })).toBe(
      "AUTOMATED_ACCEPTED",
    );
  });

  it("classifies FAILED as AUTOMATED_FAILURE (negative-only)", () => {
    expect(classifyPrecedent({ outcome: "FAILED", humanAction: null })).toBe("AUTOMATED_FAILURE");
    expect(PRECEDENT_POLARITY.AUTOMATED_FAILURE).toBe("NEGATIVE_ONLY");
  });

  it("classifies REJECTED as HUMAN_REJECTED (negative-only)", () => {
    expect(classifyPrecedent({ outcome: "REJECTED", humanAction: null })).toBe("HUMAN_REJECTED");
    expect(PRECEDENT_POLARITY.HUMAN_REJECTED).toBe("NEGATIVE_ONLY");
  });

  it("classifies null/unknown outcomes as OUTCOME_UNKNOWN (advisory)", () => {
    expect(classifyPrecedent({ outcome: null, humanAction: null })).toBe("OUTCOME_UNKNOWN");
    expect(classifyPrecedent({ outcome: "UNKNOWN", humanAction: "APPROVED_UNCHANGED" })).toBe(
      "OUTCOME_UNKNOWN",
    );
    expect(PRECEDENT_POLARITY.OUTCOME_UNKNOWN).toBe("ADVISORY");
  });

  it("treats human review of a failure as failure (negative wins)", () => {
    // FAILED + APPROVED_AFTER_EDIT must not become a success class.
    expect(classifyPrecedent({ outcome: "FAILED", humanAction: "APPROVED_AFTER_EDIT" })).toBe(
      "AUTOMATED_FAILURE",
    );
    expect(classifyPrecedent({ outcome: "REJECTED", humanAction: "APPROVED_UNCHANGED" })).toBe(
      "HUMAN_REJECTED",
    );
  });

  it("classification is deterministic for identical inputs", () => {
    const a = classifyPrecedent({ outcome: "SUCCESS", humanAction: "APPROVED_AFTER_EDIT" });
    const b = classifyPrecedent({ outcome: "SUCCESS", humanAction: "APPROVED_AFTER_EDIT" });
    expect(a).toBe(b);
    expect(a).toBe("HUMAN_EDITED_SUCCESS");
  });
});

describe("orderPrecedentsByTrust", () => {
  it("orders by class rank ascending (most trusted first)", () => {
    const rows = [
      p("3", "AUTOMATED_FAILURE", new Date("2026-01-03T00:00:00Z")),
      p("1", "HUMAN_EDITED_SUCCESS", new Date("2026-01-01T00:00:00Z")),
      p("2", "HUMAN_APPROVED_SUCCESS", new Date("2026-01-02T00:00:00Z")),
    ];
    const ordered = orderPrecedentsByTrust(rows);
    expect(ordered.map((r) => r.id)).toEqual(["1", "2", "3"]);
  });

  it("breaks ties by recency (newest first)", () => {
    const rows = [
      p("older", "AUTOMATED_ACCEPTED", new Date("2026-01-01T00:00:00Z")),
      p("newer", "AUTOMATED_ACCEPTED", new Date("2026-02-01T00:00:00Z")),
    ];
    const ordered = orderPrecedentsByTrust(rows);
    expect(ordered.map((r) => r.id)).toEqual(["newer", "older"]);
  });

  it("breaks final ties deterministically by id (desc)", () => {
    const rows = [p("a", "AUTOMATED_ACCEPTED", null), p("b", "AUTOMATED_ACCEPTED", null)];
    const ordered = orderPrecedentsByTrust(rows);
    expect(ordered.map((r) => r.id)).toEqual(["b", "a"]);
  });
});

describe("selectPrecedentsWithinBounds", () => {
  it("caps positive precedents at maxSuccess", () => {
    const rows = [
      p("s1", "HUMAN_EDITED_SUCCESS", new Date("2026-01-01T00:00:00Z")),
      p("s2", "HUMAN_APPROVED_SUCCESS", new Date("2026-01-02T00:00:00Z")),
      p("s3", "HUMAN_APPROVED_SUCCESS", new Date("2026-01-03T00:00:00Z")),
    ];
    const out = selectPrecedentsWithinBounds({
      rows,
      maxSuccess: 2,
      maxHumanReviewed: 2,
      maxFailures: 2,
    });
    // Cap works: only 2 positive rows survive. Among the two
    // HUMAN_APPROVED_SUCCESS ties, the more recent (s3) wins deterministically.
    expect(out.map((r) => r.id)).toEqual(["s1", "s3"]);
  });

  it("keeps negative precedents separate from the positive budget", () => {
    const rows = [
      p("f1", "AUTOMATED_FAILURE", new Date("2026-01-01T00:00:00Z")),
      p("f2", "HUMAN_REJECTED", new Date("2026-01-02T00:00:00Z")),
      p("f3", "AUTOMATED_FAILURE", new Date("2026-01-03T00:00:00Z")),
    ];
    const out = selectPrecedentsWithinBounds({
      rows,
      maxSuccess: 2,
      maxHumanReviewed: 2,
      maxFailures: 3,
    });
    // Failures fill their own quota regardless of positive budget; within
    // the quota, scan order is trust-then-recency: HUMAN_REJECTED outranks
    // AUTOMATED_FAILURE even when less recent.
    expect(out.map((r) => r.id)).toEqual(["f2", "f3", "f1"]);
  });

  it("excludes positive rows beyond both quotas", () => {
    const rows = [
      p("s1", "HUMAN_EDITED_SUCCESS", new Date("2026-01-01T00:00:00Z")),
      p("s2", "HUMAN_APPROVED_SUCCESS", new Date("2026-01-02T00:00:00Z")),
    ];
    const out = selectPrecedentsWithinBounds({
      rows,
      maxSuccess: 1,
      maxHumanReviewed: 1,
      maxFailures: 1,
    });
    // s1 goes to positive quota; s2 exceeds humanReviewed quota → dropped.
    expect(out.map((r) => r.id)).toEqual(["s1"]);
  });

  it("fills failures quota with most recent first", () => {
    const rows = [
      p("old-f", "AUTOMATED_FAILURE", new Date("2026-01-01T00:00:00Z")),
      p("new-f", "AUTOMATED_FAILURE", new Date("2026-03-01T00:00:00Z")),
      p("mid-f", "AUTOMATED_FAILURE", new Date("2026-02-01T00:00:00Z")),
    ];
    const out = selectPrecedentsWithinBounds({
      rows,
      maxSuccess: 1,
      maxHumanReviewed: 1,
      maxFailures: 2,
    });
    expect(out.map((r) => r.id)).toEqual(["new-f", "mid-f"]);
  });

  it("returns an empty array for empty input", () => {
    expect(
      selectPrecedentsWithinBounds({
        rows: [],
        maxSuccess: 1,
        maxHumanReviewed: 1,
        maxFailures: 1,
      }),
    ).toEqual([]);
  });

  it("bounds are positive integers within absolute ceilings", () => {
    expect(MEMORY_RETRIEVAL_BOUNDS.PRECEDENT_FETCH_LIMIT).toBeGreaterThan(0);
    expect(MEMORY_RETRIEVAL_BOUNDS.KNOWLEDGE_FETCH_LIMIT).toBeGreaterThan(0);
    expect(MEMORY_RETRIEVAL_BOUNDS.MEMORY_SECTIONS_MAX_CHARS).toBeGreaterThan(0);
    expect(MEMORY_RETRIEVAL_BOUNDS.KNOWLEDGE_ITEM_MAX_CHARS).toBeGreaterThan(0);
    expect(MEMORY_RETRIEVAL_BOUNDS.PRECEDENT_EXCERPT_MAX_CHARS).toBeGreaterThan(0);
  });
});

describe("memory advisory text", () => {
  it("explicitly marks memory as untrusted advisory evidence", () => {
    expect(MEMORY_ADVISORY_TEXT).toMatch(/advisory evidence only/i);
    expect(MEMORY_ADVISORY_TEXT).toMatch(/untrusted/i);
    expect(MEMORY_ADVISORY_TEXT).toMatch(/MUST NOT override/i);
  });

  it("defines a total order on precedent classes", () => {
    const ranks = Object.values(PRECEDENT_CLASS_RANK);
    const unique = new Set(ranks);
    expect(unique.size).toBe(ranks.length);
  });
});
