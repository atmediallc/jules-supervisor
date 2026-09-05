import { getConfig } from "@jules/config";
import { getDatabase, DecisionRepository } from "@jules/db";
import { getTranslations, getLocale } from "next-intl/server";
import { formatDateTime, formatPercent } from "@/lib/intl";

export const dynamic = "force-dynamic";

export default async function DecisionsPage() {
  const t = await getTranslations("decisions");
  const locale = await getLocale();
  const config = getConfig();
  const db = getDatabase(config.DATABASE_URL);
  const repo = new DecisionRepository(db);
  const decisions = await repo.list(100);

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-panel via-abyss-soft to-abyss p-6">
        <div className="absolute -top-16 -right-16 w-56 h-56 bg-jules-600/10 blur-3xl rounded-full" />
        <div className="relative">
          <h2 className="text-2xl font-bold tracking-tight text-white">
            {t("title")}
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            {t("description")}
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {decisions.map((dec) => (
          <div
            key={dec.id}
            className="relative overflow-hidden p-6 bg-gradient-to-br from-panel to-abyss-soft rounded-2xl border border-white/10 space-y-4 hover:border-jules-500/30 transition-colors"
          >
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-jules-600/5 blur-3xl rounded-full" />
            <div className="relative flex items-start justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm font-bold text-jules-300">{dec.id}</span>
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-abyss text-slate-200 border border-white/10">
                    {t("session")}: {dec.sessionId}
                  </span>
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-jules-950 text-jules-300 border border-jules-800">
                    {t("action")}: {dec.action}
                  </span>
                  <span
                    className={`text-xs font-mono px-2 py-0.5 rounded border ${
                      dec.risk === "high"
                        ? "bg-rose-950 text-rose-300 border-rose-800"
                        : "bg-emerald-950 text-emerald-300 border-emerald-800"
                    }`}
                  >
                    {dec.risk.toUpperCase()} {t("risk")}
                  </span>
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-abyss text-slate-300 border border-white/10">
                    {t("state")}: {dec.executionState}
                  </span>
                </div>
                <p className="text-xs text-slate-300 font-mono mt-2">
                  {t("confidence")}: {formatPercent(locale, dec.confidence)} — {dec.reason}
                </p>
              </div>
              <div className="text-right text-xs font-mono text-slate-400">
                <div>Model: {dec.model}</div>
                <div>{formatDateTime(locale, dec.createdAt)}</div>
              </div>
            </div>

            <div className="relative pt-3 border-t border-white/5 flex items-center justify-between text-[11px] font-mono text-slate-400">
              <div>
                {t("context_digest")}: <span className="text-slate-200">{dec.contextDigest}</span>
              </div>
              <div>{t("provider")}: {dec.provider}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
