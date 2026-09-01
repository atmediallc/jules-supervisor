import { NextRequest, NextResponse } from "next/server";
import { getConfig } from "@jules/config";
import { getDatabase, approvalRequests, decisions, eq, desc } from "@jules/db";
import { logRouteError } from "../route-logger";

/**
 * Approval requests API — live DB data joined with the linked decision
 * (risk/confidence/reason/proposedResponse come from the decision row).
 * GET /api/approvals?limit=50
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const config = getConfig();
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit")) || 50, 200);
  try {
    const db = getDatabase(config.DATABASE_URL);
    const rows = await db
      .select({
        id: approvalRequests.id,
        decisionId: approvalRequests.decisionId,
        sessionId: approvalRequests.sessionId,
        status: approvalRequests.status,
        action: approvalRequests.action,
        proposedResponse: approvalRequests.proposedResponse,
        modifiedResponse: approvalRequests.modifiedResponse,
        reviewer: approvalRequests.reviewer,
        reviewComment: approvalRequests.reviewComment,
        reviewedAt: approvalRequests.reviewedAt,
        createdAt: approvalRequests.createdAt,
        risk: decisions.risk,
        confidence: decisions.confidence,
        reason: decisions.reason,
      })
      .from(approvalRequests)
      .innerJoin(decisions, eq(approvalRequests.decisionId, decisions.id))
      .where(eq(approvalRequests.status, "PENDING"))
      .orderBy(desc(approvalRequests.createdAt))
      .limit(limit);

    return NextResponse.json({ approvals: rows });
  } catch (err: unknown) {
    logRouteError("GET /api/approvals", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}