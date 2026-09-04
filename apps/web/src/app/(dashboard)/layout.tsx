"use client";

import Link from "next/link";
import {
  ShieldAlert,
  Activity,
  Cpu,
  FileCheck2,
  Sliders,
  History,
  TerminalSquare,
  Radio,
  CheckCircle2,
  Brain,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { LanguageSwitcher } from "@/i18n";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations("sidebar");
  const tCommon = useTranslations("common");
  const tHeader = useTranslations("header");

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-64 border-r border-slate-800 bg-slate-900/80 p-4 flex flex-col justify-between shrink-0">
        <div>
          <div className="flex items-center gap-3 px-3 py-4 mb-6 border-b border-slate-800">
            <ShieldAlert className="w-7 h-7 text-indigo-400" />
            <div>
              <h1 className="font-bold text-base tracking-wide text-white">JULES SUPERVISOR</h1>
              <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1.5 mt-0.5">
                <Radio className="w-3 h-3 animate-pulse" /> {tCommon("operational")}
              </span>
            </div>
          </div>

          <nav className="space-y-1 text-sm font-medium">
            <Link
              href="/"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors"
            >
              <Activity className="w-4 h-4 text-slate-400" />
              {t("overview")}
            </Link>
            <Link
              href="/sessions"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors"
            >
              <TerminalSquare className="w-4 h-4 text-slate-400" />
              {t("jules_sessions")}
            </Link>
            <Link
              href="/approvals"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors"
            >
              <CheckCircle2 className="w-4 h-4 text-amber-400" />
              {t("approval_queue")}
            </Link>
            <Link
              href="/decisions"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors"
            >
              <Cpu className="w-4 h-4 text-slate-400" />
              {t("decisions_ai_logs")}
            </Link>
            <Link
              href="/memories"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors"
            >
              <Brain className="w-4 h-4 text-violet-400" />
              {t("memory_control")}
            </Link>
            <Link
              href="/policies"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors"
            >
              <FileCheck2 className="w-4 h-4 text-slate-400" />
              {t("policies_risk")}
            </Link>
            <Link
              href="/audit"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors"
            >
              <History className="w-4 h-4 text-slate-400" />
              {t("audit_trail")}
            </Link>
            <Link
              href="/settings"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors"
            >
              <Sliders className="w-4 h-4 text-slate-400" />
              {t("settings_providers")}
            </Link>
          </nav>
        </div>

        <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800/80 text-xs font-mono">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span>{tCommon("mode")}:</span>
            <span className="text-amber-400 font-semibold">{tCommon("dry_run")}</span>
          </div>
          <div className="flex items-center justify-between text-slate-400">
            <span>{tCommon("gate")}:</span>
            <span className="text-emerald-400">{tCommon("enforced")}</span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto bg-slate-950">
        <header className="h-16 border-b border-slate-800 px-8 flex items-center justify-between bg-slate-900/40">
          <div className="text-xs text-slate-400 font-mono">
            {tCommon("workspace")}:{" "}
            <span className="text-slate-200">
              {process.env["JULES_WORKSPACE_NAME"] || "jules-supervisor"}
            </span>
          </div>
          <div className="flex items-center gap-4 text-xs font-mono">
            <span className="px-2.5 py-1 rounded bg-indigo-950 text-indigo-300 border border-indigo-800">
              {tHeader("omniroute_openai")}
            </span>
            <span className="px-2.5 py-1 rounded bg-slate-800 text-slate-300 border border-slate-700">
              {tHeader("postgres_redis")}
            </span>
            <LanguageSwitcher />
          </div>
        </header>
        <div className="p-8 max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
