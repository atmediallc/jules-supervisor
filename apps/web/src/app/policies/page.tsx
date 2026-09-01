import { getConfig } from "@jules/config";
import { getDatabase, policies, sql } from "@jules/db";

export const dynamic = "force-dynamic";

export default async function PoliciesPage() {
  const config = getConfig();
  const db = getDatabase(config.DATABASE_URL);
  const rows = await db
    .select({
      id: policies.id,
      name: policies.name,
      version: policies.version,
      description: policies.description,
      rules: policies.rules,
      enabled: policies.enabled,
    })
    .from(policies)
    .orderBy(sql`name asc`);

  const policyRules = rows.map((p) => {
    const rules = (p.rules ?? {}) as Record<string, unknown>;
    return {
      name: p.name,
      type: (rules.ruleType as string) ?? "POLICY",
      status: p.enabled ? "ACTIVE" : "DISABLED",
      description: p.description ?? "",
      target: (rules.target as string) ?? `v${p.version}`,
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-white">Policy Engine Rules</h2>
        <p className="text-sm text-slate-400 mt-1">
          Deterministic safety rules and boundaries enforced downstream of AI decisions.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {policyRules.map((rule) => (
          <div
            key={rule.name}
            className="p-6 bg-slate-900/60 rounded-xl border border-slate-800 space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-white">{rule.name}</span>
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                  rule.type === "HARD_VETO"
                    ? "bg-rose-950 text-rose-300 border-rose-800"
                    : "bg-amber-950 text-amber-300 border-amber-800"
                }`}
              >
                {rule.type}
              </span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">{rule.description}</p>
            <div className="pt-2 border-t border-slate-800 text-[11px] font-mono text-slate-400 flex items-center justify-between">
              <span>Target: {rule.target}</span>
              <span className="text-emerald-400 font-semibold">{rule.status}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
