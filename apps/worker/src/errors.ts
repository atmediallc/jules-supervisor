/**
 * Structured error taxonomy for the worker.
 *
 * Every operational failure in the worker should be surfaced as a
 * `WorkerError` with a bounded, machine-readable `category` — mirroring the
 * bounded `classifyAiError` buckets in the AI layer. This keeps observability
 * and alerting stable (no unbounded err.name cardinality) and lets the
 * control plane reason about failure classes (e.g. "safety interlock" vs
 * "queue unavailable").
 */
export enum WorkerErrorCategory {
  /** Distributed-lock acquisition, renewal, or release failure. */
  LOCK = "LOCK",
  /** BullMQ / queue enqueue or drain failure. */
  QUEUE = "QUEUE",
  /** Data-layer (PostgreSQL) failure. */
  DATABASE = "DATABASE",
  /** Runtime kill-switch refused a mutation (PAUSED / SAFETY_LOCKED). */
  SAFETY_INTERLOCK = "SAFETY_INTERLOCK",
  /** Worker is degraded (infra unavailable) and escalated to human review. */
  DEGRADED_MODE = "DEGRADED_MODE",
  /** External mutation (sendMessage / approvePlan) failed. */
  EXECUTION = "EXECUTION",
  /** Session reconciliation / catch-up failed. */
  RECONCILIATION = "RECONCILIATION",
  /** Unclassified failure. */
  UNKNOWN = "UNKNOWN",
}

export class WorkerError extends Error {
  public readonly category: WorkerErrorCategory;

  constructor(
    category: WorkerErrorCategory,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "WorkerError";
    this.category = category;
  }
}

/**
 * Convenience factory for the runtime kill-switch refusal — the most safety-
 * critical error class in the worker.
 */
export function safetyInterlockError(state: string, reason: string): WorkerError {
  return new WorkerError(
    WorkerErrorCategory.SAFETY_INTERLOCK,
    `Pre-mutation safety block: ${state} — ${reason}`,
  );
}
