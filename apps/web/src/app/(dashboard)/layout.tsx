"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
import { ModeGatePanel } from "@/components/mode-gate-panel";
import { SystemStatusBadges } from "@/components/system-status";
import { ThemeToggle } from "@/components/theme-toggle";

const NAV_ITEMS = [
  { href: "/", key: "overview", icon: Activity },
  { href: "/sessions", key: "jules_sessions", icon: TerminalSquare },
  { href: "/approvals", key: "approval_queue", icon: CheckCircle2, accent: "text-amber-400" },
  { href: "/decisions", key: "decisions_ai_logs", icon: Cpu },
  { href: "/memories", key: "memory_control", icon: Brain, accent: "text-violet-400" },
  { href: "/policies", key: "policies_risk", icon: FileCheck2 },
  { href: "/audit", key: "audit_trail", icon: History },
  { href: "/settings", key: "settings_providers", icon: Sliders },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations("sidebar");
  const tCommon = useTranslations("common");
  const pathname = usePathname();

  return (
    <div className="min-h-screen flex bg-abyss">
      {/* Sidebar */}
      <aside className="w-64 border-r border-white/5 bg-abyss-soft/80 backdrop-blur flex flex-col justify-between shrink-0">
        <div>
          {/* Brand */}
          <div className="relative px-4 py-5 mb-2 border-b border-white/5">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-jules-500/60 to-transparent" />
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="absolute inset-0 rounded-xl bg-jules-500/50 blur-lg" />
                <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-jules-500 via-jules-600 to-cyber-500 flex items-center justify-center shadow-[0_0_20px_-4px_rgba(59,130,246,0.7)]">
                  <ShieldAlert className="w-5 h-5 text-white" />
                </div>
              </div>
              <div>
                <h1 className="font-bold text-sm tracking-widest text-white uppercase">
                  Jules
                  <span className="bg-gradient-to-r from-jules-400 to-cyber-300 bg-clip-text text-transparent">
                    Supervisor
                  </span>
                </h1>
                <span className="text-[10px] text-cyber-300 font-mono flex items-center gap-1.5 mt-0.5">
                  <Radio className="w-3 h-3 animate-pulse" /> {tCommon("operational")}
                </span>
              </div>
            </div>
          </div>

          {/* Nav */}
          <nav className="space-y-1 px-3 py-3 text-sm font-medium">
            {NAV_ITEMS.map(({ href, key, icon: Icon, accent }) => {
              const active =
                href === "/" ? pathname === "/" : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`relative flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${
                    active
                      ? "text-white bg-gradient-to-r from-jules-500/15 to-cyber-500/5 ring-1 ring-inset ring-jules-500/30"
                      : "text-slate-400 hover:text-slate-100 hover:bg-white/5"
                  }`}
                >
                  {active && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full bg-gradient-to-b from-jules-400 to-cyber-300 shadow-[0_0_8px_rgba(59,130,246,0.9)]" />
                  )}
                  <Icon
                    className={`w-4 h-4 ${
                      active ? "text-jules-300" : accent ?? "text-slate-500 group-hover:text-jules-400"
                    }`}
                  />
                  {t(key)}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Footer: mode gate */}
        <div className="px-3 py-3 border-t border-white/5 space-y-2">
          <ModeGatePanel />
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto bg-abyss">
        <header className="h-16 border-b border-white/5 px-8 flex items-center justify-between bg-abyss-soft/60 backdrop-blur sticky top-0 z-20">
          <div className="text-xs text-slate-500 font-mono">
            <span className="text-slate-600">$</span> {tCommon("workspace")}:{" "}
            <span className="text-slate-300">
              {process.env["JULES_WORKSPACE_NAME"] || "jules-supervisor"}
            </span>
          </div>
          <div className="flex items-center gap-4 text-xs font-mono">
            <SystemStatusBadges />
            <ThemeToggle />
            <LanguageSwitcher />
          </div>
        </header>
        <div className="p-8 max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
