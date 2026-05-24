"use client";

import { Globe } from "lucide-react";

const LOCALES: Record<string, string> = {
  en: "English",
  ms: "Bahasa Melayu",
  zh: "中文",
  ta: "தமிழ்",
  tr: "Türkçe",
};

function getStoredLocale(): string {
  if (typeof window === "undefined") return "en";
  return localStorage.getItem("locale") || navigator.language?.split("-")[0] || "en";
}

function storeLocale(locale: string) {
  if (typeof window !== "undefined") localStorage.setItem("locale", locale);
}

export function useLocale() {
  return getStoredLocale();
}

export default function LanguageSelector() {
  const locale = getStoredLocale();

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <Globe size={14} style={{ opacity: 0.5 }} />
      <select
        className="form-input"
        defaultValue={locale}
        onChange={(e) => {
          storeLocale(e.target.value);
          window.location.reload();
        }}
        style={{ padding: "4px 8px", fontSize: 12, width: "auto", background: "transparent", border: "1px solid var(--color-border-light)", borderRadius: 6 }}
      >
        {Object.entries(LOCALES).map(([code, label]) => (
          <option key={code} value={code}>{label}</option>
        ))}
      </select>
    </div>
  );
}
