import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { z } from "zod";
import { getConfig } from "@jules/config";
import { AuditRepository, getDatabase, KillSwitch, SafetyState, SystemSettingsRepository } from "@jules/db";
import { generateId } from "@jules/shared";

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
 * Successful transitions are recorded in the immutable audit trail.
 */
export async function GET(req: NextRequest) {
  try {
    const token = await getToken({ req });
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const config = getConfig();
    const db = getDatabase(config.DATABASE_URL);
    const killSwitch = new KillSwitch(new SystemSettingsRepository(db));
    const state = await killSwitch.getState();
    return NextResponse.json({ ok: true, ...state });
  } catch {
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
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

    // Audit the kill-switch transition (operator → runtime safety state).
    try {
      const auditRepo = new AuditRepository(db);
      await auditRepo.record({
        id: generateId("audit"),
        actor,
        actorType: "HUMAN",
        action: "SAFETY_STATE_CHANGE",
        targetType: "kill_switch",
        targetId: parsed.data.state,
        afterState: {
          state: parsed.data.state,
          reason: parsed.data.reason ?? null,
        },
      });
    } catch (auditErr: unknown) {
      // Audit failure must not hide the state change itself, but log it so
      // operators can detect lost lineage.
      console.error("Failed to record kill-switch audit event:", auditErr);
    }

    return NextResponse.json({ ok: true, ...state });
  } catch {
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}
