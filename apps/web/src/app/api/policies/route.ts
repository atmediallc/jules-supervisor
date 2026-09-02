import { NextResponse } from "next/server";
import { getConfig } from "@jules/config";
import { getDatabase, policies, sql } from "@jules/db";
import { logRouteError } from "../route-logger";

/**
 * Policies API — live DB data (no mocks). Reads the `policies` table.
 * GET /api/policies
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const config = getConfig();
  try {
    const db = getDatabase(config.DATABASE_URL);
    const rows = await db
      .select({
        id: policies.id,
        name: policies.name,
        version: policies.version,
        description: policies.description,
        rules: policies.rules,
        enabled: policies.enabled,
        createdAt: policies.createdAt,
        updatedAt: policies.updatedAt,
      })
      .from(policies)
      .orderBy(sql`name asc`);

    return NextResponse.json({ policies: rows });
  } catch (err: unknown) {
    logRouteError("GET /api/policies", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}