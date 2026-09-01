import { Activity, Cpu, CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { getConfig } from "@jules/config";
import {
  getDatabase,
  approvalRequests,
  decisions,
  sql,
  SessionRepository,
} from "@jules/db";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const config = getConfig();
  const db = getDatabase(config.DATABASE_URL);
  const sessionsRepo = new SessionRepository(db);

  const allSessions = await sessionsRepo.list(500);
  const activeCount = allSessions.filter(
    (s) => !["COMPLETED", "CANCELLED", "FAILED"].includes(s.state),
  ).length;
  const [pendingCount, todayCount, autoCount, blockedCount, avgRow] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(approvalRequests)
      .where(sql`status = 'PENDING'`),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(decisions)
      .where(sql`created_at >= now() - interval '24 hours'`),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(decisions)
      .where(sql`execution_state = 'EXECUTED'`),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(decisions)
      .where(sql`execution_state = 'BLOCKED'`),
    db
      .select({ avg: sql<number>`coalesce(avg(ai_latency_ms), 0)::int` })
      .from(decisions)
      .where(sql`created_at >= now() - interval '24 hours'`),
  ]);

  const stats = {
    activeSessions: activeCount,
    awaitingFeedback: allSessions.filter((s) => s.state === "AWAITING_USER_INPUT").length,
    awaitingPlanApproval: allSessions.filter((s) => s.state === "AWAITING_PLAN_APPROVAL").length,
    pendingHumanReviews: pendingCount[0]?.count ?? 0,
    decisionsToday: todayCount[0]?.count ?? 0,
    autoExecuted: autoCount[0]?.count ?? 0,
    blockedDecisions: blockedCount[0]?.count ?? 0,
    avgLatencyMs: avgRow[0]?.avg ?? 0,
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
            <span className="text-xs text-slate-400 font-mono">Live</span>
          </div>

          <div className="space-y-3">
            {allSessions
              .filter((s) => !["COMPLETED", "CANCELLED", "FAILED"].includes(s.state))
              .slice(0, 10)
              .map((s) => {
                const stateColor =
                  s.state === "AWAITING_USER_INPUT"
                    ? "bg-amber-950 text-amber-300 border-amber-800"
                    : s.state === "AWAITING_PLAN_APPROVAL"
                      ? "bg-purple-950 text-purple-300 border-purple-800"
                      : "bg-emerald-950 text-emerald-300 border-emerald-800";
                return (
                  <div
                    key={s.id}
                    className="p-4 bg-slate-950/70 rounded-lg border border-slate-800/80 flex items-center justify-between"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-indigo-400">{s.id}</span>
                        <span className="text-xs font-semibold text-white">
                          {s.repository} ({s.branch})
                        </span>
                        <span className={`px-2 py-0.5 text-[10px] font-mono rounded border ${stateColor}`}>
                          {s.state}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 line-clamp-1">{s.prompt}</p>
                    </div>
                    <Link
                      href="/sessions"
                      className="text-xs text-indigo-400 hover:text-indigo-300 font-medium px-3 py-1.5 rounded bg-slate-900 border border-slate-800"
                    >
                      Inspect
                    </Link>
                  </div>
                );
              })}
            {allSessions.filter((s) => !["COMPLETED", "CANCELLED", "FAILED"].includes(s.state))
              .length === 0 && (
              <p className="text-xs text-slate-500">No active sessions.</p>
            )}
          </div>
        </div>

        {/* Security & Risk Distribution */}
        <div className="p-6 bg-slate-900/60 rounded-xl border border-slate-800 space-y-4">
          <h3 className="text-base font-semibold text-white">Policy & Risk Status</h3>

          <div className="space-y-3 font-mono text-xs" id="risk-dist">
            <RiskStat label="LOW RISK (Safe)" risk="low" db={db} />
            <RiskStat label="MEDIUM RISK (Review)" risk="medium" db={db} />
            <RiskStat label="HIGH RISK (Escalated)" risk="high" db={db} />
            <RiskStat label="CRITICAL (Vetoed)" risk="critical" db={db} />
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

async function RiskStat({ label, risk, db }: { label: string; risk: string; db: ReturnType<typeof getDatabase> }) {
  const row = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(decisions)
    .where(sql`risk = ${risk}`);
  const count = row[0]?.count ?? 0;
  const color = risk === "low" ? "text-emerald-400" : risk === "medium" ? "text-amber-400" : risk === "high" ? "text-rose-400" : "text-red-500";
  return (
    <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800/80 flex items-center justify-between">
      <span className={color}>{label}</span>
      <span className="text-white font-bold">{count}</span>
    </div>
  );
}
