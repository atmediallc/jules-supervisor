import { NextResponse } from "next/server";
import { getConfig } from "@jules/config";
import { getDatabase, sql } from "@jules/db";

export async function GET() {
  try {
    const config = getConfig();
    const db = getDatabase(config.DATABASE_URL);
    await db.execute(sql`SELECT 1`);

    return NextResponse.json(
      {
        status: "ready",
        timestamp: new Date().toISOString(),
        mode: config.SUPERVISOR_MODE,
        provider: config.AI_PROVIDER_TYPE,
      },
      { status: 200 },
    );
  } catch {
    return NextResponse.json(
      {
        status: "not_ready",
        reason: "Mandatory database dependency check failed",
      },
      { status: 503 },
    );
  }
}
