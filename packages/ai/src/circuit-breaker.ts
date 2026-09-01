import { logger } from "@jules/observability";

/**
 * Minimal production-grade circuit breaker for AI provider calls.
 *
 * States:
 *   CLOSED     – normal operation, requests pass through.
 *   OPEN       – too many recent failures; requests fail fast (no hammering).
 *   HALF_OPEN  – after cooldown, a single probe request is allowed to test the
 *                provider; success -> CLOSED, failure -> OPEN again.
 *
 * DESIGN DECISION: this breaker is PROCESS-LOCAL by default.
 *   - The worker can scale horizontally, so a shared breaker *would* be more
 *     accurate across replicas. However, workers hold the distributed lock per
 *     session, so only one replica drives a given session's provider calls at a
 *     time. A process-local breaker still prevents one node from hammering a
 *     failing provider, which is the primary safety property we need.
 *   - Cross-worker shared state is intentionally NOT required for correctness
 *     here; persisting it would add Redis round-trips on every AI call for
 *     marginal benefit at this topology. If horizontal scale grows and a single
 *     provider is shared by many sessions concurrently, a Redis-backed breaker
 *     can be added without changing the interface below.
 */
export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CircuitBreakerOptions {
  /** Failures within the window that trip the breaker OPEN. */
  failureThreshold: number;
  /** Rolling window (ms) over which failures are counted. */
  windowMs: number;
  /** Cooldown (in ms) to wait before allowing a HALF_OPEN probe. */
  cooldownMs: number;
  /** Process-clock dependency for testing. */
  now?: () => number;
}

interface BreakerCounters {
  failures: number[];
  openedAt: number | null;
}

export class CircuitBreaker {
  private readonly failureThreshold: number;
  private readonly windowMs: number;
  private readonly cooldownMs: number;
  private readonly now: () => number;
  private state: CircuitState = "CLOSED";
  private failures: number[] = [];
  private openedAt: number | null = null;

  constructor(options?: Partial<CircuitBreakerOptions>) {
    this.failureThreshold = options?.failureThreshold ?? 5;
    this.windowMs = options?.windowMs ?? 60_000;
    this.cooldownMs = options?.cooldownMs ?? 30_000;
    this.now = options?.now ?? Date.now;
  }

  /** Advances OPEN -> HALF_OPEN once the cooldown has elapsed. */
  private refreshState(): void {
    if (this.state === "OPEN" && this.openedAt !== null) {
      const t = this.now();
      if (t - this.openedAt >= this.cooldownMs) {
        this.state = "HALF_OPEN";
      }
    }
  }

  public getState(): CircuitState {
    this.refreshState();
    return this.state;
  }

  /**
   * Whether a request is allowed to proceed right now. When the circuit is
   * OPEN it returns false so callers short-circuit without hitting the network.
   */
  public isAllowed(): boolean {
    this.refreshState();
    return this.state !== "OPEN";
  }

  /** Record a successful attempt: resets the failure window and closes the circuit. */
  public onSuccess(): void {
    this.failures = [];
    this.openedAt = null;
    this.state = "CLOSED";
  }

  /**
   * Record a failed attempt. Returns true if this failure tripped the circuit
   * into OPEN (caller may log the transition once).
   */
  public onFailure(): boolean {
    this.refreshState();
    const t = this.now();
    this.failures.push(t);
    this.failures = this.failures.filter((ts) => t - ts < this.windowMs);

    // A HALF_OPEN probe failing re-opens immediately.
    if (this.state === "HALF_OPEN") {
      this.state = "OPEN";
      this.openedAt = t;
      return true;
    }

    if (this.state === "OPEN") {
      return false;
    }

    if (this.failures.length >= this.failureThreshold) {
      this.state = "OPEN";
      this.openedAt = t;
      logger.warn("Provider circuit breaker OPEN", {
        failures: this.failures.length,
        windowMs: this.windowMs,
      });
      return true;
    }
    return false;
  }

  /** Reset to CLOSED (used on operator action / config change). */
  public reset(): void {
    this.failures = [];
    this.openedAt = null;
    this.state = "CLOSED";
  }
}
