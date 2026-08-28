import { describe, expect, it } from "vitest";
import { MockJulesClient } from "./mock.js";

describe("MockJulesClient contract tests", () => {
  it("lists sessions and seeded activities", async () => {
    const client = new MockJulesClient();
    const sessionsRes = await client.listSessions();
    expect(sessionsRes.sessions.length).toBeGreaterThan(0);

    const first = sessionsRes.sessions[0]!;
    const activitiesRes = await client.listActivities(first.id);
    expect(activitiesRes.activities.length).toBeGreaterThan(0);
  });

  it("handles sendMessage and updates session state to IN_PROGRESS", async () => {
    const client = new MockJulesClient();
    const session = await client.getSession("ses_test_001");
    expect(session.state).toBe("AWAITING_USER_INPUT");

    const sent = await client.sendMessage("ses_test_001", {
      message: "Please proceed with token bucket rate limiter.",
    });

    expect(sent.type).toBe("USER_MESSAGE");
    expect(sent.content).toContain("token bucket");

    const updatedSession = await client.getSession("ses_test_001");
    expect(updatedSession.state).toBe("IN_PROGRESS");
  });

  it("handles plan approval and records activity", async () => {
    const client = new MockJulesClient();
    const approved = await client.approvePlan("ses_test_002", {
      approved: true,
      feedback: "Plan looks solid.",
    });

    expect(approved.type).toBe("PLAN_APPROVED");
    const updated = await client.getSession("ses_test_002");
    expect(updated.state).toBe("IN_PROGRESS");
  });
});
