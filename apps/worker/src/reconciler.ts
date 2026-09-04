import { AppConfig } from "@jules/config";
import {
  DecisionRepository,
  ExecutionAttemptRepository,
  KillSwitch,
  safetyActionForState,
} from "@jules/db";
import { IJulesClient } from "@jules/jules-client";
import { logger, metrics } from "@jules/observability";
import { classifyExecutionEffect } from "./errors.js";

export interface ExecutionReconcilerDeps {
  config: AppConfig;
  julesClient: IJulesClient;
  executionAttemptRepo: ExecutionAttemptRepository;
  decisionRepo: DecisionRepository;
  /** Stable identity for claiming attempts (e.g. host:pid). */
  workerId: string;
  killSwitch?: KillSwitch;
}

export interface ReconcileResult {
  scanned: number;
  recovered: number;
  reDriven: number;
  succeeded: number;
  escalated: number;
}

/**
 * H3 durable-execution reconciler.
 *
 * Recovers attempts stranded by a worker that dispatched an external effect
 * (approvePlan / sendMessage) and then died before recording the outcome. Each
 * recovery re-drives the effect with the SAME idempotent clientToken the API
 * de-duplicates by, so it cannot double-apply — the effect is applied at most
 * once on the Jules side regardless of how many reconcilers/retries see it.
 *
 * Retries are bounded: each re-drive creates a new attempt row (attemptNumber
 * increments) up to EXECUTION_MAX_ATTEMPTS; past that the attempt is escalated
 * to a human (NEEDS_RECONCILIATION) instead of being retried forever.
 * Ambiguous outcomes (effect may have applied) are never blindly re-sent to a
 * fresh token — they are escalated for human verification.
 */
export class ExecutionReconciler {
  private readonly config: AppConfig;
  private readonly julesClient: IJulesClient;
  private readonly executionAttemptRepo: ExecutionAttemptRepository;
  private readonly decisionRepo: DecisionRepository;
  private readonly workerId: string;
  private readonly killSwitch: KillSwitch | null;

  constructor(deps: ExecutionReconcilerDeps) {
    this.config = deps.config;
    this.julesClient = deps.julesClient;
    this.executionAttemptRepo = deps.executionAttemptRepo;
    this.decisionRepo = deps.decisionRepo;
    this.workerId = deps.workerId;
    this.killSwitch = deps.killSwitch ?? null;
  }

  /** Run one reconciliation pass (idempotent, safe to call on a timer). */
  public async reconcileOnce(): Promise<ReconcileResult> {
    const leaseMs = this.config.EXECUTION_ATTEMPT_LEASE_MS;
    const maxAttempts = this.config.EXECUTION_MAX_ATTEMPTS;
    const stale = await this.executionAttemptRepo.findStaleAttempts(leaseMs);

    const result: ReconcileResult = {
      scanned: stale.length,
      recovered: 0,
      reDriven: 0,
      succeeded: 0,
      escalated: 0,
    };

    for (const attempt of stale) {
      // Atomically reclaim. If null, another reconciler already claimed it.
      const claimed = await this.executionAttemptRepo.recoverStale(
        attempt.id,
        this.workerId,
        leaseMs,
      );
      if (!claimed) continue;
      result.recovered += 1;

      // Safety gate: never (re)apply an external effect when not RUNNING.
      if (this.killSwitch) {
        const rec = await this.killSwitch.getState();
        if (!this.killSwitch.isRunning(rec)) {
          const guard = safetyActionForState(rec);
          logger.warn("Reconciler refused re-drive (safety interlock)", {
            attemptId: claimed.id,
            decisionId: claimed.decisionId,
            safetyState: rec.state,
            reason: guard.reason,
          });
          metrics.incrementSafetyInterlock();
          await this.executionAttemptRepo.markNeedsReconciliation(
            claimed.id,
            `safety interlock (${rec.state})`,
          );
          result.escalated += 1;
          continue;
        }
      }

      const decision = await this.decisionRepo.findById(claimed.decisionId);
      if (!decision) {
        await this.executionAttemptRepo.markFailed(claimed.id, "PERMANENT", "decision no longer exists");
        result.escalated += 1;
        continue;
      }

      // Bound re-drives: past EXECUTION_MAX_ATTEMPTS, escalate to a human.
      const prior = await this.executionAttemptRepo.listByDecision(claimed.decisionId);
      const nextNumber = Math.max(0, ...prior.map((p) => p.attemptNumber)) + 1;
      if (nextNumber > maxAttempts) {
        logger.error("Execution retry ceiling reached — escalating to human", {
          decisionId: claimed.decisionId,
          attempts: nextNumber - 1,
        });
        await this.executionAttemptRepo.markNeedsReconciliation(
          claimed.id,
          `retry ceiling reached (${maxAttempts})`,
        );
        result.escalated += 1;
        continue;
      }

      // Re-drive with a NEW attempt row but the SAME clientToken (idempotency).
      const clientToken = claimed.clientToken ?? undefined;
      const newAttemptId = `exec-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
      await this.executionAttemptRepo.create({
        id: newAttemptId,
        decisionId: claimed.decisionId,
        attemptNumber: nextNumber,
        clientToken: clientToken ?? null,
      });
      await this.executionAttemptRepo.claimPending(newAttemptId, this.workerId, leaseMs);
      await this.executionAttemptRepo.markExecuting(newAttemptId, this.workerId);
      result.reDriven += 1;

      try {
        const response = decision.proposedResponse ?? "";
        if (decision.action !== "APPROVE_PLAN" && response === "") {
          throw new Error("decision has no response to re-drive; cannot reconstruct effect");
        }
        if (decision.action === "APPROVE_PLAN") {
          await this.julesClient.approvePlan(decision.sessionId, {
            approved: true,
            feedback: decision.proposedResponse ?? undefined,
            clientToken,
          });
        } else {
          // RESPOND / REQUEST_CHANGES — apply the saved decision response.
          await this.julesClient.sendMessage(decision.sessionId, {
            message: response,
            clientToken,
          });
        }
        await this.executionAttemptRepo.markSucceeded(newAttemptId);
        await this.executionAttemptRepo.markFailed(
          claimed.id,
          "TRANSIENT",
          `Superseded by re-drive attempt ${newAttemptId}`,
        );
        await this.decisionRepo.markExecuted(claimed.decisionId, "EXECUTED");
        result.succeeded += 1;
      } catch (err) {
        const classification = classifyExecutionEffect(err);
        const message = (err as Error).message ?? String(err);
        logger.error(
          `Reconciler re-drive failed (${classification.category}) — escalating to human`,
          err,
          { decisionId: claimed.decisionId, attemptId: newAttemptId },
        );
        // Any failure during reconciliation escalates to a human. The effect may
        // or may not have applied; never silently auto-loop a mutation without
        // human visibility. Marking UNKNOWN_EFFECT (terminal) guarantees the
        // attempt is not re-picked on the next pass.
        await this.executionAttemptRepo.markUnknownEffect(newAttemptId, "AMBIGUOUS", message);
        await this.executionAttemptRepo.markFailed(
          claimed.id,
          "TRANSIENT",
          `Superseded by re-drive attempt ${newAttemptId} which failed: ${message}`,
        );
        await this.decisionRepo.markExecuted(claimed.decisionId, "UNKNOWN_EFFECT", message);
        result.escalated += 1;
      }
    }

    if (result.recovered > 0) {
      logger.info("Execution reconciler pass complete", { ...result });
    }
    return result;
  }
}
