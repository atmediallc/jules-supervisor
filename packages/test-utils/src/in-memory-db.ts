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
  BudgetRepository,
  DecisionInsert,
  DecisionSelect,
  DecisionRepository,
  SessionBudgetSelect,
  SessionInsert,
  SessionSelect,
  SessionRepository,
  SyncCheckpointRecord,
  SyncCheckpointRepository,
} from "@jules/db";

export class InMemoryRepositoryStore {
  public sessions = new Map<string, SessionSelect>();
  public activities = new Map<string, ActivitySelect>();
  public decisions = new Map<string, DecisionSelect>();
  public approvalRequests = new Map<string, ApprovalRequestSelect>();
  public auditEvents: AuditEventSelect[] = [];
  public sessionBudgets = new Map<string, SessionBudgetSelect>();
  /** Reconciliation cursors, keyed by sessionId. */
  public checkpoints = new Map<string, { sessionId: string; lastActivityId: string | null; nextPageToken: string | null; lastSyncedAt: Date }>();

  public clear(): void {
    this.sessions.clear();
    this.activities.clear();
    this.decisions.clear();
    this.approvalRequests.clear();
    this.auditEvents = [];
    this.sessionBudgets.clear();
    this.checkpoints.clear();
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
      outcome: data.outcome ?? null,
      humanAction: data.humanAction ?? null,
      humanReason: data.humanReason ?? null,
      humanReviewedAt: data.humanReviewedAt ?? null,
      outcomeObservedAt: data.outcomeObservedAt ?? null,
      promptTokens: data.promptTokens ?? 0,
      completionTokens: data.completionTokens ?? 0,
      totalTokens: data.totalTokens ?? 0,
      estimatedCostUsd: data.estimatedCostUsd ?? 0,
      aiLatencyMs: data.aiLatencyMs ?? 0,
      correctionOfDecisionId: data.correctionOfDecisionId ?? null,
      finalApprovedResponse: data.finalApprovedResponse ?? null,
      precedentDecisionIds: (data.precedentDecisionIds ?? []) as string[],
      repositoryKnowledgeIds: (data.repositoryKnowledgeIds ?? []) as string[],
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
    if (state === "EXECUTED") {
      // P1 Phase 43 repair: transport acceptance ≠ verified success.
      row.outcome = "EXECUTED_ACCEPTED";
      row.outcomeObservedAt = new Date();
    } else if (state === "IN_PROGRESS" || state === "PENDING") {
      // no outcome change
    } else if (state === "EXECUTION_FAILED") {
      row.outcome = "FAILED";
      row.outcomeObservedAt = new Date();
    }
    this.decisions.set(id, row);
    return row;
  }

  public async recordDecisionOutcome(
    id: string,
    outcome: string,
    outcomeReason?: string,
  ): Promise<DecisionSelect | null> {
    const row = this.decisions.get(id);
    if (!row) return null;
    row.outcome = outcome;
    row.outcomeObservedAt = new Date();
    if (outcomeReason) row.executionError = outcomeReason;
    this.decisions.set(id, row);
    return row;
  }

  public async recordDecisionHumanFeedback(
    id: string,
    humanAction: string,
    humanReason?: string,
  ): Promise<DecisionSelect | null> {
    const row = this.decisions.get(id);
    if (!row) return null;
    row.humanAction = humanAction;
    row.humanReason = humanReason ?? null;
    row.humanReviewedAt = new Date();
    // P1 Phase 43: a human rejection is a verified outcome of the proposal.
    if (humanAction === "REJECTED") {
      row.outcome = "REJECTED";
      row.outcomeObservedAt = new Date();
    }
    this.decisions.set(id, row);
    return row;
  }

  public async recordDecisionFinalApprovedResponse(
    id: string,
    finalApprovedResponse: string,
  ): Promise<DecisionSelect | null> {
    const row = this.decisions.get(id);
    if (!row) return null;
    row.finalApprovedResponse = finalApprovedResponse;
    this.decisions.set(id, row);
    return row;
  }

  public async getDecisionUsageBySession(sessionId: string): Promise<{
    aiCalls: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    estimatedCostUsd: number;
  }> {
    const sessionDecisions = Array.from(this.decisions.values()).filter(
      (d) => d.sessionId === sessionId,
    );
    return sessionDecisions.reduce(
      (acc, d) => ({
        aiCalls: acc.aiCalls + 1,
        promptTokens: acc.promptTokens + d.promptTokens,
        completionTokens: acc.completionTokens + d.completionTokens,
        totalTokens: acc.totalTokens + d.totalTokens,
        estimatedCostUsd: Math.round((acc.estimatedCostUsd + d.estimatedCostUsd) * 1e6) / 1e6,
      }),
      {
        aiCalls: 0,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        estimatedCostUsd: 0,
      },
    );
  }

  public async countDecisionCorrectionsBySession(sessionId: string): Promise<number> {
    return Array.from(this.decisions.values()).filter(
      (d) => d.sessionId === sessionId && d.correctionOfDecisionId !== null,
    ).length;
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

  // Session Budgets (autonomy budget engine)
  public async getBudgetBySession(sessionId: string): Promise<SessionBudgetSelect | null> {
    return this.sessionBudgets.get(sessionId) ?? null;
  }

  public async incrementBudgetUsage(
    sessionId: string,
    delta: {
      aiCalls: number;
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
      estimatedCostUsd: number;
    },
  ): Promise<SessionBudgetSelect> {
    const existing = this.sessionBudgets.get(sessionId);
    const now = new Date();
    if (!existing) {
      const row: SessionBudgetSelect = {
        id: sessionId,
        sessionId,
        aiCalls: delta.aiCalls,
        promptTokens: delta.promptTokens,
        completionTokens: delta.completionTokens,
        totalTokens: delta.totalTokens,
        estimatedCostUsd: delta.estimatedCostUsd,
        corrections: 0,
        updatedAt: now,
      };
      this.sessionBudgets.set(sessionId, row);
      return row;
    }
    const round = (v: number) => Math.round(v * 1e6) / 1e6;
    existing.aiCalls += delta.aiCalls;
    existing.promptTokens += delta.promptTokens;
    existing.completionTokens += delta.completionTokens;
    existing.totalTokens += delta.totalTokens;
    existing.estimatedCostUsd = round(existing.estimatedCostUsd + delta.estimatedCostUsd);
    existing.updatedAt = now;
    this.sessionBudgets.set(sessionId, existing);
    return existing;
  }

  public async incrementBudgetCorrections(sessionId: string): Promise<SessionBudgetSelect> {
    const existing = await this.incrementBudgetUsage(sessionId, {
      aiCalls: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      estimatedCostUsd: 0,
    });
    existing.corrections += 1;
    existing.updatedAt = new Date();
    this.sessionBudgets.set(sessionId, existing);
    return existing;
  }
}

export function createMockRepositories(store: InMemoryRepositoryStore): {
  sessionRepo: SessionRepository;
  activityRepo: ActivityRepository;
  decisionRepo: DecisionRepository;
  approvalRepo: ApprovalRepository;
  auditRepo: AuditRepository;
  budgetRepo: BudgetRepository;
  checkpointRepo: SyncCheckpointRepository;
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
      listBySession: async (sId: string) =>
        (await store.listDecisions()).filter((d) => d.sessionId === sId),
      create: async (data: DecisionInsert) => store.createDecision(data),
      markExecuted: async (id: string, state: string, err?: string) =>
        store.updateDecisionExecution(id, state, err),
      recordOutcome: async (id: string, outcome: string, outcomeReason?: string) =>
        store.recordDecisionOutcome(id, outcome, outcomeReason),
      recordHumanFeedback: async (id: string, humanAction: string, humanReason?: string) =>
        store.recordDecisionHumanFeedback(id, humanAction, humanReason),
      recordFinalApprovedResponse: async (id: string, finalApprovedResponse: string) =>
        store.recordDecisionFinalApprovedResponse(id, finalApprovedResponse),
      findPrecedents: async (params: {
        repositoryId: string;
        excludeSessionId?: string;
        action?: string;
        limit?: number;
        requireHumanReview?: boolean;
        requireNonHumanReview?: boolean;
      }) => {
        // Repository isolation via session→repository mapping in the store.
        const repoOf = (sessionId: string): string | undefined => {
          const session = store.sessions.get(sessionId);
          return session?.repository;
        };
        const limit = Math.min(Math.max(params.limit ?? 20, 1), 100);
        return Array.from(store.decisions.values())
          .filter((d) => {
            if (repoOf(d.sessionId) !== params.repositoryId) return false;
            if (d.outcome === null || d.outcome === undefined) return false;
            if (params.excludeSessionId && d.sessionId === params.excludeSessionId) return false;
            if (params.action && d.action !== params.action) return false;
            if (params.requireHumanReview && d.humanReviewedAt === null) return false;
            if (params.requireNonHumanReview && d.humanReviewedAt !== null) return false;
            return true;
          })
          .sort((a, b) => {
            const at = a.outcomeObservedAt?.getTime() ?? 0;
            const bt = b.outcomeObservedAt?.getTime() ?? 0;
            if (bt !== at) return bt - at;
            const ac = a.createdAt.getTime();
            const bc = b.createdAt.getTime();
            if (bc !== ac) return bc - ac;
            return b.id.localeCompare(a.id);
          })
          .slice(0, limit);
      },
      getUsageBySession: async (sessionId: string) => store.getDecisionUsageBySession(sessionId),
      countCorrectionsBySession: async (sessionId: string) =>
        store.countDecisionCorrectionsBySession(sessionId),
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
    budgetRepo: {
      findBySession: async (sessionId: string) => store.getBudgetBySession(sessionId),
      incrementUsage: async (
        sessionId: string,
        delta: {
          aiCalls: number;
          promptTokens: number;
          completionTokens: number;
          totalTokens: number;
          estimatedCostUsd: number;
        },
      ) => store.incrementBudgetUsage(sessionId, delta),
      incrementCorrections: async (sessionId: string) =>
        store.incrementBudgetCorrections(sessionId),
    } as unknown as BudgetRepository,
    checkpointRepo: {
      getBySession: async (sessionId: string): Promise<SyncCheckpointRecord | null> =>
        store.checkpoints.get(sessionId) ?? null,
      upsert: async (
        sessionId: string,
        patch: { lastActivityId?: string | null; nextPageToken?: string | null },
      ): Promise<SyncCheckpointRecord> => {
        const existing = store.checkpoints.get(sessionId);
        const record: SyncCheckpointRecord = {
          sessionId,
          lastActivityId: patch.lastActivityId ?? existing?.lastActivityId ?? null,
          nextPageToken: patch.nextPageToken ?? existing?.nextPageToken ?? null,
          lastSyncedAt: new Date(),
        };
        store.checkpoints.set(sessionId, record);
        return record;
      },
      deleteBySession: async (sessionId: string): Promise<void> => {
        store.checkpoints.delete(sessionId);
      },
    } as unknown as SyncCheckpointRepository,
  };
}
