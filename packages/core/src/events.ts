import { JulesSessionState } from "./types.js";

export interface CanonicalSessionCreatedEvent {
  type: "SESSION_CREATED";
  sessionId: string;
  repository: string;
  branch: string;
  prompt: string;
  timestamp: string;
}

export interface CanonicalSessionStateChangedEvent {
  type: "SESSION_STATE_CHANGED";
  sessionId: string;
  previousState?: JulesSessionState;
  newState: JulesSessionState;
  timestamp: string;
}

export interface CanonicalAgentMessageEvent {
  type: "AGENT_MESSAGE";
  sessionId: string;
  activityId: string;
  content: string;
  timestamp: string;
}

export interface CanonicalUserMessageEvent {
  type: "USER_MESSAGE";
  sessionId: string;
  activityId: string;
  content: string;
  timestamp: string;
}

export interface CanonicalPlanCreatedEvent {
  type: "PLAN_CREATED";
  sessionId: string;
  activityId: string;
  steps: Array<{ id: number | string; description: string; status?: string }>;
  timestamp: string;
}

export interface CanonicalPatchCreatedEvent {
  type: "PATCH_CREATED";
  sessionId: string;
  activityId: string;
  diff: string;
  filesChanged: string[];
  timestamp: string;
}

export interface CanonicalToolExecutionEvent {
  type: "TOOL_EXECUTION";
  sessionId: string;
  activityId: string;
  toolName: string;
  args: Record<string, unknown>;
  timestamp: string;
}

export interface CanonicalToolResultEvent {
  type: "TOOL_RESULT";
  sessionId: string;
  activityId: string;
  output: string;
  exitCode?: number;
  timestamp: string;
}

export type CanonicalDomainEvent =
  | CanonicalSessionCreatedEvent
  | CanonicalSessionStateChangedEvent
  | CanonicalAgentMessageEvent
  | CanonicalUserMessageEvent
  | CanonicalPlanCreatedEvent
  | CanonicalPatchCreatedEvent
  | CanonicalToolExecutionEvent
  | CanonicalToolResultEvent;
