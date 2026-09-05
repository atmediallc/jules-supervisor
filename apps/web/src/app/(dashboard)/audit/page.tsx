import { getConfig } from "@jules/config";
import { getDatabase, AuditRepository } from "@jules/db";
import { getTranslations, getLocale } from "next-intl/server";
import { formatDateTime } from "@/lib/intl";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const t = await getTranslations("audit");
  const tCommon = await getTranslations("common");
  const locale = await getLocale();
  const config = getConfig();
  const db = getDatabase(config.DATABASE_URL);
  const repo = new AuditRepository(db);
  const auditLogs = (await repo.list(200)).map((ev) => ({
    id: ev.id,
    actor: ev.actor,
    actorType: ev.actorType,
    action: ev.action,
    targetId: ev.targetId,
    timestamp: ev.timestamp.toISOString(),
    details:
      (ev.metadata?.details as string | undefined) ??
      (ev.afterState ? JSON.stringify(ev.afterState) : ""),
  }));

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-panel via-abyss-soft to-abyss p-6">
        <div className="absolute -top-16 -right-16 w-56 h-56 bg-jules-600/10 blur-3xl rounded-full" />
        <div className="relative">
          <h2 className="text-2xl font-bold tracking-tight text-white">{t("title")}</h2>
          <p className="text-sm text-slate-400 mt-1">
            {t("description")}
          </p>
        </div>
      </div>

      <div className="relative overflow-hidden p-6 bg-gradient-to-br from-panel to-abyss-soft rounded-2xl border border-white/10 space-y-4">
        <div className="absolute inset-0 grid-overlay opacity-30 pointer-events-none" />
        <div className="relative space-y-3 font-mono text-xs">
          {auditLogs.map((log) => (
            <div
              key={log.id}
              className="p-3 bg-abyss/70 rounded-lg border border-white/5 flex items-start justify-between"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-jules-300 font-bold">{log.id}</span>
                  <span className="text-slate-200">[{log.action}]</span>
                  <span className="text-slate-400">{tCommon("target")}: {log.targetId}</span>
                  <span className="px-1.5 py-0.5 rounded bg-panel text-[10px] text-slate-300 border border-white/5">
                    {tCommon("actor")}: {log.actor} ({log.actorType})
                  </span>
                </div>
                <p className="text-slate-300 text-[11px]">{log.details}</p>
              </div>
              <span className="text-[10px] text-slate-500">
                    {formatDateTime(locale, log.timestamp)}
                  </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
