import { sleep } from "@jules/shared";

export class TokenBucketRateLimiter {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private readonly capacity: number,
    private readonly refillRatePerSecond: number,
  ) {
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsedSeconds = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsedSeconds * this.refillRatePerSecond);
    this.lastRefill = now;
  }

  public async acquire(tokens = 1, signal?: AbortSignal): Promise<void> {
    while (true) {
      if (signal?.aborted) throw new Error("Operation aborted while waiting for rate limit token");
      this.refill();
      if (this.tokens >= tokens) {
        this.tokens -= tokens;
        return;
      }
      const missing = tokens - this.tokens;
      const waitMs = Math.ceil((missing / this.refillRatePerSecond) * 1000);
      await sleep(Math.min(waitMs, 500), signal);
    }
  }
}
