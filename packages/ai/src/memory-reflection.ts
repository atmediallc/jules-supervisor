/**
 * Reflection pipeline (Phase H).
 *
 * At the end of an AI execution, runs a structured reflection stage that
 * extracts only durable reusable lessons from the execution evidence. It
 * produces candidate memories — it never writes directly. Candidates then
 * pass through the admission pipeline.
 */
import {
  EvidenceClass,
  MemoryCandidate,
  MemoryReflectionRequest,
  MemoryType,
  SourceTrust,
  SourceType,
} from "@jules/core";
import { logger } from "@jules/observability";

// ── Deterministic heuristic extractors ────────────────────────────────
// These are intentionally conservative and deterministic: they produce
// candidate lessons WITHOUT calling an LLM, so reflection is cheap and
// auditable. LLM-based semantic extraction is out of scope for the current
// deterministic-first design.

/** Detect failure signatures and build a failure-memory candidate. */
export function extractFailureCandidate(
  req: MemoryReflectionRequest,
): MemoryCandidate | null {
  if (req.outcome !== "failure" || !req.errors || req.errors.length === 0) {
    return null;
  }
  const symptom = req.errors[0]!.slice(0, 500);
  const content = [
    `Execution failed: ${req.task}`,
    `Symptom: ${symptom}`,
    `Attempted: ${req.actions.slice(-2).join("; ")}`,
    req.toolsUsed?.length
      ? `Tools used: ${req.toolsUsed.join(", ")}`
      : null,
    req.affectedPaths?.length
      ? `Affected paths: ${req.affectedPaths.join(", ")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    memoryType: "failure",
    title: `Failure: ${req.task.slice(0, 80)}`,
    canonicalContent: content,
    summary: `Failure in ${req.repositoryId}: ${symptom.slice(0, 160)}`,
    tags: ["failure", "execution", ...(req.toolsUsed ?? []).slice(0, 5)],
    importance: 0.6,
    confidence: 0.7,
    sourceType: "execution" as SourceType,
    sourceTrust: "ai_inferred" as SourceTrust,
    evidenceClass: "observed" as EvidenceClass,
    tenantId: req.tenantId,
    projectId: req.projectId,
    repositoryId: req.repositoryId,
    executionId: req.executionId,
    affectedPaths: req.affectedPaths,
    branch: req.branch,
    commitSha: req.commitSha,
  };
}

/** Extract a durable task-outcome lesson. */
export function extractTaskOutcomeCandidate(
  req: MemoryReflectionRequest,
): MemoryCandidate | null {
  const content = [
    `Task: ${req.task}`,
    `Outcome: ${req.outcome}`,
    `Actions: ${req.actions.join("; ")}`,
    req.plan ? `Plan: ${req.plan.slice(0, 400)}` : null,
    `Result: ${req.result.slice(0, 500)}`,
    req.errors?.length ? `Errors: ${req.errors.join("; ")}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const importance = req.outcome === "failure" ? 0.7 : 0.4;

  return {
    memoryType: "task_outcome" as MemoryType,
    title: `${req.outcome === "success" ? "Success" : req.outcome === "partial" ? "Partial" : "Failure"}: ${req.task.slice(0, 80)}`,
    canonicalContent: content,
    summary: `${req.outcome} in ${req.repositoryId}: ${req.task.slice(0, 140)}`,
    tags: ["task_outcome", req.outcome],
    importance,
    confidence: 0.6,
    sourceType: "execution" as SourceType,
    sourceTrust: "ai_inferred" as SourceTrust,
    evidenceClass: "observed" as EvidenceClass,
    tenantId: req.tenantId,
    projectId: req.projectId,
    repositoryId: req.repositoryId,
    executionId: req.executionId,
    affectedPaths: req.affectedPaths,
    branch: req.branch,
    commitSha: req.commitSha,
  };
}

/** Extract a procedural candidate when the execution reused a clear method. */
export function extractProceduralCandidate(
  req: MemoryReflectionRequest,
): MemoryCandidate | null {
  if (req.outcome === "failure" || req.actions.length < 2) {
    return null;
  }
  // Only promote when there's a clear repeatable action sequence.
  const actions = req.actions.filter((a) => a.length > 20);
  if (actions.length < 2) return null;

  return {
    memoryType: "procedural" as MemoryType,
    title: `Procedure: ${req.task.slice(0, 80)}`,
    canonicalContent: [
      `Task: ${req.task}`,
      `Steps:`,
      ...actions.map((a) => `  - ${a.slice(0, 300)}`),
      `Outcome: ${req.outcome}`,
    ].join("\n"),
    summary: `Reusable procedure for: ${req.task.slice(0, 140)}`,
    tags: ["procedure", "workflow"],
    importance: 0.5,
    confidence: 0.55,
    sourceType: "execution" as SourceType,
    sourceTrust: "ai_inferred" as SourceTrust,
    evidenceClass: "inferred" as EvidenceClass,
    tenantId: req.tenantId,
    projectId: req.projectId,
    repositoryId: req.repositoryId,
    executionId: req.executionId,
    affectedPaths: req.affectedPaths,
    branch: req.branch,
    commitSha: req.commitSha,
  };
}

/**
 * Runs the deterministic reflection stage. Returns an ordered list of
 * candidate memories (most valuable first). Callers feed these through the
 * admission pipeline.
 */
export function reflect(req: MemoryReflectionRequest): MemoryCandidate[] {
  const candidates: MemoryCandidate[] = [];
  const failure = extractFailureCandidate(req);
  if (failure) candidates.push(failure);
  const taskOutcome = extractTaskOutcomeCandidate(req);
  if (taskOutcome) candidates.push(taskOutcome);
  const procedural = extractProceduralCandidate(req);
  if (procedural) candidates.push(procedural);

  // Dedup candidates by (memoryType + fingerprint-ish content title).
  const seen = new Set<string>();
  const unique = candidates.filter((c) => {
    const key = `${c.memoryType}:${c.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  logger.debug("Reflection produced candidates", {
    executionId: req.executionId,
    count: unique.length,
  });
  return unique;
}
