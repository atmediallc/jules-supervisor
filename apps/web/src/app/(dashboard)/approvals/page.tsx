"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, XCircle, Edit3 } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { formatDateTime } from "@/lib/intl";

interface ApprovalItem {
  id: string;
  sessionId: string;
  action: string;
  risk: "low" | "medium" | "high" | "critical";
  confidence: number;
  reason: string;
  proposedResponse: string;
  createdAt: string;
}

export default function ApprovalsPage() {
  const t = useTranslations("approvals");
  const { locale } = useI18n();
  const [approvals, setApprovals] = useState<ApprovalItem[]>([]);

  useEffect(() => {
    fetch("/api/approvals")
      .then((res) => (res.ok ? res.json() : { approvals: [] }))
      .then((data) => {
        const list = (data.approvals ?? []) as ApprovalItem[];
        setApprovals(list);
      })
      .catch(() => setApprovals([]));
  }, []);

  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editedText, setEditedText] = useState<Record<string, string>>({});
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const handleAction = async (id: string, action: "APPROVED" | "REJECTED" | "EDITED") => {
    if (submittingId) return; // Prevent double submission
    setSubmittingId(id);

    try {
      // Simulate / Execute API call
      await fetch(`/api/approvals/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: action,
          reviewer: "human-admin",
          modifiedResponse: editedText[id],
        }),
      }).catch(() => {});

      setApprovals((prev) => prev.filter((item) => item.id !== id));
      setActionMessage(t("action_success", { id, action }));
      setTimeout(() => setActionMessage(null), 4000);
    } finally {
      setSubmittingId(null);
      setEditingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">{t("title")}</h2>
          <p className="text-sm text-slate-400 mt-1">
            {t("description")}
          </p>
        </div>
        <span className="px-3 py-1 bg-amber-950 text-amber-300 border border-amber-800 text-xs font-mono rounded">
          {t("pending_actions", { count: String(approvals.length) })}
        </span>
      </div>

      {actionMessage && (
        <div className="p-3 bg-emerald-950/80 border border-emerald-800 text-emerald-300 text-xs font-mono rounded-lg">
          {actionMessage}
        </div>
      )}

      {approvals.length === 0 ? (
        <div className="p-12 text-center bg-slate-900/40 rounded-xl border border-slate-800 space-y-2">
          <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
          <h3 className="text-base font-semibold text-white">{t("queue_empty")}</h3>
          <p className="text-xs text-slate-400">{t("queue_empty_description")}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {approvals.map((item) => (
            <div
              key={item.id}
              className="p-6 bg-slate-900/60 rounded-xl border border-slate-800 space-y-4"
            >
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-amber-400">{item.id}</span>
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-200">
                      {t("session")}: {item.sessionId}
                    </span>
                    <span
                      className={`text-xs font-mono px-2 py-0.5 rounded border ${
                        item.risk === "critical"
                          ? "bg-red-950 text-red-300 border-red-800"
                          : item.risk === "high"
                            ? "bg-rose-950 text-rose-300 border-rose-800"
                            : "bg-amber-950 text-amber-300 border-amber-800"
                      }`}
                    >
                      {item.risk.toUpperCase()} {t("risk")}
                    </span>
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800">
                      {t("action")}: {item.action}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 font-mono mt-1">
                    {t("confidence")}: {(item.confidence * 100).toFixed(0)}% — {item.reason}
                  </p>
                </div>
                <span className="text-[10px] font-mono text-slate-500">{formatDateTime(locale, item.createdAt)}</span>
              </div>

              {/* Proposed Response Box */}
              <div className="p-4 bg-slate-950 rounded-lg border border-slate-800">
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                  <span>{t("proposed_response")}</span>
                  {editingId !== item.id && (
                    <button
                      onClick={() => {
                        setEditingId(item.id);
                        setEditedText({ ...editedText, [item.id]: item.proposedResponse });
                      }}
                      className="flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300"
                    >
                      <Edit3 className="w-3 h-3" /> {t("edit_response")}
                    </button>
                  )}
                </div>

                {editingId === item.id ? (
                  <div className="space-y-2 mt-2">
                    <textarea
                      value={editedText[item.id] ?? item.proposedResponse}
                      onChange={(e) => setEditedText({ ...editedText, [item.id]: e.target.value })}
                      className="w-full h-24 p-3 bg-slate-900 text-xs font-mono text-white rounded border border-indigo-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setEditingId(null)}
                        className="px-3 py-1 text-xs text-slate-400 hover:text-white"
                      >
                        {t("cancel")}
                      </button>
                      <button
                        onClick={() => handleAction(item.id, "EDITED")}
                        disabled={submittingId === item.id}
                        className="px-3 py-1 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded font-medium"
                      >
                        {t("save_send_edited")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs font-mono text-slate-200 whitespace-pre-wrap">
                    {item.proposedResponse}
                  </p>
                )}
              </div>

              {/* Action Buttons */}
              {editingId !== item.id && (
                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    onClick={() => handleAction(item.id, "REJECTED")}
                    disabled={submittingId === item.id}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-800 text-xs font-semibold tracking-wide disabled:opacity-50 transition-colors"
                  >
                    <XCircle className="w-4 h-4" />
                    {t("reject_action")}
                  </button>

                  <button
                    onClick={() => handleAction(item.id, "APPROVED")}
                    disabled={submittingId === item.id}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold tracking-wide disabled:opacity-50 transition-colors"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    {t("approve_dispatch")}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
