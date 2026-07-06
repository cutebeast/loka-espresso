"use client";

import { useState, useEffect, useCallback } from "react";
import { STAFF_EN_TRANSLATIONS } from "@/lib/translations";

type Translations = Record<string, string>;

const CACHE_KEY = "staff_translations";
const CACHE_TTL = 24 * 60 * 60 * 1000;

function getStoredLocale(): string {
  if (typeof window === "undefined") return "en";
  return localStorage.getItem("locale") || "en";
}

async function fetchTranslations(locale: string): Promise<Translations> {
  // Check cache
  if (typeof window !== "undefined") {
    try {
      const cached = localStorage.getItem(`${CACHE_KEY}_${locale}`);
      const cachedAt = localStorage.getItem(`${CACHE_KEY}_${locale}_ts`);
      if (cached && cachedAt) {
        const age = Date.now() - Number(cachedAt);
        if (age < CACHE_TTL) return JSON.parse(cached);
      }
    } catch { /* expired */ }
  }

  // Fetch from API
  try {
    const res = await fetch(`/api/public/translations/ui?locale=${locale}&namespace=staff-ui`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const translations = json.data || json;

    // Cache
    if (typeof window !== "undefined" && Object.keys(translations).length > 0) {
      try {
        localStorage.setItem(`${CACHE_KEY}_${locale}`, JSON.stringify(translations));
        localStorage.setItem(`${CACHE_KEY}_${locale}_ts`, String(Date.now()));
      } catch { /* storage full */ }
    }

    return translations;
  } catch {
    return {};
  }
}

export function useTranslation() {
  const [locale, setLocale] = useState("en");
  const [translations, setTranslations] = useState<Translations>(STAFF_EN_TRANSLATIONS);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => { setHydrated(true); }, []);
  useEffect(() => {
    setLocale(getStoredLocale());
  }, []);

  useEffect(() => {
    if (!locale) return;
    let cancelled = false;
    fetchTranslations(locale).then((t) => {
      if (!cancelled) setTranslations({ ...STAFF_EN_TRANSLATIONS, ...t });
    });
    return () => { cancelled = true; };
  }, [locale]);

  const t = useCallback((key: string, vars?: Record<string, string | number>): string => {
    if (!hydrated) return key;
    let text = translations[key] || key;
    if (vars) {
      Object.entries(vars).forEach(([k, v]) => {
        text = text.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
      });
    }
    return text;
  }, [translations, hydrated]);

  return { t, locale, setLocale };
}
