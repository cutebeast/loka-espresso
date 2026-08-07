"use client";

import { Globe } from "lucide-react";
import { useEffect, useState } from "react";

// EN + CN only at launch (2026-08-07); ms may return later, ta/tr dropped.
const LOCALES: Record<string, string> = {
  en: "English",
  zh: "中文",
};

function getStoredLocale(): string {
  if (typeof window === "undefined") return "en";
  const stored = localStorage.getItem("locale") || navigator.language?.split("-")[0] || "en";
  // Stale stored locales (ms/ta/tr from before the launch restriction) fall back to EN
  return stored in LOCALES ? stored : "en";
}

function storeLocale(locale: string) {
  if (typeof window !== "undefined") localStorage.setItem("locale", locale);
}

export function useLocale() {
  return getStoredLocale();
}

export default function LanguageSelector({ dark = false }: { dark?: boolean }) {
  // Controlled select synced AFTER mount — an uncontrolled `defaultValue`
  // select keeps the SSR value (en) after a locale-switch reload, so the
  // previous locale can't be re-selected (no change event fires).
  const [locale, setLocale] = useState("en");

  useEffect(() => {
    setLocale(getStoredLocale());
  }, []);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <Globe size={14} style={{ opacity: 0.5, color: dark ? "#fff" : undefined }} />
      <select
        className="form-input"
        value={locale}
        onChange={(e) => {
          storeLocale(e.target.value);
          window.location.reload();
        }}
        style={{
          padding: "4px 8px",
          fontSize: 12,
          width: "auto",
          background: dark ? "rgba(255,255,255,0.12)" : "transparent",
          color: dark ? "#fff" : undefined,
          border: dark ? "1px solid rgba(255,255,255,0.35)" : "1px solid var(--color-border-light)",
          borderRadius: 6,
        }}
      >
        {Object.entries(LOCALES).map(([code, label]) => (
          <option key={code} value={code} style={{ color: "#1a1a1a" }}>{label}</option>
        ))}
      </select>
    </div>
  );
}
