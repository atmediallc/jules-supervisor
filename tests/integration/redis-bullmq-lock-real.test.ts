import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Redis } from "ioredis";
import { Queue, Worker } from "bullmq";
import { RedisDistributedLock } from "../../apps/worker/src/lock.js";
import { sleep } from "@jules/shared";

const REDIS_URL = process.env["REDIS_URL"] || "redis://127.0.0.1:6389";

describe("Real Redis & Distributed Lock Integration", () => {
  let redisClientA: Redis;
  let redisClientB: Redis;
  let lockA: RedisDistributedLock;
  let lockB: RedisDistributedLock;

  beforeAll(async () => {
    redisClientA = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
    redisClientB = new Redis(REDIS_URL, { maxRetriesPerRequest: null });

    lockA = new RedisDistributedLock(redisClientA);
    lockB = new RedisDistributedLock(redisClientB);
  });

  afterAll(async () => {
    await Promise.all([redisClientA.quit(), redisClientB.quit()]);
  });

  it("handles lock acquisition and contention across independent Redis clients", async () => {
    const resource = `res_contention_${Date.now()}`;

    // Client A acquires lock
    const tokenA = await lockA.acquire(resource, 10000);
    expect(tokenA).not.toBeNull();
    expect(typeof tokenA).toBe("string");

    // Client B attempts to acquire the exact same resource -> must fail (return null)
    const tokenB = await lockB.acquire(resource, 10000);
    expect(tokenB).toBeNull();

    // Client A releases lock with valid token
    const released = await lockA.release(resource, tokenA!);
    expect(released).toBe(true);

    // Now Client B can successfully acquire the resource
    const tokenBRetry = await lockB.acquire(resource, 10000);
    expect(tokenBRetry).not.toBeNull();

    await lockB.release(resource, tokenBRetry!);
  });

  it("proves ownership token security: worker B cannot release worker A's lock", async () => {
    const resource = `res_ownership_${Date.now()}`;

    // Client A acquires lock
    const tokenA = await lockA.acquire(resource, 10000);
    expect(tokenA).not.toBeNull();

    // Client B attempts to release with invalid/foreign token
    const illegitimateRelease = await lockB.release(resource, "foreign_bogus_token_12345");
    expect(illegitimateRelease).toBe(false);

    // Verify lock is still held in Redis by client A
    const rawVal = await redisClientA.get(`lock:${resource}`);
    expect(rawVal).toBe(tokenA);

    // Client A releases with legitimate token
    const legitimateRelease = await lockA.release(resource, tokenA!);
    expect(legitimateRelease).toBe(true);
  });

  it("proves lock expiry behavior after TTL passes", async () => {
    const resource = `res_expiry_${Date.now()}`;
    const shortTtlMs = 250;

    // Client A acquires lock with short TTL (250ms)
    const tokenA = await lockA.acquire(resource, shortTtlMs);
    expect(tokenA).not.toBeNull();

    // Immediate acquisition by B fails
    expect(await lockB.acquire(resource, 10000)).toBeNull();

    // Wait for TTL to expire
    await sleep(350);

    // After TTL expires, Client B can acquire the lock
    const tokenB = await lockB.acquire(resource, 10000);
    expect(tokenB).not.toBeNull();

    await lockB.release(resource, tokenB!);
  });

  it("proves adversarial lock ownership safety: Worker B lock survives when Worker A attempts release after TTL expiry", async () => {
    const resource = `res_adversarial_${Date.now()}`;
    const shortTtlMs = 200;

    // 1. Worker A obtains lock with token A
    const tokenA = await lockA.acquire(resource, shortTtlMs);
    expect(tokenA).not.toBeNull();

    // 2. A pauses beyond TTL
    await sleep(300);

    // 3. Worker B obtains same lock with token B
    const tokenB = await lockB.acquire(resource, 10000);
    expect(tokenB).not.toBeNull();
    expect(tokenB).not.toBe(tokenA);

    // 4 & 5. A resumes and attempts to release lock with its expired token A
    const releaseResultA = await lockA.release(resource, tokenA!);
    // A's release MUST fail (return false) because token A does not match current lock token B
    expect(releaseResultA).toBe(false);

    // 6. B's lock MUST survive intact in Redis
    const currentLockValue = await redisClientB.get(`lock:${resource}`);
    expect(currentLockValue).toBe(tokenB);

    // B cleanly releases its own lock
    const releaseResultB = await lockB.release(resource, tokenB!);
    expect(releaseResultB).toBe(true);

    const finalVal = await redisClientB.get(`lock:${resource}`);
    expect(finalVal).toBeNull();
  });
});

describe("Real BullMQ Queue Lifecycle & Job Processing over Redis", () => {
  let queue: Queue;
  const queueName = `test-bullmq-${Date.now()}`;
  const bullMqConnection = { host: "127.0.0.1", port: 6389 };

  beforeAll(async () => {
    queue = new Queue(queueName, {
      connection: bullMqConnection,
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: "exponential", delay: 100 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    });
  });

  afterAll(async () => {
    if (queue) await queue.close();
  });

  it("enqueues and consumes jobs through Redis with deterministic deduplication", async () => {
    const processedJobs: string[] = [];

    const worker = new Worker(
      queueName,
      async (job) => {
        processedJobs.push(job.id!);
        return { success: true, processedAt: Date.now() };
      },
      { connection: bullMqConnection },
    );

    const jobId = `job_dedup_${Date.now()}`;

    // Enqueue job
    await queue.add("test-job", { payload: "event_1" }, { jobId });

    // Enqueue duplicate job with same jobId
    await queue.add("test-job", { payload: "event_1_duplicate" }, { jobId });

    // Wait for worker to consume
    await sleep(500);

    // Exactly 1 job processed due to BullMQ jobId deduplication
    expect(processedJobs).toHaveLength(1);
    expect(processedJobs[0]).toBe(jobId);

    await worker.close();
  });

  it("observes failed jobs reaching terminal state after bounded retries", async () => {
    let attemptsCount = 0;

    const worker = new Worker(
      queueName,
      async () => {
        attemptsCount++;
        throw new Error(`Simulated permanent failure on attempt ${attemptsCount}`);
      },
      { connection: bullMqConnection },
    );

    const failedJobId = `job_fail_${Date.now()}`;
    const job = await queue.add(
      "failing-job",
      { data: "error_test" },
      { jobId: failedJobId, attempts: 2, backoff: { type: "fixed", delay: 50 } },
    );

    await sleep(600);

    const state = await job.getState();
    expect(state).toBe("failed");
    expect(attemptsCount).toBe(2);

    await worker.close();
  });
});
