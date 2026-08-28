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
