import {
  ActivityInsert,
  ActivitySelect,
  ActivityRepository,
  ApprovalRequestInsert,
  ApprovalRequestSelect,
  ApprovalRepository,
  AuditEventInsert,
  AuditEventSelect,
  AuditRepository,
  DecisionInsert,
  DecisionSelect,
  DecisionRepository,
  SessionInsert,
  SessionSelect,
  SessionRepository,
} from "@jules/db";

export class InMemoryRepositoryStore {
  public sessions = new Map<string, SessionSelect>();
  public activities = new Map<string, ActivitySelect>();
  public decisions = new Map<string, DecisionSelect>();
  public approvalRequests = new Map<string, ApprovalRequestSelect>();
  public auditEvents: AuditEventSelect[] = [];

  public clear(): void {
    this.sessions.clear();
    this.activities.clear();
    this.decisions.clear();
    this.approvalRequests.clear();
    this.auditEvents = [];
  }

  // Sessions
  public async upsertSession(data: SessionInsert): Promise<SessionSelect> {
    const existing = this.sessions.get(data.id);
    const now = new Date();
    const row: SessionSelect = {
      id: data.id,
      name: data.name,
      repository: data.repository,
      branch: data.branch ?? "main",
      prompt: data.prompt,
      state: data.state ?? "QUEUED",
      supervisorStatus: data.supervisorStatus ?? "IDLE",
      lastActivityId: data.lastActivityId ?? null,
      cycleCount: data.cycleCount ?? 0,
      metadata: (data.metadata ?? {}) as Record<string, unknown>,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.sessions.set(data.id, row);
    return row;
  }

  public async getSession(id: string): Promise<SessionSelect | null> {
    return this.sessions.get(id) ?? null;
  }

  public async updateSessionState(
    id: string,
    state: string,
    supervisorStatus?: string,
  ): Promise<SessionSelect | null> {
    const session = this.sessions.get(id);
    if (!session) {
      return this.upsertSession({
        id,
        name: id,
        repository: "unknown/repo",
        prompt: "",
        state,
        supervisorStatus: supervisorStatus ?? "IDLE",
      });
    }
    session.state = state;
    if (supervisorStatus) session.supervisorStatus = supervisorStatus;
    session.updatedAt = new Date();
    this.sessions.set(id, session);
    return session;
  }

  public async listSessions(): Promise<SessionSelect[]> {
    return Array.from(this.sessions.values()).sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
    );
  }

  // Activities
  public async createActivity(data: ActivityInsert): Promise<ActivitySelect> {
    if (this.activities.has(data.id)) {
      return this.activities.get(data.id)!;
    }
    const row: ActivitySelect = {
      id: data.id,
      sessionId: data.sessionId,
      type: data.type,
      content: data.content ?? null,
      plan: (data.plan ?? null) as Record<string, unknown> | null,
      patch: (data.patch ?? null) as { diff?: string; filesChanged?: string[] } | null,
      toolCall: (data.toolCall ?? null) as Record<string, unknown> | null,
      toolResult: (data.toolResult ?? null) as Record<string, unknown> | null,
      rawPayload: (data.rawPayload ?? null) as Record<string, unknown> | null,
      createdAt: new Date(),
    };
    this.activities.set(data.id, row);
    return row;
  }

  public async listActivitiesBySession(sessionId: string): Promise<ActivitySelect[]> {
    return Array.from(this.activities.values())
      .filter((a) => a.sessionId === sessionId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  // Decisions
  public async createDecision(data: DecisionInsert): Promise<DecisionSelect> {
    // Check idempotency
    const existing = Array.from(this.decisions.values()).find(
      (d) => d.idempotencyKey === data.idempotencyKey,
    );
    if (existing) {
      const err = new Error("Unique constraint violation: idempotency_key already exists");
      (err as unknown as { code: string }).code = "23505";
      throw err;
    }

    const row: DecisionSelect = {
      id: data.id,
      sessionId: data.sessionId,
      activityId: data.activityId,
      idempotencyKey: data.idempotencyKey,
      action: data.action,
      proposedResponse: data.proposedResponse ?? null,
      risk: data.risk ?? "low",
      confidence: data.confidence ?? 1.0,
      reason: data.reason,
      evidence: (data.evidence ?? []) as string[],
      concerns: (data.concerns ?? []) as string[],
      provider: data.provider,
      model: data.model,
      contextDigest: data.contextDigest,
      executionState: data.executionState ?? "PENDING",
      executedAt: data.executedAt ?? null,
      executionError: data.executionError ?? null,
      createdAt: new Date(),
    };
    this.decisions.set(data.id, row);
    return row;
  }

  public async getDecisionByIdempotency(key: string): Promise<DecisionSelect | null> {
    return Array.from(this.decisions.values()).find((d) => d.idempotencyKey === key) ?? null;
  }

  public async listDecisions(): Promise<DecisionSelect[]> {
    return Array.from(this.decisions.values()).sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
  }

  public async updateDecisionExecution(
    id: string,
    state: string,
    error?: string,
  ): Promise<DecisionSelect | null> {
    const row = this.decisions.get(id);
    if (!row) return null;
    row.executionState = state;
    row.executedAt = new Date();
    row.executionError = error ?? null;
    this.decisions.set(id, row);
    return row;
  }

  // Approval Requests
  public async createApprovalRequest(data: ApprovalRequestInsert): Promise<ApprovalRequestSelect> {
    const row: ApprovalRequestSelect = {
      id: data.id,
      decisionId: data.decisionId,
      sessionId: data.sessionId,
      status: data.status ?? "PENDING",
      action: data.action,
      proposedResponse: data.proposedResponse ?? null,
      modifiedResponse: data.modifiedResponse ?? null,
      reviewer: data.reviewer ?? null,
      reviewComment: data.reviewComment ?? null,
      reviewedAt: data.reviewedAt ?? null,
      createdAt: new Date(),
    };
    this.approvalRequests.set(data.id, row);
    return row;
  }

  public async listPendingApprovals(): Promise<ApprovalRequestSelect[]> {
    return Array.from(this.approvalRequests.values())
      .filter((a) => a.status === "PENDING")
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  public async updateApprovalStatus(
    id: string,
    status: "APPROVED" | "REJECTED" | "EDITED" | "CANCELLED",
    reviewer: string,
    modifiedResponse?: string,
    comment?: string,
  ): Promise<ApprovalRequestSelect | null> {
    const row = this.approvalRequests.get(id);
    if (!row || row.status !== "PENDING") return null;
    row.status = status;
    row.reviewer = reviewer;
    row.modifiedResponse = modifiedResponse ?? null;
    row.reviewComment = comment ?? null;
    row.reviewedAt = new Date();
    this.approvalRequests.set(id, row);
    return row;
  }

  // Audit Events
  public async recordAudit(data: AuditEventInsert): Promise<AuditEventSelect> {
    const row: AuditEventSelect = {
      id: data.id,
      actor: data.actor,
      actorType: data.actorType ?? "SYSTEM",
      action: data.action,
      targetType: data.targetType,
      targetId: data.targetId,
      sessionId: data.sessionId ?? null,
      decisionId: data.decisionId ?? null,
      beforeState: (data.beforeState ?? null) as Record<string, unknown> | null,
      afterState: (data.afterState ?? null) as Record<string, unknown> | null,
      metadata: (data.metadata ?? {}) as Record<string, unknown>,
      timestamp: new Date(),
    };
    this.auditEvents.unshift(row);
    return row;
  }

  public async listAuditEvents(): Promise<AuditEventSelect[]> {
    return [...this.auditEvents];
  }
}

export function createMockRepositories(store: InMemoryRepositoryStore): {
  sessionRepo: SessionRepository;
  activityRepo: ActivityRepository;
  decisionRepo: DecisionRepository;
  approvalRepo: ApprovalRepository;
  auditRepo: AuditRepository;
} {
  return {
    sessionRepo: {
      findById: async (id: string) => store.getSession(id),
      list: async () => store.listSessions(),
      upsert: async (data: SessionInsert) => store.upsertSession(data),
      updateState: async (id: string, state: string, supervisorStatus?: string) =>
        store.updateSessionState(id, state, supervisorStatus),
    } as unknown as SessionRepository,
    activityRepo: {
      findById: async (_id: string) => null,
      listBySession: async (sId: string) => store.listActivitiesBySession(sId),
      create: async (data: ActivityInsert) => store.createActivity(data),
    } as unknown as ActivityRepository,
    decisionRepo: {
      findById: async (id: string) => store.decisions.get(id) ?? null,
      findByIdempotencyKey: async (k: string) => store.getDecisionByIdempotency(k),
      list: async () => store.listDecisions(),
      listBySession: async (_sId: string) => [],
      create: async (data: DecisionInsert) => store.createDecision(data),
      markExecuted: async (id: string, state: string, err?: string) =>
        store.updateDecisionExecution(id, state, err),
    } as unknown as DecisionRepository,
    approvalRepo: {
      findById: async (id: string) => store.approvalRequests.get(id) ?? null,
      findPendingByDecisionId: async (_dId: string) => null,
      listPending: async () => store.listPendingApprovals(),
      create: async (data: ApprovalRequestInsert) => store.createApprovalRequest(data),
      updateStatus: async (
        id: string,
        st: "APPROVED" | "REJECTED" | "EDITED" | "CANCELLED",
        rev: string,
        mod?: string,
        com?: string,
      ) => store.updateApprovalStatus(id, st, rev, mod, com),
    } as unknown as ApprovalRepository,
    auditRepo: {
      list: async () => store.listAuditEvents(),
      listBySession: async () => store.listAuditEvents(),
      record: async (data: AuditEventInsert) => store.recordAudit(data),
    } as unknown as AuditRepository,
  };
}
