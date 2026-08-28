export interface MetricSnapshot {
  julesApiLatencyMs: { count: number; avg: number; min: number; max: number };
  aiLatencyMs: { count: number; avg: number; min: number; max: number };
  decisionsTotal: Record<string, number>;
  riskDistribution: Record<string, number>;
  approvalsTotal: Record<string, number>;
  autoExecutionsTotal: number;
  blockedDecisionsTotal: number;
  julesErrorsTotal: Record<string, number>;
  aiErrorsTotal: Record<string, number>;
  duplicateEventsPrevented: number;
}

class MetricsRegistry {
  private julesLatencies: number[] = [];
  private aiLatencies: number[] = [];
  private decisions: Record<string, number> = {};
  private risks: Record<string, number> = { low: 0, medium: 0, high: 0, critical: 0 };
  private approvals: Record<string, number> = { approved: 0, rejected: 0, edited: 0 };
  private autoExecutions = 0;
  private blockedDecisions = 0;
  private julesErrors: Record<string, number> = {};
  private aiErrors: Record<string, number> = {};
  private duplicatesPrevented = 0;

  public recordJulesLatency(ms: number): void {
    this.julesLatencies.push(ms);
    if (this.julesLatencies.length > 500) this.julesLatencies.shift();
  }

  public recordAiLatency(ms: number): void {
    this.aiLatencies.push(ms);
    if (this.aiLatencies.length > 500) this.aiLatencies.shift();
  }

  public incrementDecision(action: string): void {
    this.decisions[action] = (this.decisions[action] || 0) + 1;
  }

  public incrementRisk(risk: "low" | "medium" | "high" | "critical"): void {
    this.risks[risk] = (this.risks[risk] || 0) + 1;
  }

  public incrementApproval(status: "approved" | "rejected" | "edited"): void {
    this.approvals[status] = (this.approvals[status] || 0) + 1;
  }

  public incrementAutoExecution(): void {
    this.autoExecutions++;
  }

  public incrementBlocked(): void {
    this.blockedDecisions++;
  }

  public incrementJulesError(code: string | number): void {
    const key = String(code);
    this.julesErrors[key] = (this.julesErrors[key] || 0) + 1;
  }

  public incrementAiError(errorType: string): void {
    this.aiErrors[errorType] = (this.aiErrors[errorType] || 0) + 1;
  }

  public incrementDuplicatePrevented(): void {
    this.duplicatesPrevented++;
  }

  private summarize(data: number[]) {
    if (data.length === 0) return { count: 0, avg: 0, min: 0, max: 0 };
    const sum = data.reduce((a, b) => a + b, 0);
    return {
      count: data.length,
      avg: Math.round(sum / data.length),
      min: Math.min(...data),
      max: Math.max(...data),
    };
  }

  public getSnapshot(): MetricSnapshot {
    return {
      julesApiLatencyMs: this.summarize(this.julesLatencies),
      aiLatencyMs: this.summarize(this.aiLatencies),
      decisionsTotal: { ...this.decisions },
      riskDistribution: { ...this.risks },
      approvalsTotal: { ...this.approvals },
      autoExecutionsTotal: this.autoExecutions,
      blockedDecisionsTotal: this.blockedDecisions,
      julesErrorsTotal: { ...this.julesErrors },
      aiErrorsTotal: { ...this.aiErrors },
      duplicateEventsPrevented: this.duplicatesPrevented,
    };
  }

  public toPrometheusFormat(): string {
    const lines: string[] = [];

    // Decisions total
    lines.push("# HELP jules_decisions_total Total number of decisions computed by action");
    lines.push("# TYPE jules_decisions_total counter");
    for (const [action, count] of Object.entries(this.decisions)) {
      lines.push(`jules_decisions_total{action="${action}"} ${count}`);
    }

    // Risk distribution
    lines.push("# HELP jules_risk_evaluations_total Total risk classifications by level");
    lines.push("# TYPE jules_risk_evaluations_total counter");
    for (const [level, count] of Object.entries(this.risks)) {
      lines.push(`jules_risk_evaluations_total{level="${level}"} ${count}`);
    }

    // Auto Executions
    lines.push("# HELP jules_auto_executions_total Total autonomous API mutations executed");
    lines.push("# TYPE jules_auto_executions_total counter");
    lines.push(`jules_auto_executions_total ${this.autoExecutions}`);

    // Policy Blocks
    lines.push("# HELP jules_policy_blocked_total Total actions blocked by policy engine");
    lines.push("# TYPE jules_policy_blocked_total counter");
    lines.push(`jules_policy_blocked_total ${this.blockedDecisions}`);

    // Duplicate events prevented
    lines.push(
      "# HELP jules_duplicates_prevented_total Total duplicate activities skipped via idempotency key",
    );
    lines.push("# TYPE jules_duplicates_prevented_total counter");
    lines.push(`jules_duplicates_prevented_total ${this.duplicatesPrevented}`);

    // Jules Latency
    const julesSummary = this.summarize(this.julesLatencies);
    lines.push(
      "# HELP jules_api_latency_ms_avg Average Jules API response latency in milliseconds",
    );
    lines.push("# TYPE jules_api_latency_ms_avg gauge");
    lines.push(`jules_api_latency_ms_avg ${julesSummary.avg}`);

    // AI Latency
    const aiSummary = this.summarize(this.aiLatencies);
    lines.push(
      "# HELP jules_ai_latency_ms_avg Average AI decision provider latency in milliseconds",
    );
    lines.push("# TYPE jules_ai_latency_ms_avg gauge");
    lines.push(`jules_ai_latency_ms_avg ${aiSummary.avg}`);

    return lines.join("\n") + "\n";
  }

  public reset(): void {
    this.julesLatencies = [];
    this.aiLatencies = [];
    this.decisions = {};
    this.risks = { low: 0, medium: 0, high: 0, critical: 0 };
    this.approvals = { approved: 0, rejected: 0, edited: 0 };
    this.autoExecutions = 0;
    this.blockedDecisions = 0;
    this.julesErrors = {};
    this.aiErrors = {};
    this.duplicatesPrevented = 0;
  }
}

export const metrics = new MetricsRegistry();
