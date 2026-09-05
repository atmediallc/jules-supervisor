"use client";

import { useI18n } from "./provider";
import { Globe } from "lucide-react";

const LABELS: Record<string, string> = {
  en: "EN",
  es: "ES",
};

export default function LanguageSwitcher() {
  const { locale, setLocale } = useI18n();

  return (
    <div className="flex items-center gap-1">
      <Globe className="w-3.5 h-3.5 text-slate-500" />
      {(["en", "es"] as const).map((loc) => (
        <button
          key={loc}
          onClick={() => setLocale(loc)}
          className={`px-1.5 py-0.5 text-[10px] font-mono rounded transition-colors ${
            locale === loc
              ? "bg-jules-600 text-white shadow-[0_0_10px_-2px_rgba(59,130,246,0.7)]"
              : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
          }`}
        >
          {LABELS[loc]}
        </button>
      ))}
    </div>
  );
}
