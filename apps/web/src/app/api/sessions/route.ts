import { NextRequest, NextResponse } from "next/server";
import { getConfig } from "@jules/config";
import { getDatabase, SessionRepository } from "@jules/db";
import { logRouteError } from "../route-logger";

/**
 * Sessions API — live DB data (no mocks).
 * GET /api/sessions?limit=50&offset=0
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const config = getConfig();
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit")) || 50, 200);
  const offset = Math.max(0, Number(req.nextUrl.searchParams.get("offset")) || 0);
  try {
    const db = getDatabase(config.DATABASE_URL);
    const repo = new SessionRepository(db);
    const sessions = await repo.list(limit, offset);
    return NextResponse.json({ sessions, total: sessions.length });
  } catch (err: unknown) {
    logRouteError("GET /api/sessions", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}