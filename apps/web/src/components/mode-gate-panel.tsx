"use client";

import { useTranslations } from "next-intl";
import { ShieldCheck, Zap } from "lucide-react";

/** Sidebar panel: supervisor execution mode + safety gate readout */
export function ModeGatePanel() {
  const t = useTranslations("common");

  return (
    <div className="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-panel to-abyss-soft p-3.5 text-xs font-mono">
      <div className="absolute -top-6 -right-6 w-16 h-16 bg-jules-600/10 blur-2xl rounded-full" />
      <div className="relative flex items-center justify-between text-slate-400 mb-2">
        <span className="flex items-center gap-1.5">
          <Zap className="w-3 h-3 text-jules-400" />
          {t("mode")}
        </span>
        <span className="text-amber-400 font-semibold tracking-wider border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 rounded">
          {t("dry_run")}
        </span>
      </div>
      <div className="relative flex items-center justify-between text-slate-400">
        <span className="flex items-center gap-1.5">
          <ShieldCheck className="w-3 h-3 text-emerald-400" />
          {t("gate")}
        </span>
        <span className="text-emerald-400 font-semibold tracking-wider border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 rounded">
          {t("enforced")}
        </span>
      </div>
    </div>
  );
}