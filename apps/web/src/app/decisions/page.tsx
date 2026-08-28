export const dynamic = "force-dynamic";

export default function DecisionsPage() {
  const decisions = [
    {
      id: "dec_9876543210ab",
      sessionId: "ses_test_001",
      activityId: "act_101",
      action: "RESPOND",
      risk: "low",
      confidence: 0.92,
      reason: "Standard architectural best practice for API rate limiting.",
      provider: "omniroute",
      model: "gpt-4o",
      contextDigest: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      executionState: "DRY_RUN_COMPLETED",
      createdAt: "2026-08-27 10:15:35",
    },
    {
      id: "dec_1234567890cd",
      sessionId: "ses_test_002",
      activityId: "act_201",
      action: "APPROVE_PLAN",
      risk: "high",
      confidence: 0.95,
      reason: "Plan touches database migration. Escalated to human review queue.",
      provider: "omniroute",
      model: "gpt-4o",
      contextDigest: "8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327aa4",
      executionState: "AWAITING_APPROVAL",
      createdAt: "2026-08-27 09:42:20",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-white">
          Supervisor Decisions & AI Logs
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          Complete audit trail of AI model evaluations, risk scoring, confidence, and execution
          state.
        </p>
      </div>

      <div className="space-y-4">
        {decisions.map((dec) => (
          <div
            key={dec.id}
            className="p-6 bg-slate-900/60 rounded-xl border border-slate-800 space-y-4"
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm font-bold text-indigo-400">{dec.id}</span>
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-200">
                    Session: {dec.sessionId}
                  </span>
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800">
                    Action: {dec.action}
                  </span>
                  <span
                    className={`text-xs font-mono px-2 py-0.5 rounded border ${
                      dec.risk === "high"
                        ? "bg-rose-950 text-rose-300 border-rose-800"
                        : "bg-emerald-950 text-emerald-300 border-emerald-800"
                    }`}
                  >
                    {dec.risk.toUpperCase()} RISK
                  </span>
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                    State: {dec.executionState}
                  </span>
                </div>
                <p className="text-xs text-slate-300 font-mono mt-2">
                  Confidence: {(dec.confidence * 100).toFixed(0)}% — {dec.reason}
                </p>
              </div>
              <div className="text-right text-xs font-mono text-slate-400">
                <div>Model: {dec.model}</div>
                <div>{dec.createdAt}</div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono text-slate-400">
              <div>
                Context Digest SHA-256: <span className="text-slate-200">{dec.contextDigest}</span>
              </div>
              <div>Provider: {dec.provider}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
