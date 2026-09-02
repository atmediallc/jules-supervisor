import { createAiProvider } from "@jules/ai";
import { getConfig, setDbOverrides } from "@jules/config";
import {
  ActivityRepository,
  ApprovalRepository,
  AuditRepository,
  BudgetRepository,
  closeDatabase,
  DecisionRepository,
  getDatabase,
  KillSwitch,
  RepositoryKnowledgeRepository,
  SessionRepository,
  SyncCheckpointRepository,
  SystemSettingsRepository,
} from "@jules/db";
import { JulesApiClient, MockJulesClient } from "@jules/jules-client";
import { logger } from "@jules/observability";
import { PolicyEngine } from "@jules/policy";
import { Redis } from "ioredis";
import { InMemoryDistributedLock, RedisDistributedLock } from "./lock.js";
import { MemoryContextService } from "./memory-context.js";
import { SupervisionPipeline } from "./pipeline.js";
import { SessionWatcher } from "./poller.js";
import { BullMqSupervisorQueue, DirectSupervisorQueue } from "./queue.js";
import { startHealthServer, stopHealthServer } from "./health.js";
import { startReadyServer, stopReadyServer } from "./ready.js";

async function main() {
  // 1. Initial config from env vars
  const baseConfig = getConfig();

  // 2. Connect to DB and load admin-managed settings overrides
  const db = getDatabase(baseConfig.DATABASE_URL);
  try {
    const settingsRepo = new SystemSettingsRepository(db);
    const dbOverrides = await settingsRepo.getAsMap();
    if (Object.keys(dbOverrides).length > 0) {
      setDbOverrides(dbOverrides);
      logger.info(`Loaded ${Object.keys(dbOverrides).length} setting(s) from database`);
    }
  } catch {
    logger.warn("Could not load system_settings from DB — using env-only config");
  }

  // 3. Final config with DB overrides applied
  const config = getConfig();
  logger.info("Initializing Jules Supervisor Worker Daemon...", {
    mode: config.SUPERVISOR_MODE,
    provider: config.AI_PROVIDER_TYPE,
  });

  const sessionRepo = new SessionRepository(db);
  const activityRepo = new ActivityRepository(db);
  const decisionRepo = new DecisionRepository(db);
  const approvalRepo = new ApprovalRepository(db);
  const auditRepo = new AuditRepository(db);
  const budgetRepo = new BudgetRepository(db);
  const knowledgeRepo = new RepositoryKnowledgeRepository(db);

  // Initialize Jules Client (Live or Mock based on key placeholder)
  const julesClient =
    config.JULES_API_KEY === "mock-jules-key-placeholder"
      ? new MockJulesClient()
      : new JulesApiClient({
          baseUrl: config.JULES_API_BASE_URL,
          apiKey: config.JULES_API_KEY,
          timeoutMs: config.JULES_API_TIMEOUT_MS,
          rateLimitRps: config.JULES_RATE_LIMIT_RPS,
          maxRetries: 3,
        });

  // AI Provider
  const aiProvider = createAiProvider(config);

  // Policy Engine
  const policyEngine = new PolicyEngine();

  // P1: Runtime kill switch — authoritative, DB-backed safety gate.
  const killSwitch = new KillSwitch(new SystemSettingsRepository(db));

  // Distributed Lock (capture the underlying Redis client so shutdown can close it)
  let lock: InMemoryDistributedLock | RedisDistributedLock;
  let lockRedisClient: Redis | null = null;
  if (config.REDIS_ENABLED && !config.USE_IN_MEMORY_QUEUE_FALLBACK) {
    try {
      const redisClient = new Redis(config.REDIS_URL, { lazyConnect: true });
      redisClient.on("error", (err) => {
        logger.warn("Redis lock client connection error", { error: (err as Error).message });
      });
      await redisClient.connect();
      lock = new RedisDistributedLock(redisClient);
      lockRedisClient = redisClient;
    } catch {
      logger.warn("Redis unavailable for lock, falling back to InMemoryDistributedLock");
      lock = new InMemoryDistributedLock();
    }
  } else {
    lock = new InMemoryDistributedLock();
  }

  // P1: Cross-session relational memory service (advisory evidence)
  const memoryService = new MemoryContextService(decisionRepo, knowledgeRepo, {
    maxSuccess: config.MEMORY_PRECEDENT_MAX_SUCCESS,
    maxHumanReviewed: config.MEMORY_PRECEDENT_MAX_HUMAN_REVIEWED,
    maxFailures: config.MEMORY_PRECEDENT_MAX_FAILURES,
    maxKnowledgeItems: config.MEMORY_KNOWLEDGE_MAX_ITEMS,
  });

  // Pipeline
  const pipeline = new SupervisionPipeline({
    config,
    julesClient,
    aiProvider,
    policyEngine,
    sessionRepo,
    activityRepo,
    decisionRepo,
    approvalRepo,
    auditRepo,
    budgetRepo,
    lock,
    memoryService,
    killSwitch,
  });

  // Log the initial runtime safety state so an operator immediately sees the
  // effective interlock state at boot (fail-closed: read errors → SAFETY_LOCKED).
  const bootSafety = await killSwitch.getState();
  logger.info("Runtime kill switch state at boot", {
    state: bootSafety.state,
    changedAt: bootSafety.changedAt,
    changedBy: bootSafety.changedBy,
    reason: bootSafety.reason,
  });

  // Queue
  //
  // If we cannot run BullMQ (Redis unavailable or explicitly configured to use
  // the in-memory queue), we degrade to the DirectSupervisorQueue and tell the
  // pipeline to run in DEGRADED mode: mutation-capable decisions escalate to
  // human review instead of auto-executing, so an unreliable worker never makes
  // un-reviewed, hard-to-recover external mutations.
  let usingDegradedQueue = false;
  const queue =
    config.REDIS_ENABLED && !config.USE_IN_MEMORY_QUEUE_FALLBACK
      ? new BullMqSupervisorQueue(config, pipeline)
      : (() => {
          usingDegradedQueue = true;
          return new DirectSupervisorQueue(pipeline);
        })();

  await queue.start().catch((err) => {
    usingDegradedQueue = true;
    logger.warn("Could not start BullMQ, using DirectSupervisorQueue fallback", {
      error: (err as Error).message,
    });
  });

  if (usingDegradedQueue) {
    pipeline.setDegradedMode(true);
  }

  // Session Watcher / Poller — reconciles every unseen activity per session
  // via a persisted sync_checkpoints cursor, catching up on all missed work
  // (not just the most recent activity) after downtime.
  const checkpointRepo = new SyncCheckpointRepository(db);
  const watcher = new SessionWatcher(config, julesClient, pipeline, checkpointRepo);
  await watcher.start();

  // Start health and ready servers
  startHealthServer();
  startReadyServer();

  // Graceful Shutdown
  //
  // Order is important for production correctness:
  //   1. Stop the poller so no NEW sessions are picked up.
  //   2. Stop the queue (drains in-flight BullMQ jobs; worker.close() waits
  //      for running jobs to complete before returning).
  //   3. Close the DB pool (closeDatabase) so no connections are leaked.
  //   4. Close the Redis lock client.
  //   5. Stop the health/ready HTTP servers.
  //
  // A bounded deadline guarantees the process never hangs on shutdown: if the
  // graceful steps exceed GRACEFUL_SHUTDOWN_TIMEOUT_MS, we force-exit.
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully...`, {
      timeoutMs: config.GRACEFUL_SHUTDOWN_TIMEOUT_MS,
    });

    // Arm a force-exit fallback so a wedged resource cannot hang the process.
    const forceTimer = setTimeout(() => {
      logger.error("Graceful shutdown exceeded deadline — forcing exit");
      process.exit(1);
    }, config.GRACEFUL_SHUTDOWN_TIMEOUT_MS);
    forceTimer.unref();

    try {
      // 1. Do not pick up new work.
      await watcher.stop();

      // 2. Drain the queue (waits for in-flight jobs to finish).
      await queue.stop();

      // 3. Close DB pool.
      await closeDatabase();
      logger.info("Database pool closed");

      // 4. Close the Redis lock client (if a Redis lock was in use).
      if (lockRedisClient) {
        await lockRedisClient.quit().catch(() => {
          lockRedisClient?.disconnect();
        });
        logger.info("Redis lock client closed");
      }

      // 5. Stop HTTP servers.
      stopHealthServer();
      stopReadyServer();

      logger.info("Graceful shutdown complete");
    } catch (err: unknown) {
      logger.error("Error during graceful shutdown", err);
    } finally {
      clearTimeout(forceTimer);
      process.exit(0);
    }
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  logger.fatal("Fatal error in Jules Supervisor Worker Daemon", err);
  process.exit(1);
});
