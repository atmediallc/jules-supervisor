import type { Metadata } from "next";
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
} from "lucide-react";

export const metadata: Metadata = {
  title: "Jules Supervisor — AI Orchestration & Governance Control Plane",
  description: "Autonomous policy-controlled supervisor for Google Jules",
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
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
                <Radio className="w-3 h-3 animate-pulse" /> OPERATIONAL
              </span>
            </div>
          </div>

          <nav className="space-y-1 text-sm font-medium">
            <Link
              href="/"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors"
            >
              <Activity className="w-4 h-4 text-slate-400" />
              Overview
            </Link>
            <Link
              href="/sessions"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors"
            >
              <TerminalSquare className="w-4 h-4 text-slate-400" />
              Jules Sessions
            </Link>
            <Link
              href="/approvals"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors"
            >
              <CheckCircle2 className="w-4 h-4 text-amber-400" />
              Approval Queue
            </Link>
            <Link
              href="/decisions"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors"
            >
              <Cpu className="w-4 h-4 text-slate-400" />
              Decisions & AI Logs
            </Link>
            <Link
              href="/policies"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors"
            >
              <FileCheck2 className="w-4 h-4 text-slate-400" />
              Policies & Risk
            </Link>
            <Link
              href="/audit"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors"
            >
              <History className="w-4 h-4 text-slate-400" />
              Audit Trail
            </Link>
            <Link
              href="/settings"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors"
            >
              <Sliders className="w-4 h-4 text-slate-400" />
              Settings & Providers
            </Link>
          </nav>
        </div>

        <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800/80 text-xs font-mono">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span>Mode:</span>
            <span className="text-amber-400 font-semibold">DRY_RUN</span>
          </div>
          <div className="flex items-center justify-between text-slate-400">
            <span>Gate:</span>
            <span className="text-emerald-400">ENFORCED</span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto bg-slate-950">
        <header className="h-16 border-b border-slate-800 px-8 flex items-center justify-between bg-slate-900/40">
          <div className="text-xs text-slate-400 font-mono">
            Workspace:{" "}
            <span className="text-slate-200">
              {process.env["JULES_WORKSPACE_NAME"] || "jules-supervisor"}
            </span>
          </div>
          <div className="flex items-center gap-4 text-xs font-mono">
            <span className="px-2.5 py-1 rounded bg-indigo-950 text-indigo-300 border border-indigo-800">
              OmniRoute / OpenAI
            </span>
            <span className="px-2.5 py-1 rounded bg-slate-800 text-slate-300 border border-slate-700">
              PostgreSQL & Redis
            </span>
          </div>
        </header>
        <div className="p-8 max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
