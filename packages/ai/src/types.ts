import { Decision } from "@jules/core";

export interface DecisionPromptInput {
  sessionId: string;
  repository: string;
  branch: string;
  taskPrompt: string;
  currentState: string;
  triggeringActivity: {
    id: string;
    type: string;
    content: string;
    plan?: Record<string, unknown>;
    patch?: { diff?: string; filesChanged?: string[] };
  };
  recentActivities: Array<{
    id: string;
    type: string;
    content: string;
  }>;
  projectPolicyRules?: Record<string, unknown>;
  /** P1: cross-session precedents (relational memory, advisory only). */
  historicalPrecedents?: HistoricalPrecedentDto[];
  /** P1: repository knowledge entries (advisory, untrusted). */
  repositoryKnowledge?: RepositoryKnowledgeDto[];
}

/** P1: sanitized precedent DTO passed to the context builder. */
export interface HistoricalPrecedentDto {
  decisionId: string;
  action: string;
  outcomeClass: string;
  observedAt: string | null;
  /** Sanitized excerpt of the final response (or proposal). */
  excerpt: string;
  /** Whether a human reviewed this decision. */
  humanReviewed: boolean;
}

/** P1: sanitized repository knowledge DTO. */
export interface RepositoryKnowledgeDto {
  knowledgeId: string;
  knowledgeType: string;
  trustLevel: string;
  content: string;
}

export interface BuiltContext {
  systemPrompt: string;
  userPrompt: string;
  contextDigest: string;
  estimatedTokens: number;
}

export interface AiUsageMetadata {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface AiDecisionResponse {
  decision: Decision;
  provider: string;
  model: string;
  usage?: AiUsageMetadata;
  latencyMs: number;
}

export interface IAiDecisionProvider {
  name: string;
  decide(context: BuiltContext, signal?: AbortSignal): Promise<AiDecisionResponse>;
}
