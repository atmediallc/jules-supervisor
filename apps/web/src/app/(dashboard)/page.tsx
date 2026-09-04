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
import { getTranslations, getLocale } from "next-intl/server";
import { formatNumber } from "@/lib/intl";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const t = await getTranslations("overview");
  const tCommon = await getTranslations("common");
  const locale = await getLocale();
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
          <h2 className="text-2xl font-bold tracking-tight text-white">{t("title")}</h2>
          <p className="text-sm text-slate-400 mt-1">
            {t("description")}
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/approvals"
            className="flex items-center gap-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 px-4 py-2 rounded-lg text-xs font-semibold tracking-wide transition-colors"
          >
            <AlertTriangle className="w-4 h-4" />
            {t("pending_approvals", { count: String(stats.pendingHumanReviews) })}
          </Link>
          <Link
            href="/sessions"
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-xs font-semibold tracking-wide transition-colors"
          >
            <Activity className="w-4 h-4" />
            {t("view_sessions")}
          </Link>
        </div>
      </div>

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 bg-slate-900/60 rounded-xl border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
            <span>{t("active_jules_sessions")}</span>
            <Activity className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-3xl font-bold text-white font-mono">{formatNumber(locale, stats.activeSessions)}</div>
          <div className="text-xs text-slate-400">
            <span className="text-amber-400 font-medium">{formatNumber(locale, stats.awaitingFeedback)}</span> {t("awaiting_feedback", { count: String(stats.awaitingFeedback) })}
          </div>
        </div>

        <div className="p-5 bg-slate-900/60 rounded-xl border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
            <span>{t("pending_approvals_card")}</span>
            <CheckCircle2 className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-3xl font-bold text-amber-400 font-mono">
            {formatNumber(locale, stats.pendingHumanReviews)}
          </div>
          <div className="text-xs text-slate-400">{t("requires_human_signoff")}</div>
        </div>

        <div className="p-5 bg-slate-900/60 rounded-xl border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
            <span>{t("decisions_today")}</span>
            <Cpu className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-3xl font-bold text-white font-mono">{formatNumber(locale, stats.decisionsToday)}</div>
          <div className="text-xs text-slate-400">
            <span className="text-emerald-400 font-medium">{formatNumber(locale, stats.autoExecuted)}</span> {t("auto_executed", { count: String(stats.autoExecuted) })}
          </div>
        </div>

        <div className="p-5 bg-slate-900/60 rounded-xl border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
            <span>{t("avg_decision_latency")}</span>
            <Clock className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-3xl font-bold text-white font-mono">{stats.avgLatencyMs}ms</div>
          <div className="text-xs text-slate-400">{t("including_context_inference")}</div>
        </div>
      </div>

      {/* Grid: Active Sessions & Risk Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Active Sessions List */}
        <div className="lg:col-span-2 p-6 bg-slate-900/60 rounded-xl border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-white">{t("active_sessions_list")}</h3>
            <span className="text-xs text-slate-400 font-mono">{tCommon("live")}</span>
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
                      {tCommon("inspect")}
                    </Link>
                  </div>
                );
              })}
            {allSessions.filter((s) => !["COMPLETED", "CANCELLED", "FAILED"].includes(s.state))
              .length === 0 && (
              <p className="text-xs text-slate-500">{tCommon("no_sessions_active")}</p>
            )}
          </div>
        </div>

        {/* Security & Risk Distribution */}
        <div className="p-6 bg-slate-900/60 rounded-xl border border-slate-800 space-y-4">
          <h3 className="text-base font-semibold text-white">{t("policy_risk_status")}</h3>

          <div className="space-y-3 font-mono text-xs" id="risk-dist">
            <RiskStat label={t("low_risk_safe")} risk="low" db={db} />
            <RiskStat label={t("medium_risk_review")} risk="medium" db={db} />
            <RiskStat label={t("high_risk_escalated")} risk="high" db={db} />
            <RiskStat label={t("critical_vetoed")} risk="critical" db={db} />
          </div>

          <div className="pt-2 border-t border-slate-800 text-xs text-slate-400">
            <p>
              {t("safety_gate_mode")}: <span className="text-amber-400 font-mono font-bold">{tCommon("dry_run")}</span>
            </p>
            <p className="mt-1">{t("mutations_suppressed")}</p>
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
