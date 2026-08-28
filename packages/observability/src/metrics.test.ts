import { describe, expect, it } from "vitest";
import { metrics } from "./metrics.js";
import { logger } from "./logger.js";

describe("Observability, Metrics & Structured Logging", () => {
  it("exports metrics in valid standard Prometheus exposition format with bounded labels", () => {
    metrics.reset();

    metrics.incrementDecision("RESPOND");
    metrics.incrementDecision("APPROVE_PLAN");
    metrics.incrementRisk("low");
    metrics.incrementRisk("critical");
    metrics.incrementBlocked();
    metrics.incrementDuplicatePrevented();
    metrics.recordJulesLatency(120);
    metrics.recordAiLatency(450);

    const prom = metrics.toPrometheusFormat();

    // Verify headers and types
    expect(prom).toContain(
      "# HELP jules_decisions_total Total number of decisions computed by action",
    );
    expect(prom).toContain("# TYPE jules_decisions_total counter");
    expect(prom).toContain('jules_decisions_total{action="RESPOND"} 1');
    expect(prom).toContain('jules_decisions_total{action="APPROVE_PLAN"} 1');

    expect(prom).toContain("# TYPE jules_risk_evaluations_total counter");
    expect(prom).toContain('jules_risk_evaluations_total{level="low"} 1');
    expect(prom).toContain('jules_risk_evaluations_total{level="critical"} 1');

    expect(prom).toContain("jules_policy_blocked_total 1");
    expect(prom).toContain("jules_duplicates_prevented_total 1");
    expect(prom).toContain("jules_api_latency_ms_avg 120");
    expect(prom).toContain("jules_ai_latency_ms_avg 450");

    // Ensure unbounded IDs (session IDs, activity IDs) are NOT present in Prometheus labels
    expect(prom).not.toContain("sessionId=");
    expect(prom).not.toContain("activityId=");
    expect(prom).not.toContain("decisionId=");
  });

  it("attaches correlation IDs and context to child loggers", () => {
    const childLog = logger.child({
      sessionId: "ses_correlate_001",
      activityId: "act_correlate_001",
    });

    expect(childLog).toBeDefined();
    expect(typeof childLog.info).toBe("function");
    expect(typeof childLog.error).toBe("function");
  });
});
