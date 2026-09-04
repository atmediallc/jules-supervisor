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
              ? "bg-indigo-600 text-white"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
          }`}
        >
          {LABELS[loc]}
        </button>
      ))}
    </div>
  );
}
