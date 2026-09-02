import { NextResponse } from "next/server";
import { getConfig } from "@jules/config";
import {
  approvalRequests,
  decisions,
  getDatabase,
  sql,
  SessionRepository,
} from "@jules/db";
import { logRouteError } from "../route-logger";

/**
 * Dashboard aggregate stats — real DB numbers (no mock data).
 * GET /api/dashboard
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const config = getConfig();
  try {
    const db = getDatabase(config.DATABASE_URL);
    const sessions = new SessionRepository(db);

    const allSessions = await sessions.list(500);
    const activeCount = allSessions.filter(
      (s) => !["COMPLETED", "CANCELLED", "FAILED"].includes(s.state),
    ).length;
    const awaitingFeedback = allSessions.filter((s) => s.state === "AWAITING_USER_INPUT").length;
    const awaitingPlanApproval = allSessions.filter(
      (s) => s.state === "AWAITING_PLAN_APPROVAL",
    ).length;
    const pendingHumanReviews = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(approvalRequests)
      .where(sql`status = 'PENDING'`);
    const decisionsToday = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(decisions)
      .where(sql`created_at >= now() - interval '24 hours'`);
    const autoExecuted = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(decisions)
      .where(sql`execution_state = 'EXECUTED'`);
    const blockedDecisions = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(decisions)
      .where(sql`execution_state = 'BLOCKED'`);
    const avgLatencyMs = await db
      .select({ avg: sql<number>`coalesce(avg(ai_latency_ms), 0)::int` })
      .from(decisions)
      .where(sql`created_at >= now() - interval '24 hours'`);

    return NextResponse.json({
      activeSessions: activeCount,
      awaitingFeedback,
      awaitingPlanApproval,
      pendingHumanReviews: pendingHumanReviews[0]?.count ?? 0,
      decisionsToday: decisionsToday[0]?.count ?? 0,
      autoExecuted: autoExecuted[0]?.count ?? 0,
      blockedDecisions: blockedDecisions[0]?.count ?? 0,
      avgLatencyMs: avgLatencyMs[0]?.avg ?? 0,
    });
  } catch (err: unknown) {
    logRouteError("GET /api/dashboard", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}