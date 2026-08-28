import { ContextBuilder, IAiDecisionProvider } from "@jules/ai";
import { AppConfig } from "@jules/config";
import {
  calculateDeterministicRisk,
  Decision,
  DecisionAction,
  evaluateExecutionGate,
  ExecutionGateResult,
  LoopDetector,
} from "@jules/core";
import {
  ActivityRepository,
  ApprovalRepository,
  AuditRepository,
  DecisionRepository,
  SessionRepository,
} from "@jules/db";
import { IJulesClient, JulesActivity, JulesSession } from "@jules/jules-client";
import { logger, metrics } from "@jules/observability";
import { PolicyEngine } from "@jules/policy";
import { generateId, sha256 } from "@jules/shared";
import { IDistributedLock } from "./lock.js";

export interface PipelineDependencies {
  config: AppConfig;
  julesClient: IJulesClient;
  aiProvider: IAiDecisionProvider;
  policyEngine: PolicyEngine;
  sessionRepo: SessionRepository;
  activityRepo: ActivityRepository;
  decisionRepo: DecisionRepository;
  approvalRepo: ApprovalRepository;
  auditRepo: AuditRepository;
  lock: IDistributedLock;
}

export interface ProcessActivityInput {
  session: JulesSession;
  activity: JulesActivity;
}

export interface PipelineExecutionResult {
  decisionId: string;
  action: string;
  executionGate: ExecutionGateResult;
  executed: boolean;
  requiresHumanReview: boolean;
}

export class SupervisionPipeline {
  private readonly config: AppConfig;
  private readonly julesClient: IJulesClient;
  private readonly aiProvider: IAiDecisionProvider;
  private readonly policyEngine: PolicyEngine;
  private readonly sessionRepo: SessionRepository;
  private readonly activityRepo: ActivityRepository;
  private readonly decisionRepo: DecisionRepository;
  private readonly approvalRepo: ApprovalRepository;
  private readonly auditRepo: AuditRepository;
  private readonly lock: IDistributedLock;
  private readonly contextBuilder: ContextBuilder;
  private readonly loopDetector: LoopDetector;

  constructor(deps: PipelineDependencies) {
    this.config = deps.config;
    this.julesClient = deps.julesClient;
    this.aiProvider = deps.aiProvider;
    this.policyEngine = deps.policyEngine;
    this.sessionRepo = deps.sessionRepo;
    this.activityRepo = deps.activityRepo;
    this.decisionRepo = deps.decisionRepo;
    this.approvalRepo = deps.approvalRepo;
    this.auditRepo = deps.auditRepo;
    this.lock = deps.lock;
    this.contextBuilder = new ContextBuilder({ maxBudgetTokens: deps.config.AI_MAX_TOKENS * 2 });
    this.loopDetector = new LoopDetector({ maxTotalSessionCycles: deps.config.MAX_SESSION_CYCLES });
  }

  public async processActivity(
    input: ProcessActivityInput,
  ): Promise<PipelineExecutionResult | null> {
    const { session, activity } = input;

    // We only trigger AI decision evaluation if session is awaiting user input or plan approval
    const requiresAction =
      (session.state === "AWAITING_USER_INPUT" && activity.type === "AGENT_MESSAGE") ||
      (session.state === "AWAITING_PLAN_APPROVAL" && activity.type === "PLAN_GENERATED");

    if (!requiresAction) {
      return null;
    }

    return this.lock.withLock(`session:${session.id}`, async () => {
      const log = logger.child({ sessionId: session.id, activityId: activity.id });

      // 1. Persist Session & Activity state
      await this.sessionRepo.upsert({
        id: session.id,
        name: session.name || session.id,
        repository: session.repository,
        branch: session.branch,
        prompt: session.prompt,
        state: session.state,
        lastActivityId: activity.id,
        updatedAt: new Date(),
      });

      await this.activityRepo.create({
        id: activity.id,
        sessionId: session.id,
        type: activity.type,
        content: activity.content || null,
        plan: (activity.plan ?? null) as Record<string, unknown> | null,
        patch: (activity.patch ?? null) as { diff?: string; filesChanged?: string[] } | null,
        rawPayload: activity as unknown as Record<string, unknown>,
      });

      // 2. Deterministic Idempotency Key
      const expectedAction = activity.type === "PLAN_GENERATED" ? "APPROVE_PLAN" : "RESPOND";
      const idempotencyKey = sha256(`${session.id}:${activity.id}:${expectedAction}`);

      // Check if decision was already computed
      const existingDecision = await this.decisionRepo.findByIdempotencyKey(idempotencyKey);
      if (existingDecision) {
        log.info("Activity already processed by supervisor (idempotent skip)", {
          decisionId: existingDecision.id,
          idempotencyKey,
        });
        metrics.incrementDuplicatePrevented();
        return {
          decisionId: existingDecision.id,
          action: existingDecision.action,
          executionGate: {
            action: existingDecision.action as DecisionAction,
            allowed: false,
            requiresHumanReview: false,
            blocked: false,
            reason: "Already processed idempotently",
            autoExecuted: false,
          },
          executed: existingDecision.executionState === "EXECUTED",
          requiresHumanReview: existingDecision.executionState === "AWAITING_APPROVAL",
        };
      }

      // 3. Check loop detection
      const recentActivities = await this.activityRepo.listBySession(session.id);
      const loopCheck = this.loopDetector.evaluate(
        recentActivities.map((a) => ({
          id: a.id,
          type: a.type,
          content: a.content || "",
          timestamp: a.createdAt.toISOString(),
        })),
      );

      if (loopCheck.isLoopDetected) {
        log.warn("Loop detected for session. Forcing human review.", { reason: loopCheck.reason });
      }

      // 4. Build Context
      const context = this.contextBuilder.build({
        sessionId: session.id,
        repository: session.repository,
        branch: session.branch,
        taskPrompt: session.prompt,
        currentState: session.state,
        triggeringActivity: {
          id: activity.id,
          type: activity.type,
          content: activity.content || "",
          plan: activity.plan as unknown as Record<string, unknown> | undefined,
          patch: activity.patch,
        },
        recentActivities: recentActivities.slice(-10).map((a) => ({
          id: a.id,
          type: a.type,
          content: a.content || "",
        })),
      });

      // 5. Query AI Decision Engine
      const aiResponse = await this.aiProvider.decide(context);
      let proposedDecision: Decision = aiResponse.decision;

      if (loopCheck.isLoopDetected) {
        proposedDecision = {
          ...proposedDecision,
          action: "REQUEST_HUMAN",
          risk: "high",
          reason: `Loop detected: ${loopCheck.reason}. Escalated to human operator.`,
        };
      }

      // 6. Policy & Risk Engine Evaluation
      const deterministicRisk = calculateDeterministicRisk({
        filesChanged: activity.patch?.filesChanged,
        diff: activity.patch?.diff,
        proposedMessage: proposedDecision.response || undefined,
        action: proposedDecision.action,
      });

      const policyResult = this.policyEngine.evaluate({
        decision: proposedDecision,
        sessionId: session.id,
        repository: session.repository,
        filesChanged: activity.patch?.filesChanged,
        diff: activity.patch?.diff,
      });

      // Effective risk is the highest between AI, deterministic, and policy
      const effectiveRisk =
        deterministicRisk.level === "critical" || policyResult.effectiveRisk === "critical"
          ? "critical"
          : deterministicRisk.level === "high" || policyResult.effectiveRisk === "high"
            ? "high"
            : proposedDecision.risk;

      metrics.incrementDecision(proposedDecision.action);
      metrics.incrementRisk(effectiveRisk);

      // 7. Execution Gate
      const gate = evaluateExecutionGate(
        proposedDecision.action,
        effectiveRisk,
        proposedDecision.confidence,
        {
          mode: this.config.SUPERVISOR_MODE,
          autoRespondEnabled: this.config.AUTO_RESPOND_ENABLED,
          autoPlanApprovalEnabled: this.config.AUTO_PLAN_APPROVAL_ENABLED,
          confidenceThreshold: this.config.CONFIDENCE_THRESHOLD,
        },
      );

      const decisionId = generateId("dec");
      const executionState = gate.autoExecuted
        ? "EXECUTING"
        : gate.requiresHumanReview
          ? "AWAITING_APPROVAL"
          : gate.blocked
            ? "BLOCKED"
            : "DRY_RUN_COMPLETED";

      // 8. Persist Decision Record
      await this.decisionRepo.create({
        id: decisionId,
        sessionId: session.id,
        activityId: activity.id,
        idempotencyKey,
        action: proposedDecision.action,
        proposedResponse: proposedDecision.response,
        risk: effectiveRisk,
        confidence: proposedDecision.confidence,
        reason: proposedDecision.reason,
        evidence: proposedDecision.evidence,
        concerns: proposedDecision.concerns,
        provider: aiResponse.provider,
        model: aiResponse.model,
        contextDigest: context.contextDigest,
        executionState,
      });

      // 9. Record Audit Log
      await this.auditRepo.record({
        id: generateId("aud"),
        actor: "SUPERVISOR_AI",
        actorType: "SYSTEM",
        action: `DECISION_${proposedDecision.action}`,
        targetType: "SESSION",
        targetId: session.id,
        sessionId: session.id,
        decisionId,
        beforeState: { sessionState: session.state, activityId: activity.id },
        afterState: {
          executionGate: gate,
          decision: proposedDecision,
          executionState,
        },
      });

      // 10. Handle Human Review Queue Creation
      if (gate.requiresHumanReview) {
        await this.approvalRepo.create({
          id: generateId("appr"),
          decisionId,
          sessionId: session.id,
          status: "PENDING",
          action: proposedDecision.action,
          proposedResponse: proposedDecision.response,
        });

        await this.sessionRepo.updateState(session.id, session.state, "AWAITING_APPROVAL");
        log.info("Decision placed in Human Approval Queue", { decisionId, risk: effectiveRisk });
        return {
          decisionId,
          action: proposedDecision.action,
          executionGate: gate,
          executed: false,
          requiresHumanReview: true,
        };
      }

      // 11. Handle Auto-Execution (If allowed by gate)
      if (gate.autoExecuted && proposedDecision.response) {
        try {
          log.info("Auto-executing decision against Google Jules API...", {
            decisionId,
            action: proposedDecision.action,
          });

          // Pre-execution verification: ensure session state has not changed
          const freshSession = await this.julesClient.getSession(session.id);
          if (freshSession.state !== session.state) {
            throw new Error(
              `Session state changed from ${session.state} to ${freshSession.state} before execution`,
            );
          }

          if (proposedDecision.action === "APPROVE_PLAN") {
            await this.julesClient.approvePlan(session.id, {
              approved: true,
              feedback: proposedDecision.response,
              clientToken: idempotencyKey,
            });
          } else if (proposedDecision.action === "RESPOND") {
            await this.julesClient.sendMessage(session.id, {
              message: proposedDecision.response,
              clientToken: idempotencyKey,
            });
          }

          await this.decisionRepo.markExecuted(decisionId, "EXECUTED");
          await this.sessionRepo.updateState(session.id, "IN_PROGRESS", "AUTO_EXECUTED");
          metrics.incrementAutoExecution();

          log.info("Decision successfully executed against Jules API", { decisionId });
          return {
            decisionId,
            action: proposedDecision.action,
            executionGate: gate,
            executed: true,
            requiresHumanReview: false,
          };
        } catch (err: unknown) {
          log.error("Failed to execute decision against Jules API", err, { decisionId });
          await this.decisionRepo.markExecuted(
            decisionId,
            "EXECUTION_FAILED",
            (err as Error).message,
          );
          throw err;
        }
      }

      return {
        decisionId,
        action: proposedDecision.action,
        executionGate: gate,
        executed: false,
        requiresHumanReview: false,
      };
    });
  }
}
