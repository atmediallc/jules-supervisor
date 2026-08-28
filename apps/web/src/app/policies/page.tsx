export const dynamic = "force-dynamic";

export default function PoliciesPage() {
  const policyRules = [
    {
      name: "No Destructive Commands Rule",
      type: "HARD_VETO",
      status: "ACTIVE",
      description:
        "Permanently blocks any SQL or shell pattern matching DROP TABLE, rm -rf, git force push, or --no-verify.",
      target: "All Sessions",
    },
    {
      name: "Security Paths Protection Rule",
      type: "REQUIRE_HUMAN",
      status: "ACTIVE",
      description:
        "Mandates human review for changes touching .env, auth/, migrations/, .github/workflows/, or secrets/.",
      target: "All Sessions",
    },
    {
      name: "Confidence Threshold Gate",
      type: "REQUIRE_HUMAN",
      status: "ACTIVE",
      description: "Requires human review whenever AI model confidence drops below 0.85.",
      target: "All Decisions",
    },
    {
      name: "Session Cycle Loop Ceiling",
      type: "HARD_LIMIT",
      status: "ACTIVE",
      description:
        "Escalates to human operator if session exceeds 5 conversation/correction cycles to prevent recursion.",
      target: "Session Watcher",
    },
  ];

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
