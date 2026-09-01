import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getConfig } from "@jules/config";
import {
  ApprovalRepository,
  AuditRepository,
  BudgetRepository,
  DecisionRepository,
  getDatabase,
} from "@jules/db";
import { sanitizeForLogs } from "@jules/shared";
import { logRouteError } from "../../route-logger";

const ApprovalActionBodySchema = z.object({
  status: z.enum(["APPROVED", "REJECTED", "EDITED", "CANCELLED"]),
  reviewer: z.string().default("human-operator"),
  modifiedResponse: z.string().optional(),
  comment: z.string().optional(),
});

function deriveHumanAction(
  status: string,
  modifiedResponse: string | undefined,
  proposedResponse: string | null,
): string {
  switch (status) {
    case "APPROVED":
      // Distinguish a rubber-stamp from an approval that required edits.
      return modifiedResponse !== undefined && modifiedResponse !== proposedResponse
        ? "APPROVED_AFTER_EDIT"
        : "APPROVED_UNCHANGED";
    case "EDITED":
      return "APPROVED_AFTER_EDIT";
    case "REJECTED":
      return "REJECTED";
    case "CANCELLED":
      return "CANCELLED";
    default:
      return "UNKNOWN";
  }
}

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

      // --- Human Feedback Correlation (outcome tracking) ---
      // Stamp the originating decision with the human action so the audit
      // trail links AI proposal -> human verdict -> final outcome.
      if (updated) {
        const decisionRepo = new DecisionRepository(db);
        const budgetRepo = new BudgetRepository(db);
        const auditRepo = new AuditRepository(db);

        const humanAction = deriveHumanAction(
          parsed.data.status,
          parsed.data.modifiedResponse,
          updated.proposedResponse,
        );

        if (updated.decisionId) {
          // P1 Phase 44: feedback persistence must be auditable — a silent
          // catch would lose the highest-trust training signal. Failures are
          // logged and recorded as audit events, then surfaced to the caller.
          try {
            await decisionRepo.recordHumanFeedback(
              updated.decisionId,
              humanAction,
              parsed.data.comment,
            );

            // P1 Phase 8: persist the exact final approved value on the
            // decision so the audit trail captures what was sanctioned.
            if (
              (parsed.data.status === "APPROVED" || parsed.data.status === "EDITED") &&
              parsed.data.modifiedResponse !== undefined
            ) {
              await decisionRepo.recordFinalApprovedResponse(
                updated.decisionId,
                parsed.data.modifiedResponse,
              );
            } else if (parsed.data.status === "APPROVED") {
              await decisionRepo.recordFinalApprovedResponse(
                updated.decisionId,
                updated.proposedResponse ?? "",
              );
            }

            await auditRepo.record({
              id: `aud_fb_${randomUUID()}`,
              actor: parsed.data.reviewer,
              actorType: "HUMAN",
              action: `HUMAN_FEEDBACK_${humanAction}`,
              targetType: "decision",
              targetId: updated.decisionId,
              sessionId: updated.sessionId,
              decisionId: updated.decisionId,
              metadata: {
                approvalId: id,
                status: parsed.data.status,
                commentRedacted: parsed.data.comment
                  ? sanitizeForLogs(parsed.data.comment).slice(0, 500)
                  : null,
              },
            });
          } catch (feedbackErr) {
            // Auditable failure: log + audit event; never silently swallowed.
            logRouteError("approvals/[id]", feedbackErr);
            try {
              await auditRepo.record({
                id: `aud_fberr_${randomUUID()}`,
                actor: parsed.data.reviewer,
                actorType: "HUMAN",
                action: "HUMAN_FEEDBACK_PERSISTENCE_FAILED",
                targetType: "decision",
                targetId: updated.decisionId,
                sessionId: updated.sessionId,
                decisionId: updated.decisionId,
                metadata: {
                  approvalId: id,
                  error: sanitizeForLogs(String(feedbackErr)).slice(0, 500),
                },
              });
            } catch {
              // Audit path itself failed — the decision status update above
              // remains authoritative; surface via server logs only.
            }
          }

          // Corrections (rejections) count against the session autonomy budget.
          if (parsed.data.status === "REJECTED") {
            await budgetRepo.incrementCorrections(updated.sessionId).catch(() => undefined);
          }
        }
      }

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
