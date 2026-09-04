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

// ── Execution-effect error classification (H3 durable attempts) ───────────
// When an external effect (approvePlan / sendMessage) throws, the worker must
// decide whether the effect may already have been applied so the durable
// execution-attempt ledger can be marked correctly:
//   PERMANENT — deterministic failure; the effect was NOT applied and retrying
//               the same token will fail identically. Escalate to a human.
//   TRANSIENT — temporary infra/transport failure; the effect was NOT applied
//               and a retry with the SAME clientToken is safe & likely to
//               succeed (the Jules API is idempotent by clientToken).
//   AMBIGUOUS — the request may have reached the API (timeout / dropped
//               connection mid-flight); the effect MAY have applied. Never
//               blindly re-send a NEW mutation; reconcile against live state
//               with the SAME token, or escalate to a human.

export type ExecutionEffectCategory = "PERMANENT" | "TRANSIENT" | "AMBIGUOUS";

export interface ExecutionEffectClassification {
  category: ExecutionEffectCategory;
  reason: string;
}

const TRANSIENT_MARKERS = [
  "econnreset",
  "econnrefused",
  "econnaborted",
  "socket hang up",
  "socket closed",
  "network",
  "temporary",
  "503",
  "502",
  "429",
  "service unavailable",
  "bad gateway",
];

const AMBIGUOUS_MARKERS = [
  "timeout",
  "timed out",
  "deadline",
  "aborted",
  "fetch failed",
  "undici",
  "the operation was aborted",
];

/** Deterministic failures that will never succeed on retry with the same token. */
const PERMANENT_MARKERS = [
  "correction loop terminated",
  "session state changed",
  "safety block",
  "safety interlock",
  "validation",
  "invalid request",
  "401",
  "403",
  "404",
  "400",
];

export function classifyExecutionEffect(err: unknown): ExecutionEffectClassification {
  const message = (err instanceof Error ? `${err.name}: ${err.message}` : String(err)).toLowerCase();
  const categoryOf = (markers: string[]): boolean => markers.some((m) => message.includes(m));

  // Worker-internal safety/control errors are deterministic refusals.
  if (err instanceof WorkerError) {
    if (
      err.category === WorkerErrorCategory.SAFETY_INTERLOCK ||
      err.category === WorkerErrorCategory.DEGRADED_MODE
    ) {
      return { category: "PERMANENT", reason: `worker refused: ${err.category}` };
    }
  }

  if (categoryOf(AMBIGUOUS_MARKERS)) {
    return { category: "AMBIGUOUS", reason: "effect may have applied before failure" };
  }
  if (categoryOf(PERMANENT_MARKERS)) {
    return { category: "PERMANENT", reason: "deterministic failure; retry will not succeed" };
  }
  if (categoryOf(TRANSIENT_MARKERS)) {
    return { category: "TRANSIENT", reason: "transient infrastructure failure; safe to retry with same token" };
  }
  // Unknown errors default to AMBIGUOUS (conservative: assume the effect may
  // have applied rather than risk a conflicting re-send without verification).
  return { category: "AMBIGUOUS", reason: "unclassified failure; treat effect as possibly-applied" };
}

