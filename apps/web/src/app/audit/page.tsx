export const dynamic = "force-dynamic";

export default function AuditPage() {
  const auditLogs = [
    {
      id: "aud_001",
      actor: "SUPERVISOR_AI",
      actorType: "SYSTEM",
      action: "DECISION_RESPOND",
      targetId: "ses_test_001",
      timestamp: "2026-08-27 10:15:35",
      details: "Generated recommendation to use user ID for rate limiting.",
    },
    {
      id: "aud_002",
      actor: "SUPERVISOR_AI",
      actorType: "SYSTEM",
      action: "DECISION_APPROVE_PLAN",
      targetId: "ses_test_002",
      timestamp: "2026-08-27 09:42:20",
      details: "Plan review triggered. Escalated to Human Approval Queue due to migration path.",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-white">Audit Trail</h2>
        <p className="text-sm text-slate-400 mt-1">
          Immutable log of all supervisor operations, AI evaluations, policy checks, and human
          approvals.
        </p>
      </div>

      <div className="p-6 bg-slate-900/60 rounded-xl border border-slate-800 space-y-4">
        <div className="space-y-3 font-mono text-xs">
          {auditLogs.map((log) => (
            <div
              key={log.id}
              className="p-3 bg-slate-950/70 rounded-lg border border-slate-800/80 flex items-start justify-between"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-indigo-400 font-bold">{log.id}</span>
                  <span className="text-slate-200">[{log.action}]</span>
                  <span className="text-slate-400">Target: {log.targetId}</span>
                  <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-slate-300">
                    Actor: {log.actor} ({log.actorType})
                  </span>
                </div>
                <p className="text-slate-300 text-[11px]">{log.details}</p>
              </div>
              <span className="text-[10px] text-slate-500">{log.timestamp}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
