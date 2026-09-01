import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { z } from "zod";
import { getConfig } from "@jules/config";
import { getDatabase, KillSwitch, SafetyState, SystemSettingsRepository } from "@jules/db";

const SafetyBodySchema = z.object({
  state: z.enum(["RUNNING", "PAUSED", "SAFETY_LOCKED"] as const),
  reason: z.string().max(500).optional(),
});

/**
 * Runtime kill-switch control plane.
 *  GET /api/control/safety  → current safety state (masked, no secrets)
 *  POST /api/control/safety → transition the safety state (authenticated)
 *
 * The kill switch is authoritative and cannot be set by the AI; only an
 * authenticated operator via this endpoint (or the DB) may flip it.
 */
export async function GET() {
  try {
    const config = getConfig();
    const db = getDatabase(config.DATABASE_URL);
    const killSwitch = new KillSwitch(new SystemSettingsRepository(db));
    const state = await killSwitch.getState();
    return NextResponse.json({ ok: true, ...state });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    // The middleware already enforces authentication; resolve the actor from
    // the session token for attribution (never trust client-supplied actor).
    const token = await getToken({ req });
    const actor = (token?.name as string | undefined) ?? "authenticated-operator";
    if (!token) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = SafetyBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Invalid request payload", details: parsed.error.issues },
        { status: 400 },
      );
    }

    const config = getConfig();
    const db = getDatabase(config.DATABASE_URL);
    const killSwitch = new KillSwitch(new SystemSettingsRepository(db));

    const state = await killSwitch.setState(parsed.data.state as SafetyState, {
      by: actor,
      reason: parsed.data.reason,
    });

    return NextResponse.json({ ok: true, ...state });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
