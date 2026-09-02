import { getConfig } from "@jules/config";
import { getDatabase, DecisionRepository } from "@jules/db";

export const dynamic = "force-dynamic";

export default async function DecisionsPage() {
  const config = getConfig();
  const db = getDatabase(config.DATABASE_URL);
  const repo = new DecisionRepository(db);
  const decisions = await repo.list(100);

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
                <div>{new Date(dec.createdAt).toLocaleString()}</div>
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
