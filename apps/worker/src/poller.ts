import { AppConfig } from "@jules/config";
import { IJulesClient } from "@jules/jules-client";
import { logger } from "@jules/observability";
import { calculateBackoff, sleep } from "@jules/shared";
import { SupervisionPipeline } from "./pipeline.js";

export class SessionWatcher {
  private isRunning = false;
  private abortController: AbortController | null = null;
  private pollingTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly config: AppConfig,
    private readonly julesClient: IJulesClient,
    private readonly pipeline: SupervisionPipeline,
  ) {}

  public async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    this.abortController = new AbortController();

    logger.info("Starting Jules Session Watcher / Poller...", {
      pollIntervalMs: this.config.POLL_INTERVAL_MS,
      mode: this.config.SUPERVISOR_MODE,
    });

    this.pollLoop();
  }

  public async stop(): Promise<void> {
    this.isRunning = false;
    if (this.pollingTimer) clearTimeout(this.pollingTimer);
    if (this.abortController) this.abortController.abort();
    logger.info("Jules Session Watcher stopped.");
  }

  private async pollLoop(): Promise<void> {
    let consecutiveErrors = 0;

    while (this.isRunning) {
      const signal = this.abortController?.signal;
      if (signal?.aborted) break;

      try {
        await this.syncActiveSessions(signal);
        consecutiveErrors = 0;
      } catch (err: unknown) {
        if (signal?.aborted) break;
        consecutiveErrors++;
        const backoff = calculateBackoff(consecutiveErrors, this.config.POLL_INTERVAL_MS, 60000);
        logger.error(
          `Error during Jules sync cycle (attempt ${consecutiveErrors}), backing off for ${backoff}ms`,
          err,
        );
        await sleep(backoff, signal).catch(() => {});
        continue;
      }

      await sleep(this.config.POLL_INTERVAL_MS, signal).catch(() => {});
    }
  }

  public async syncActiveSessions(signal?: AbortSignal): Promise<void> {
    const listResponse = await this.julesClient.listSessions({}, signal);
    const sessions = listResponse.sessions;

    for (const session of sessions) {
      if (signal?.aborted) break;

      // Only inspect sessions in active or awaiting states
      const needsInspection =
        session.state === "AWAITING_USER_INPUT" ||
        session.state === "AWAITING_PLAN_APPROVAL" ||
        session.state === "IN_PROGRESS" ||
        session.state === "PLANNING";

      if (!needsInspection) continue;

      try {
        const activitiesRes = await this.julesClient.listActivities(
          session.id,
          { pageSize: 20 },
          signal,
        );
        const activities = activitiesRes.activities;

        if (activities.length > 0) {
          const lastActivity = activities[activities.length - 1]!;
          await this.pipeline.processActivity({
            session,
            activity: lastActivity,
          });
        }
      } catch (err: unknown) {
        logger.error(`Failed to process session ${session.id}`, err);
      }
    }
  }
}
