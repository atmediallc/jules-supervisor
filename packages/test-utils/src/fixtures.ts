import { Decision } from "@jules/core";
import { JulesActivity, JulesSession } from "@jules/jules-client";

export function createMockSession(overrides: Partial<JulesSession> = {}): JulesSession {
  return {
    id: "ses_fixture_001",
    name: "sessions/ses_fixture_001",
    title: "Implement OAuth2 JWT validation",
    repository: "octocat/hello-world",
    branch: "main",
    prompt: "Add JWT token validation middleware to Express app",
    state: "AWAITING_USER_INPUT",
    createTime: new Date().toISOString(),
    updateTime: new Date().toISOString(),
    metadata: {},
    ...overrides,
  };
}

export function createMockActivity(overrides: Partial<JulesActivity> = {}): JulesActivity {
  return {
    id: "act_fixture_001",
    sessionId: "ses_fixture_001",
    type: "AGENT_MESSAGE",
    content: "Which library should we use for RSA token verification: jsonwebtoken or jose?",
    createTime: new Date().toISOString(),
    ...overrides,
  };
}

export function createMockPlanActivity(overrides: Partial<JulesActivity> = {}): JulesActivity {
  return {
    id: "act_plan_001",
    sessionId: "ses_fixture_001",
    type: "PLAN_GENERATED",
    content: "Generated implementation plan",
    plan: {
      steps: [
        { id: 1, description: "Add jose dependency", status: "PENDING" },
        { id: 2, description: "Create src/auth/jwt.ts", status: "PENDING" },
        { id: 3, description: "Add unit tests in tests/jwt.test.ts", status: "PENDING" },
      ],
    },
    createTime: new Date().toISOString(),
    ...overrides,
  };
}

export function createMockDecision(overrides: Partial<Decision> = {}): Decision {
  return {
    action: "RESPOND",
    response:
      "Use `jose` as it has zero external dependencies and supports modern Web Crypto standard.",
    risk: "low",
    confidence: 0.95,
    reason: "Jose is the modern standard for TypeScript / Edge runtimes.",
    evidence: ["Existing project uses ES Modules"],
    concerns: [],
    ...overrides,
  };
}
