import { describe, expect, it } from "vitest";
import { TokenBucketRateLimiter } from "./rate-limiter.js";

describe("TokenBucketRateLimiter", () => {
  it("allows immediate tokens within capacity", async () => {
    const limiter = new TokenBucketRateLimiter(5, 5);
    const start = Date.now();
    await limiter.acquire(2);
    expect(Date.now() - start).toBeLessThan(100);
  });

  it("throws when abort signal is triggered", async () => {
    const limiter = new TokenBucketRateLimiter(1, 1);
    await limiter.acquire(1); // empty bucket

    const controller = new AbortController();
    controller.abort();

    await expect(limiter.acquire(1, controller.signal)).rejects.toThrow("Operation aborted");
  });
});
