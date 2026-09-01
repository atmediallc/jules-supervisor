/**
 * Correction Loop (autonomy audit P0 re-submission loop).
 *
 * Closes the deferred "full re-submission loop" of the correction design:
 *
 *   Jules result
 *     ↓
 *   Supervisor finds defect
 *     ↓
 *   sendMessage correction (this module fingerprints the instruction)
 *     ↓
 *   Jules repairs
 *     ↓
 *   Supervisor re-audits (classifyDefectResolution)
 *     ↓
 *   PASS or further correction (terminated by ceiling + fingerprint dedup)
 *
 * Pure / deterministic: no I/O. The caller (worker pipeline) owns sending the
 * correction message and persisting state. This module provides the decisions
 * that keep the loop from spinning forever:
 *
 *  1. fingerprintDefect  — normalized, repeatable signature of a correction
 *     instruction so identical corrections are never re-sent (prevents the
 *     same-correction infinite loop).
 *  2. canSubmitCorrection — terminates the loop when the per-session ceiling is
 *     reached OR the exact same defect was already corrected.
 *  3. classifyDefectResolution — re-audit verdict: did the correction change
 *     the artifact, or did it not address the defect (PASS / PARTIAL / FAIL).
 */
import { sha256 } from "@jules/shared";

/** Canonical, repeatable signature of a correction instruction. */
export function fingerprintDefect(instruction: string): string {
  return sha256(instruction.trim().toLowerCase());
}

/**
 * Whether a new correction may be submitted for the session.
 *
 * @param correctionCount  number of corrections already issued this session
 * @param maxCorrections   per-session ceiling (from BUDGET_MAX_CORRECTIONS_PER_SESSION)
 * @param priorFingerprints fingerprints of corrections already sent this session
 * @param instruction      the candidate correction instruction
 */
export function canSubmitCorrection(opts: {
  correctionCount: number;
  maxCorrections: number;
  priorFingerprints: Set<string>;
  instruction: string;
}): { allowed: boolean; reason: string | null } {
  if (opts.correctionCount >= opts.maxCorrections) {
    return {
      allowed: false,
      reason: `Correction budget exhausted (${opts.correctionCount}/${opts.maxCorrections})`,
    };
  }
  const fp = fingerprintDefect(opts.instruction);
  if (opts.priorFingerprints.has(fp)) {
    return {
      allowed: false,
      reason: "Identical correction already sent this session (defect fingerprint match)",
    };
  }
  return { allowed: true, reason: null };
}

export type DefectResolution =
  | { status: "PASS"; reason: string }
  | { status: "PARTIAL"; reason: string }
  | { status: "FAIL"; reason: string };

/**
 * Re-audit verdict after a correction. A correction that produced no change in
 * the artifact is FAIL (the defect was not addressed); a change addressing the
 * defect is PASS; a partial change is PARTIAL.
 */
export function classifyDefectResolution(opts: {
  defectAddressed: boolean;
  artifactChanged: boolean;
  detail?: string;
}): DefectResolution {
  if (opts.defectAddressed) {
    const reason =
      opts.detail ??
      "Corrected artifact addresses the previously identified defect";
    return opts.artifactChanged
      ? { status: "PASS", reason }
      : { status: "PARTIAL", reason: `${reason} (no artifact change recorded)` };
  }
  return {
    status: "FAIL",
    reason: "Defect not addressed by correction",
  };
}
