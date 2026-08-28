import pino from "pino";
import { redactSensitiveData, sanitizeForLogs } from "@jules/shared";

export interface LogContext {
  correlationId?: string;
  sessionId?: string;
  activityId?: string;
  decisionId?: string;
  jobId?: string;
  provider?: string;
  model?: string;
  [key: string]: unknown;
}

const baseLogger = pino({
  level: process.env["LOG_LEVEL"] || "info",
  formatters: {
    log(obj) {
      return sanitizeForLogs(obj) as Record<string, unknown>;
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export class StructuredLogger {
  constructor(private readonly context: LogContext = {}) {}

  public child(extraContext: LogContext): StructuredLogger {
    return new StructuredLogger({ ...this.context, ...extraContext });
  }

  public trace(message: string, meta?: Record<string, unknown>): void {
    baseLogger.trace({ ...this.context, ...meta }, redactSensitiveData(message));
  }

  public debug(message: string, meta?: Record<string, unknown>): void {
    baseLogger.debug({ ...this.context, ...meta }, redactSensitiveData(message));
  }

  public info(message: string, meta?: Record<string, unknown>): void {
    baseLogger.info({ ...this.context, ...meta }, redactSensitiveData(message));
  }

  public warn(message: string, meta?: Record<string, unknown>): void {
    baseLogger.warn({ ...this.context, ...meta }, redactSensitiveData(message));
  }

  public error(message: string, error?: unknown, meta?: Record<string, unknown>): void {
    const errorDetails =
      error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack }
        : { rawError: error };
    baseLogger.error({ ...this.context, ...errorDetails, ...meta }, redactSensitiveData(message));
  }

  public fatal(message: string, error?: unknown, meta?: Record<string, unknown>): void {
    const errorDetails =
      error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack }
        : { rawError: error };
    baseLogger.fatal({ ...this.context, ...errorDetails, ...meta }, redactSensitiveData(message));
  }
}

export const logger = new StructuredLogger();
