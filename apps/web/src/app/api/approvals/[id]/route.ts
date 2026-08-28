import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getConfig } from "@jules/config";
import { ApprovalRepository, getDatabase } from "@jules/db";

const ApprovalActionBodySchema = z.object({
  status: z.enum(["APPROVED", "REJECTED", "EDITED", "CANCELLED"]),
  reviewer: z.string().default("human-operator"),
  modifiedResponse: z.string().optional(),
  comment: z.string().optional(),
});

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  try {
    const body = await req.json();
    const parsed = ApprovalActionBodySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request payload", details: parsed.error.issues },
        { status: 400 },
      );
    }

    try {
      const config = getConfig();
      const db = getDatabase(config.DATABASE_URL);
      const approvalRepo = new ApprovalRepository(db);

      const existing = await approvalRepo.findById(id);
      if (!existing) {
        return NextResponse.json({ error: "Approval request not found" }, { status: 404 });
      }

      if (existing.status !== "PENDING") {
        return NextResponse.json(
          { error: `Approval request already resolved with status ${existing.status}` },
          { status: 409 },
        );
      }

      const updated = await approvalRepo.updateStatus(
        id,
        parsed.data.status,
        parsed.data.reviewer,
        parsed.data.modifiedResponse,
        parsed.data.comment,
      );

      return NextResponse.json({
        success: true,
        approvalId: id,
        status: updated?.status ?? parsed.data.status,
        reviewer: parsed.data.reviewer,
        timestamp: new Date().toISOString(),
      });
    } catch {
      return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    }
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
