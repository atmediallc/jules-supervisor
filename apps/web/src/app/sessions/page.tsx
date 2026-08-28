export const dynamic = "force-dynamic";

export default function SessionsPage() {
  const mockSessions = [
    {
      id: "ses_test_001",
      repository: "octocat/hello-world",
      branch: "main",
      prompt: "Please add Redis token bucket rate limiting to our auth endpoints",
      state: "AWAITING_USER_INPUT",
      supervisorStatus: "PENDING_DECISION",
      cycleCount: 1,
      createdAt: "2026-08-27 10:15:00",
      activities: [
        {
          id: "act_101",
          type: "AGENT_MESSAGE",
          content: "Should rate limiting apply per IP address or per authenticated user ID?",
          time: "10:15:30",
        },
      ],
    },
    {
      id: "ses_test_002",
      repository: "octocat/hello-world",
      branch: "feat/db",
      prompt: "Migrate user table to add multi-factor authentication column",
      state: "AWAITING_PLAN_APPROVAL",
      supervisorStatus: "AWAITING_APPROVAL",
      cycleCount: 1,
      createdAt: "2026-08-27 09:40:00",
      activities: [
        {
          id: "act_201",
          type: "PLAN_GENERATED",
          content: "Step 1: Create migration 0004_add_mfa.sql\nStep 2: Update schema definitions",
          time: "09:42:15",
        },
      ],
    },
    {
      id: "ses_test_003",
      repository: "octocat/hello-world",
      branch: "fix/typo",
      prompt: "Fix typos in documentation and comments",
      state: "COMPLETED",
      supervisorStatus: "RESOLVED",
      cycleCount: 2,
      createdAt: "2026-08-27 08:20:00",
      activities: [
        {
          id: "act_301",
          type: "PATCH_CREATED",
          content: "Updated docs/README.md with corrected spelling.",
          time: "08:22:10",
        },
      ],
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">Jules Sessions</h2>
          <p className="text-sm text-slate-400 mt-1">
            Supervised Google Jules sessions, state machine status, and activity traces.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {mockSessions.map((session) => (
          <div
            key={session.id}
            className="p-6 bg-slate-900/60 rounded-xl border border-slate-800 space-y-4"
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm font-bold text-indigo-400">{session.id}</span>
                  <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-200 font-mono">
                    {session.repository} ({session.branch})
                  </span>
                  <span
                    className={`text-xs font-mono px-2.5 py-0.5 rounded border ${
                      session.state === "AWAITING_USER_INPUT"
                        ? "bg-amber-950 text-amber-300 border-amber-800"
                        : session.state === "AWAITING_PLAN_APPROVAL"
                          ? "bg-purple-950 text-purple-300 border-purple-800"
                          : "bg-emerald-950 text-emerald-300 border-emerald-800"
                    }`}
                  >
                    {session.state}
                  </span>
                </div>
                <p className="text-sm text-slate-200 font-medium mt-2">{session.prompt}</p>
              </div>
              <div className="text-right text-xs font-mono text-slate-400">
                <div>Cycles: {session.cycleCount}</div>
                <div>{session.createdAt}</div>
              </div>
            </div>

            {/* Activities */}
            <div className="mt-4 pt-4 border-t border-slate-800/80">
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Recent Activities
              </h4>
              <div className="space-y-2">
                {session.activities.map((act) => (
                  <div
                    key={act.id}
                    className="p-3 bg-slate-950/60 rounded-lg border border-slate-800/60 flex items-start justify-between"
                  >
                    <div>
                      <span className="text-xs font-mono text-indigo-300">[{act.type}]</span>
                      <p className="text-xs text-slate-300 mt-1 whitespace-pre-wrap font-mono">
                        {act.content}
                      </p>
                    </div>
                    <span className="text-[10px] font-mono text-slate-500">{act.time}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
