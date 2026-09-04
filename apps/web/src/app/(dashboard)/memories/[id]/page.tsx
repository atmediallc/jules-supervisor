import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getConfig } from "@jules/config";
import { getDatabase, AiMemoryRepository } from "@jules/db";
import {
  ArrowLeft,
  Archive,
  CheckCircle2,
  RotateCcw,
} from "lucide-react";
import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
import { formatDateTime } from "@/lib/intl";

export const dynamic = "force-dynamic";

export default async function MemoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations("memory");
  const tCommon = await getTranslations("common");
  const locale = await getLocale();
  const config = getConfig();
  const db = getDatabase(config.DATABASE_URL);
  const repo = new AiMemoryRepository(db);

  const memory = await repo.findById(id);
  if (!memory) notFound();

  const influences = await repo.listInfluencesForMemory(id);

  return (
    <div className="space-y-6">
      <Link
        href="/memories"
        className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> {tCommon("back_to_memory_center")}
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">{memory.title}</h2>
          <p className="text-xs text-slate-500 font-mono mt-1">{memory.id}</p>
        </div>
        <div className="flex items-center gap-2">
          {memory.status !== "active" && (
            <form
              action={async () => {
                "use server";
                const c = getConfig();
                const d = getDatabase(c.DATABASE_URL);
                const r = new AiMemoryRepository(d);
                await r.update(id, { status: "active" });
                revalidatePath(`/memories/${id}`);
              }}
            >
              <button
                type="submit"
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-emerald-800 text-emerald-400 hover:bg-emerald-950/40 text-sm font-medium"
              >
                <RotateCcw className="w-4 h-4" /> {t("reactivate")}
              </button>
            </form>
          )}
          <form
            action={async () => {
              "use server";
              const c = getConfig();
              const d = getDatabase(c.DATABASE_URL);
              const r = new AiMemoryRepository(d);
              await r.markValidated(id);
              revalidatePath(`/memories/${id}`);
            }}
          >
            <button
              type="submit"
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-700 text-slate-200 hover:bg-slate-800 text-sm font-medium"
            >
              <CheckCircle2 className="w-4 h-4" /> {t("mark_validated")}
            </button>
          </form>
          {memory.status !== "archived" && (
            <form
              action={async () => {
                "use server";
                const c = getConfig();
                const d = getDatabase(c.DATABASE_URL);
                const r = new AiMemoryRepository(d);
                await r.archive(id);
                revalidatePath(`/memories/${id}`);
              }}
            >
              <button
                type="submit"
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-rose-800 text-rose-400 hover:bg-rose-950/40 text-sm font-medium"
              >
                <Archive className="w-4 h-4" /> {t("archive")}
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Core content */}
      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-6">
          <div className="p-6 bg-slate-900/60 rounded-xl border border-slate-800">
            <div className="text-xs uppercase tracking-wider text-slate-500 mb-3">
              {t("canonical_content")}
            </div>
            <pre className="whitespace-pre-wrap font-sans text-sm text-slate-200 leading-relaxed">
              {memory.canonicalContent}
            </pre>
          </div>

          <div className="p-6 bg-slate-900/60 rounded-xl border border-slate-800">
            <div className="text-xs uppercase tracking-wider text-slate-500 mb-3">
              {t("summary")}
            </div>
            <p className="text-sm text-slate-300">{memory.summary}</p>
          </div>

          {memory.tags.length > 0 && (
            <div className="p-6 bg-slate-900/60 rounded-xl border border-slate-800">
              <div className="text-xs uppercase tracking-wider text-slate-500 mb-3">{t("tags")}</div>
              <div className="flex flex-wrap gap-2">
                {memory.tags.map((t) => (
                  <span
                    key={t}
                    className="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-[11px] font-mono text-slate-300"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="p-6 bg-slate-900/60 rounded-xl border border-slate-800 space-y-3 text-sm">
            <div className="text-xs uppercase tracking-wider text-slate-500">{t("metadata")}</div>
            <MetaRow label={t("type")} value={memory.memoryType} />
            <MetaRow label={t("status")} value={memory.status} />
            <MetaRow label={t("confidence")} value={memory.confidence.toFixed(2)} />
            <MetaRow label={t("importance")} value={memory.importance.toFixed(2)} />
            <MetaRow label={t("source_trust")} value={memory.sourceTrust} />
            <MetaRow label={t("evidence_class")} value={memory.evidenceClass} />
            <MetaRow label={t("branch")} value={memory.branch ?? "—"} />
            <MetaRow label={t("embedding")} value={memory.embeddingModel} />
            <MetaRow label={t("created")} value={formatDateTime(locale, memory.createdAt)} />
          </div>

          <div className="p-6 bg-slate-900/60 rounded-xl border border-slate-800 space-y-3 text-sm">
            <div className="text-xs uppercase tracking-wider text-slate-500">{t("usage")}</div>
            <MetaRow label={t("accesses")} value={String(memory.accessCount)} />
            <MetaRow label={t("successful_uses")} value={String(memory.successfulUseCount)} />
            <MetaRow label={t("negative_outcomes")} value={String(memory.negativeOutcomeCount)} />
            <MetaRow
              label={t("last_accessed")}
              value={memory.lastAccessedAt ? formatDateTime(locale, memory.lastAccessedAt) : "—"}
            />
            <MetaRow label={t("last_used_exec")} value={memory.lastUsedExecutionId ?? "—"} />
          </div>
        </div>
      </div>

      {/* Influence trail */}
      <div className="p-6 bg-slate-900/60 rounded-xl border border-slate-800 space-y-3">
        <div className="text-xs uppercase tracking-wider text-slate-500">
          {t("influence_trail", { count: String(influences.length) })}
        </div>
        {influences.length === 0 ? (
          <p className="text-sm text-slate-400">
            {t("no_executions_recalled")}
          </p>
        ) : (
          <div className="space-y-2 font-mono text-xs">
            {influences.map((inf) => (
              <div
                key={inf.id}
                className="p-3 bg-slate-950/70 rounded-lg border border-slate-800/80 flex items-start justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="text-slate-200">
                    exec: <span className="text-indigo-400">{inf.executionId}</span>
                    <span className="text-slate-500"> · rank {inf.rank}</span>
                    <span className="text-slate-500">
                      {" "}· score {inf.retrievalScore.toFixed(3)}
                    </span>
                    <span className="text-slate-500"> · ~{inf.tokenCost} tok</span>
                  </div>
                  <p className="text-slate-400 text-[11px]">{inf.reasonSelected}</p>
                </div>
                <span className="text-[10px] text-slate-500">
                  {formatDateTime(locale, inf.createdAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-500 text-xs">{label}</span>
      <span className="text-slate-200 font-mono text-xs text-right break-all">{value}</span>
    </div>
  );
}
