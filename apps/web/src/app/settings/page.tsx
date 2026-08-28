export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const settings = [
    {
      label: "Execution Mode",
      value: "DRY_RUN",
      desc: "Never performs mutations against Jules API",
    },
    {
      label: "Auto Respond Enabled",
      value: "false",
      desc: "Autonomous responses to low-risk questions",
    },
    {
      label: "Auto Plan Approval",
      value: "false",
      desc: "Autonomous approval of non-destructive plans",
    },
    {
      label: "AI Provider Endpoint",
      value: "https://api.openai.com/v1 (OmniRoute Compatible)",
      desc: "Configured via AI_BASE_URL",
    },
    { label: "AI Model", value: "gpt-4o", desc: "Configured via AI_MODEL" },
    {
      label: "AI API Key",
      value: "••••••••••••••••••••••••••••••••",
      desc: "Stored securely server-side",
    },
    {
      label: "Google Jules API Key",
      value: "••••••••••••••••••••••••••••••••",
      desc: "Stored securely server-side",
    },
    {
      label: "Polling Interval",
      value: "5,000 ms",
      desc: "Session Watcher poll cycle with jitter",
    },
    {
      label: "Confidence Threshold",
      value: "0.85 (85%)",
      desc: "Minimum confidence to allow automated evaluation",
    },
    { label: "Max Session Cycles", value: "5", desc: "Recursion loop prevention ceiling" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-white">
          System Settings & Configuration
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          Active configuration values, API provider settings, and runtime safety parameters.
        </p>
      </div>

      <div className="p-6 bg-slate-900/60 rounded-xl border border-slate-800 space-y-4">
        <div className="divide-y divide-slate-800/80">
          {settings.map((item) => (
            <div key={item.label} className="py-3.5 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-white">{item.label}</div>
                <div className="text-xs text-slate-400">{item.desc}</div>
              </div>
              <span className="font-mono text-xs text-indigo-300 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">
                {item.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
