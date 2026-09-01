import { getConfig } from "@jules/config";
import { getDatabase, SessionRepository, ActivityRepository } from "@jules/db";

export const dynamic = "force-dynamic";

export default async function SessionsPage() {
  const config = getConfig();
  const db = getDatabase(config.DATABASE_URL);
  const sessionsRepo = new SessionRepository(db);
  const activityRepo = new ActivityRepository(db);

  const sessions = await sessionsRepo.list(50);

  const rows = await Promise.all(
    sessions.map(async (session) => ({
      id: session.id,
      repository: session.repository,
      branch: session.branch,
      prompt: session.prompt,
      state: session.state,
      supervisorStatus: session.supervisorStatus,
      cycleCount: session.cycleCount,
      createdAt: session.createdAt.toISOString(),
      activities: (await activityRepo.listBySession(session.id, "desc")).slice(0, 10).map((a) => ({
        id: a.id,
        type: a.type,
        content: a.content ?? "",
        time: a.createdAt.toISOString(),
      })),
    })),
  );

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
        {rows.map((session) => (
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
                <div>{new Date(session.createdAt).toLocaleString()}</div>
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
                    <span className="text-[10px] font-mono text-slate-500">
                      {new Date(act.time).toLocaleString()}
                    </span>
                  </div>
                ))}
                {session.activities.length === 0 && (
                  <p className="text-xs text-slate-500">No activities recorded yet.</p>
                )}
              </div>
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <div className="p-6 bg-slate-900/60 rounded-xl border border-slate-800 text-sm text-slate-400">
            No sessions recorded yet. The supervisor will create sessions as Jules activity is
            observed.
          </div>
        )}
      </div>
    </div>
  );
}
