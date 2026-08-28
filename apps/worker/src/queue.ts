import { AppConfig } from "@jules/config";
import { logger } from "@jules/observability";
import { Queue, Worker, Job, ConnectionOptions } from "bullmq";
import { Redis } from "ioredis";
import { SupervisionPipeline, ProcessActivityInput } from "./pipeline.js";

export interface ISupervisorQueue {
  enqueueActivity(input: ProcessActivityInput): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export class BullMqSupervisorQueue implements ISupervisorQueue {
  private queue: Queue | null = null;
  private worker: Worker | null = null;
  private redis: Redis | null = null;

  constructor(
    private readonly config: AppConfig,
    private readonly pipeline: SupervisionPipeline,
  ) {}

  public async start(): Promise<void> {
    const redisUrl = this.config.REDIS_URL || "redis://localhost:6379";
    this.redis = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      lazyConnect: true,
    });

    await this.redis.connect();

    this.queue = new Queue("jules-supervisor-activities", {
      connection: this.redis as unknown as ConnectionOptions,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 1000 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    });

    this.worker = new Worker(
      "jules-supervisor-activities",
      async (job: Job<ProcessActivityInput>) => {
        logger.info(`Processing queued activity job [${job.id}]`, {
          sessionId: job.data.session.id,
          activityId: job.data.activity.id,
        });
        await this.pipeline.processActivity(job.data);
      },
      {
        connection: this.redis as unknown as ConnectionOptions,
        concurrency: 5,
      },
    );

    this.worker.on("failed", (job, err) => {
      logger.error(`Job ${job?.id} failed`, err);
    });

    logger.info("BullMQ Supervisor Worker Queue started.");
  }

  public async enqueueActivity(input: ProcessActivityInput): Promise<void> {
    if (!this.queue) throw new Error("Queue is not started");
    const jobId = `${input.session.id}-${input.activity.id}`;
    await this.queue.add("process-activity", input, { jobId });
  }

  public async stop(): Promise<void> {
    if (this.worker) await this.worker.close();
    if (this.queue) await this.queue.close();
    if (this.redis) await this.redis.quit();
    logger.info("BullMQ Supervisor Worker Queue stopped.");
  }
}

export class DirectSupervisorQueue implements ISupervisorQueue {
  constructor(private readonly pipeline: SupervisionPipeline) {}

  public async start(): Promise<void> {
    logger.info("Direct in-memory queue runner started.");
  }

  public async enqueueActivity(input: ProcessActivityInput): Promise<void> {
    await this.pipeline.processActivity(input);
  }

  public async stop(): Promise<void> {
    logger.info("Direct in-memory queue runner stopped.");
  }
}
