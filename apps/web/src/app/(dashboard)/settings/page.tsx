"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Sliders,
  Save,
  RefreshCw,
  Eye,
  EyeOff,
  Shield,
  Cpu,
  Wallet,
  Database,
  Brain,
  Server,
  ChevronDown,
  ChevronRight,
  Check,
  AlertTriangle,
} from "lucide-react";

interface SettingItem {
  key: string;
  value: string;
  rawValue: string | null;
  category: string;
  isSecret: boolean;
  description: string;
  source: "database" | "environment" | "default";
}

const CATEGORY_META: Record<
  string,
  { label: string; icon: typeof Sliders; color: string }
> = {
  execution: { label: "Execution & Safety", icon: Shield, color: "text-amber-400" },
  budget: { label: "Budget Engine", icon: Wallet, color: "text-emerald-400" },
  ai: { label: "AI Provider", icon: Brain, color: "text-indigo-400" },
  jules: { label: "Google Jules API", icon: Cpu, color: "text-sky-400" },
  memory: { label: "Memory & Knowledge", icon: Database, color: "text-purple-400" },
  infrastructure: { label: "Infrastructure", icon: Server, color: "text-rose-400" },
};

const SOURCE_BADGE: Record<string, { label: string; className: string }> = {
  database: {
    label: "DB Override",
    className: "bg-emerald-950 text-emerald-300 border-emerald-800",
  },
  environment: {
    label: "ENV",
    className: "bg-sky-950 text-sky-300 border-sky-800",
  },
  default: {
    label: "Default",
    className: "bg-slate-800 text-slate-400 border-slate-700",
  },
};

async function loadSettingsFromApi(): Promise<SettingItem[]> {
  const res = await fetch("/api/settings");
  const data = await res.json();
  return (data.settings as SettingItem[]) ?? [];
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [revealedSecrets, setRevealedSecrets] = useState<Set<string>>(new Set());
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const data = await loadSettingsFromApi();
      setSettings(data);
    } catch {
      setMessage({ type: "error", text: "Failed to load settings" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const grouped = settings.reduce<Record<string, SettingItem[]>>((acc, s) => {
    (acc[s.category] ??= []).push(s);
    return acc;
  }, {});

  const changedCount = Object.keys(edits).length;

  const handleSave = async () => {
    if (changedCount === 0) return;
    setSaving(true);
    setMessage(null);

    const payload = Object.entries(edits).map(([key, value]) => ({ key, value }));

    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: payload }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Update failed");
      }

      setMessage({ type: "success", text: `${changedCount} setting(s) updated successfully` });
      setEdits({});
      await fetchSettings();
    } catch (err: unknown) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to save settings",
      });
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 5000);
    }
  };

  const toggleCategory = (cat: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) {
        next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });
  };

  const toggleSecretReveal = (key: string) => {
    setRevealedSecrets((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">
            System Settings & Configuration
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Manage API credentials, AI endpoints, and runtime parameters from the admin panel.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchSettings}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            onClick={handleSave}
            disabled={saving || changedCount === 0}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? "Saving…" : `Save Changes${changedCount > 0 ? ` (${changedCount})` : ""}`}
          </button>
        </div>
      </div>

      {/* Status Messages */}
      {message && (
        <div
          className={`p-3 rounded-lg border text-xs font-mono flex items-center gap-2 ${
            message.type === "success"
              ? "bg-emerald-950/80 border-emerald-800 text-emerald-300"
              : "bg-rose-950/80 border-rose-800 text-rose-300"
          }`}
        >
          {message.type === "success" ? (
            <Check className="w-4 h-4 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0" />
          )}
          {message.text}
        </div>
      )}

      {/* Loading State */}
      {loading && settings.length === 0 ? (
        <div className="p-12 text-center bg-slate-900/40 rounded-xl border border-slate-800">
          <RefreshCw className="w-6 h-6 text-slate-500 mx-auto animate-spin" />
          <p className="text-sm text-slate-400 mt-3">Loading settings…</p>
        </div>
      ) : (
        /* Settings by Category */
        Object.entries(CATEGORY_META).map(([cat, meta]) => {
          const items = grouped[cat];
          if (!items?.length) return null;
          const Icon = meta.icon;
          const collapsed = collapsedCategories.has(cat);

          return (
            <div
              key={cat}
              className="bg-slate-900/60 rounded-xl border border-slate-800 overflow-hidden"
            >
              {/* Category Header */}
              <button
                onClick={() => toggleCategory(cat)}
                className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-800/40 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-5 h-5 ${meta.color}`} />
                  <span className="text-sm font-bold text-white">{meta.label}</span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {items.length} setting{items.length !== 1 && "s"}
                  </span>
                </div>
                {collapsed ? (
                  <ChevronRight className="w-4 h-4 text-slate-500" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-500" />
                )}
              </button>

              {/* Settings List */}
              {!collapsed && (
                <div className="divide-y divide-slate-800/80">
                  {items.map((item) => {
                    const isEditing = item.key in edits;
                    const displayValue = isEditing ? edits[item.key] : item.value;
                    const badge = SOURCE_BADGE[item.source];

                    return (
                      <div
                        key={item.key}
                        className={`px-6 py-4 flex items-center gap-4 transition-colors ${
                          isEditing ? "bg-indigo-950/20" : ""
                        }`}
                      >
                        {/* Label & Description */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-white font-mono">
                              {item.key}
                            </span>
                            {item.isSecret && (
                              <span className="text-[9px] px-1.5 py-0.5 bg-rose-950 text-rose-300 border border-rose-800 rounded font-mono">
                                SECRET
                              </span>
                            )}
                            <span
                              className={`text-[9px] px-1.5 py-0.5 border rounded font-mono ${badge?.className ?? "bg-slate-800 text-slate-400 border-slate-700"}`}
                            >
                              {badge?.label ?? "Unknown"}
                            </span>
                            {isEditing && (
                              <span className="text-[9px] px-1.5 py-0.5 bg-indigo-950 text-indigo-300 border border-indigo-800 rounded font-mono">
                                MODIFIED
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                            {item.description}
                          </p>
                        </div>

                        {/* Value / Input */}
                        <div className="flex items-center gap-2 shrink-0">
                          {item.isSecret && !revealedSecrets.has(item.key) ? (
                            // Secret: show masked + reveal toggle
                            <>
                              <span className="font-mono text-xs text-indigo-300 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800 min-w-40 text-center">
                                {displayValue}
                              </span>
                              <button
                                onClick={() => toggleSecretReveal(item.key)}
                                className="p-1.5 text-slate-500 hover:text-slate-300 transition-colors"
                                title="Reveal secret"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                            </>
                          ) : item.isSecret && revealedSecrets.has(item.key) ? (
                            // Secret revealed: show input
                            <>
                              <input
                                type="text"
                                value={displayValue}
                                onChange={(e) =>
                                  setEdits((prev) => ({ ...prev, [item.key]: e.target.value }))
                                }
                                className="font-mono text-xs text-indigo-300 bg-slate-950 px-3 py-1.5 rounded-lg border border-indigo-800 min-w-50 focus:outline-none focus:border-indigo-500"
                                placeholder="Enter API key…"
                              />
                              <button
                                onClick={() => toggleSecretReveal(item.key)}
                                className="p-1.5 text-slate-500 hover:text-slate-300 transition-colors"
                                title="Hide secret"
                              >
                                <EyeOff className="w-3.5 h-3.5" />
                              </button>
                            </>
                          ) : item.key === "SUPERVISOR_MODE" ? (
                            // Enum field: dropdown
                            <select
                              value={displayValue}
                              onChange={(e) =>
                                setEdits((prev) => ({ ...prev, [item.key]: e.target.value }))
                              }
                              className="font-mono text-xs text-indigo-300 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800 focus:outline-none focus:border-indigo-500 appearance-none cursor-pointer"
                            >
                              {["DISABLED", "DRY_RUN", "ASSISTED", "AUTO_RESPOND", "FULL_AUTO"].map(
                                (opt) => (
                                  <option key={opt} value={opt}>
                                    {opt}
                                  </option>
                                ),
                              )}
                            </select>
                          ) : item.key === "AI_PROVIDER_TYPE" ? (
                            <select
                              value={displayValue}
                              onChange={(e) =>
                                setEdits((prev) => ({ ...prev, [item.key]: e.target.value }))
                              }
                              className="font-mono text-xs text-indigo-300 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800 focus:outline-none focus:border-indigo-500 appearance-none cursor-pointer"
                            >
                              {["endpoint", "omniroute", "mock"].map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                          ) : item.key.endsWith("_ENABLED") || item.key.startsWith("ALLOW_") ? (
                            // Boolean toggle
                            <select
                              value={displayValue}
                              onChange={(e) =>
                                setEdits((prev) => ({ ...prev, [item.key]: e.target.value }))
                              }
                              className="font-mono text-xs text-indigo-300 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800 focus:outline-none focus:border-indigo-500 appearance-none cursor-pointer"
                            >
                              <option value="true">true</option>
                              <option value="false">false</option>
                            </select>
                          ) : (
                            // Default: text input
                            <input
                              type="text"
                              value={displayValue}
                              onChange={(e) =>
                                setEdits((prev) => ({ ...prev, [item.key]: e.target.value }))
                              }
                              className="font-mono text-xs text-indigo-300 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800 min-w-45 focus:outline-none focus:border-indigo-500"
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
