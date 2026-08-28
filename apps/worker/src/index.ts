import { createAiProvider } from "@jules/ai";
import { getConfig } from "@jules/config";
import {
  ActivityRepository,
  ApprovalRepository,
  AuditRepository,
  DecisionRepository,
  getDatabase,
  SessionRepository,
} from "@jules/db";
import { JulesApiClient, MockJulesClient } from "@jules/jules-client";
import { logger } from "@jules/observability";
import { PolicyEngine } from "@jules/policy";
import { Redis } from "ioredis";
import { InMemoryDistributedLock, RedisDistributedLock } from "./lock.js";
import { SupervisionPipeline } from "./pipeline.js";
import { SessionWatcher } from "./poller.js";
import { BullMqSupervisorQueue, DirectSupervisorQueue } from "./queue.js";

async function main() {
  const config = getConfig();
  logger.info("Initializing Jules Supervisor Worker Daemon...", {
    mode: config.SUPERVISOR_MODE,
    provider: config.AI_PROVIDER_TYPE,
  });

  const db = getDatabase(config.DATABASE_URL);

  const sessionRepo = new SessionRepository(db);
  const activityRepo = new ActivityRepository(db);
  const decisionRepo = new DecisionRepository(db);
  const approvalRepo = new ApprovalRepository(db);
  const auditRepo = new AuditRepository(db);

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

  // Distributed Lock
  let lock;
  if (config.REDIS_ENABLED && !config.USE_IN_MEMORY_QUEUE_FALLBACK) {
    try {
      const redisClient = new Redis(config.REDIS_URL, { lazyConnect: true });
      await redisClient.connect();
      lock = new RedisDistributedLock(redisClient);
    } catch {
      logger.warn("Redis unavailable for lock, falling back to InMemoryDistributedLock");
      lock = new InMemoryDistributedLock();
    }
  } else {
    lock = new InMemoryDistributedLock();
  }

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
    lock,
  });

  // Queue
  const queue =
    config.REDIS_ENABLED && !config.USE_IN_MEMORY_QUEUE_FALLBACK
      ? new BullMqSupervisorQueue(config, pipeline)
      : new DirectSupervisorQueue(pipeline);

  await queue.start().catch((err) => {
    logger.warn("Could not start BullMQ, using DirectSupervisorQueue fallback", {
      error: (err as Error).message,
    });
  });

  // Session Watcher / Poller
  const watcher = new SessionWatcher(config, julesClient, pipeline);
  await watcher.start();

  // Graceful Shutdown
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully...`);
    await watcher.stop();
    await queue.stop();
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  logger.fatal("Fatal error in Jules Supervisor Worker Daemon", err);
  process.exit(1);
});
