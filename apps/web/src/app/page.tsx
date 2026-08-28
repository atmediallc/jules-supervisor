import { Activity, Cpu, CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  const stats = {
    activeSessions: 3,
    awaitingFeedback: 1,
    awaitingPlanApproval: 1,
    pendingHumanReviews: 2,
    decisionsToday: 42,
    autoExecuted: 14,
    blockedDecisions: 2,
    avgLatencyMs: 840,
  };

  return (
    <div className="space-y-8">
      {/* Top Banner */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">System Overview</h2>
          <p className="text-sm text-slate-400 mt-1">
            Real-time telemetry and supervision control plane for Google Jules coding sessions.
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/approvals"
            className="flex items-center gap-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 px-4 py-2 rounded-lg text-xs font-semibold tracking-wide transition-colors"
          >
            <AlertTriangle className="w-4 h-4" />
            {stats.pendingHumanReviews} PENDING APPROVALS
          </Link>
          <Link
            href="/sessions"
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-xs font-semibold tracking-wide transition-colors"
          >
            <Activity className="w-4 h-4" />
            VIEW SESSIONS
          </Link>
        </div>
      </div>

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 bg-slate-900/60 rounded-xl border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
            <span>Active Jules Sessions</span>
            <Activity className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-3xl font-bold text-white font-mono">{stats.activeSessions}</div>
          <div className="text-xs text-slate-400">
            <span className="text-amber-400 font-medium">{stats.awaitingFeedback}</span> awaiting
            feedback
          </div>
        </div>

        <div className="p-5 bg-slate-900/60 rounded-xl border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
            <span>Pending Approvals</span>
            <CheckCircle2 className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-3xl font-bold text-amber-400 font-mono">
            {stats.pendingHumanReviews}
          </div>
          <div className="text-xs text-slate-400">Requires human sign-off</div>
        </div>

        <div className="p-5 bg-slate-900/60 rounded-xl border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
            <span>Decisions Today</span>
            <Cpu className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-3xl font-bold text-white font-mono">{stats.decisionsToday}</div>
          <div className="text-xs text-slate-400">
            <span className="text-emerald-400 font-medium">{stats.autoExecuted}</span> auto-executed
          </div>
        </div>

        <div className="p-5 bg-slate-900/60 rounded-xl border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
            <span>Avg Decision Latency</span>
            <Clock className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-3xl font-bold text-white font-mono">{stats.avgLatencyMs}ms</div>
          <div className="text-xs text-slate-400">Including context & AI inference</div>
        </div>
      </div>

      {/* Grid: Active Sessions & Risk Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Active Sessions List */}
        <div className="lg:col-span-2 p-6 bg-slate-900/60 rounded-xl border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-white">Active Jules Sessions</h3>
            <span className="text-xs text-slate-400 font-mono">Live Ingestion</span>
          </div>

          <div className="space-y-3">
            <div className="p-4 bg-slate-950/70 rounded-lg border border-slate-800/80 flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-indigo-400">ses_test_001</span>
                  <span className="text-xs font-semibold text-white">owner/repo (main)</span>
                  <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-amber-950 text-amber-300 border border-amber-800">
                    AWAITING_USER_INPUT
                  </span>
                </div>
                <p className="text-xs text-slate-400 line-clamp-1">
                  Please add Redis token bucket rate limiting to our auth endpoints
                </p>
              </div>
              <Link
                href="/sessions"
                className="text-xs text-indigo-400 hover:text-indigo-300 font-medium px-3 py-1.5 rounded bg-slate-900 border border-slate-800"
              >
                Inspect
              </Link>
            </div>

            <div className="p-4 bg-slate-950/70 rounded-lg border border-slate-800/80 flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-indigo-400">ses_test_002</span>
                  <span className="text-xs font-semibold text-white">owner/repo (feat/db)</span>
                  <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-purple-950 text-purple-300 border border-purple-800">
                    AWAITING_PLAN_APPROVAL
                  </span>
                </div>
                <p className="text-xs text-slate-400 line-clamp-1">
                  Migrate user table to add multi-factor authentication column
                </p>
              </div>
              <Link
                href="/sessions"
                className="text-xs text-indigo-400 hover:text-indigo-300 font-medium px-3 py-1.5 rounded bg-slate-900 border border-slate-800"
              >
                Inspect
              </Link>
            </div>
          </div>
        </div>

        {/* Security & Risk Distribution */}
        <div className="p-6 bg-slate-900/60 rounded-xl border border-slate-800 space-y-4">
          <h3 className="text-base font-semibold text-white">Policy & Risk Status</h3>

          <div className="space-y-3 font-mono text-xs">
            <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800/80 flex items-center justify-between">
              <span className="text-emerald-400">LOW RISK (Safe)</span>
              <span className="text-white font-bold">28</span>
            </div>
            <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800/80 flex items-center justify-between">
              <span className="text-amber-400">MEDIUM RISK (Review)</span>
              <span className="text-white font-bold">12</span>
            </div>
            <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800/80 flex items-center justify-between">
              <span className="text-rose-400">HIGH RISK (Escalated)</span>
              <span className="text-white font-bold">2</span>
            </div>
            <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800/80 flex items-center justify-between">
              <span className="text-red-500">CRITICAL (Vetoed)</span>
              <span className="text-white font-bold">0</span>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-800 text-xs text-slate-400">
            <p>
              Safety Gate Mode: <span className="text-amber-400 font-mono font-bold">DRY_RUN</span>
            </p>
            <p className="mt-1">All mutations safely suppressed by default.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
