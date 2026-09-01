import { NextRequest, NextResponse } from "next/server";
import { getConfig } from "@jules/config";
import { getDatabase, AuditRepository } from "@jules/db";
import { logRouteError } from "../route-logger";

/**
 * Audit trail API — live DB data (no mocks).
 * GET /api/audit?limit=100&offset=0&sessionId=
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const config = getConfig();
  try {
    const db = getDatabase(config.DATABASE_URL);
    const repo = new AuditRepository(db);
    const sessionId = req.nextUrl.searchParams.get("sessionId");
    const limit = Math.min(Number(req.nextUrl.searchParams.get("limit")) || 100, 300);

    const events = sessionId
      ? await repo.listBySession(sessionId, limit)
      : await repo.list(limit, 0);

    return NextResponse.json({ events });
  } catch (err: unknown) {
    logRouteError("GET /api/audit", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}