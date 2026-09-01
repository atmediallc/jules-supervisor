import { NextRequest, NextResponse } from "next/server";
import { getConfig } from "@jules/config";
import { getDatabase, DecisionRepository } from "@jules/db";
import { logRouteError } from "../route-logger";

/**
 * Decisions API — live DB data (no mocks).
 * GET /api/decisions?limit=50&offset=0&sessionId=
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const config = getConfig();
  try {
    const db = getDatabase(config.DATABASE_URL);
    const repo = new DecisionRepository(db);
    const sessionId = req.nextUrl.searchParams.get("sessionId");
    const limit = Math.min(Number(req.nextUrl.searchParams.get("limit")) || 50, 200);

    const decisions = sessionId
      ? (await repo.listBySession(sessionId)).slice(0, limit)
      : await repo.list(limit, 0);

    return NextResponse.json({ decisions });
  } catch (err: unknown) {
    logRouteError("GET /api/decisions", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}