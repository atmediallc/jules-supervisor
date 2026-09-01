import { describe, expect, it } from "vitest";
import {
  canSubmitCorrection,
  classifyDefectResolution,
  fingerprintDefect,
} from "./correction-loop.js";

describe("fingerprintDefect", () => {
  it("is stable across calls for the same instruction", () => {
    expect(fingerprintDefect("Fix the p0 bug")).toBe(fingerprintDefect("Fix the p0 bug"));
  });

  it("is case- and whitespace-insensitive (normalized)", () => {
    expect(fingerprintDefect("  FIX THE P0 Bug  ")).toBe(fingerprintDefect("fix the p0 bug"));
  });

  it("differs for semantically different instructions", () => {
    expect(fingerprintDefect("Fix the p0 bug")).not.toBe(fingerprintDefect("Fix the p1 bug"));
  });
});

describe("canSubmitCorrection", () => {
  const baseOpts = {
    correctionCount: 0,
    maxCorrections: 3,
    priorFingerprints: new Set<string>(),
    instruction: "Correct the response format",
  };

  it("allows a correction when under the ceiling and not a duplicate", () => {
    const res = canSubmitCorrection(baseOpts);
    expect(res.allowed).toBe(true);
    expect(res.reason).toBeNull();
  });

  it("rejects once the per-session ceiling is reached (loop termination)", () => {
    const res = canSubmitCorrection({ ...baseOpts, correctionCount: 3, maxCorrections: 3 });
    expect(res.allowed).toBe(false);
    expect(res.reason).toContain("Correction budget exhausted");
  });

  it("rejects an identical correction already sent (defect fingerprint dedup)", () => {
    const prior = new Set([fingerprintDefect("Correct the response format")]);
    const res = canSubmitCorrection({ ...baseOpts, priorFingerprints: prior });
    expect(res.allowed).toBe(false);
    expect(res.reason).toContain("Identical correction");
  });
});

describe("classifyDefectResolution", () => {
  it("returns PASS when defect addressed and artifact changed", () => {
    const res = classifyDefectResolution({ defectAddressed: true, artifactChanged: true });
    expect(res.status).toBe("PASS");
  });

  it("returns PARTIAL when defect addressed but artifact unchanged", () => {
    const res = classifyDefectResolution({ defectAddressed: true, artifactChanged: false });
    expect(res.status).toBe("PARTIAL");
  });

  it("returns FAIL when defect not addressed", () => {
    const res = classifyDefectResolution({ defectAddressed: false, artifactChanged: false });
    expect(res.status).toBe("FAIL");
  });
});
