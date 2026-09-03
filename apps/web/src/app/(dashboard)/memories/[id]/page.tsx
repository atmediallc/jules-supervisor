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

export const dynamic = "force-dynamic";

export default async function MemoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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
        <ArrowLeft className="w-4 h-4" /> Back to Memory Control Center
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
                <RotateCcw className="w-4 h-4" /> Reactivate
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
              <CheckCircle2 className="w-4 h-4" /> Mark Validated
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
                <Archive className="w-4 h-4" /> Archive
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
              Canonical Content
            </div>
            <pre className="whitespace-pre-wrap font-sans text-sm text-slate-200 leading-relaxed">
              {memory.canonicalContent}
            </pre>
          </div>

          <div className="p-6 bg-slate-900/60 rounded-xl border border-slate-800">
            <div className="text-xs uppercase tracking-wider text-slate-500 mb-3">
              Summary
            </div>
            <p className="text-sm text-slate-300">{memory.summary}</p>
          </div>

          {memory.tags.length > 0 && (
            <div className="p-6 bg-slate-900/60 rounded-xl border border-slate-800">
              <div className="text-xs uppercase tracking-wider text-slate-500 mb-3">Tags</div>
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
            <div className="text-xs uppercase tracking-wider text-slate-500">Metadata</div>
            <MetaRow label="Type" value={memory.memoryType} />
            <MetaRow label="Status" value={memory.status} />
            <MetaRow label="Confidence" value={memory.confidence.toFixed(2)} />
            <MetaRow label="Importance" value={memory.importance.toFixed(2)} />
            <MetaRow label="Source Trust" value={memory.sourceTrust} />
            <MetaRow label="Evidence Class" value={memory.evidenceClass} />
            <MetaRow label="Branch" value={memory.branch ?? "—"} />
            <MetaRow label="Embedding" value={memory.embeddingModel} />
            <MetaRow label="Created" value={memory.createdAt.toLocaleString()} />
          </div>

          <div className="p-6 bg-slate-900/60 rounded-xl border border-slate-800 space-y-3 text-sm">
            <div className="text-xs uppercase tracking-wider text-slate-500">Usage</div>
            <MetaRow label="Accesses" value={String(memory.accessCount)} />
            <MetaRow label="Successful Uses" value={String(memory.successfulUseCount)} />
            <MetaRow label="Negative Outcomes" value={String(memory.negativeOutcomeCount)} />
            <MetaRow
              label="Last Accessed"
              value={memory.lastAccessedAt ? memory.lastAccessedAt.toLocaleString() : "—"}
            />
            <MetaRow label="Last Used Exec" value={memory.lastUsedExecutionId ?? "—"} />
          </div>
        </div>
      </div>

      {/* Influence trail */}
      <div className="p-6 bg-slate-900/60 rounded-xl border border-slate-800 space-y-3">
        <div className="text-xs uppercase tracking-wider text-slate-500">
          Influence Trail ({influences.length})
        </div>
        {influences.length === 0 ? (
          <p className="text-sm text-slate-400">
            No executions have recalled this memory yet.
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
                  {inf.createdAt.toLocaleString()}
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
