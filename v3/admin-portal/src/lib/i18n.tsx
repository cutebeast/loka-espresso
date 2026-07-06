"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { BASE_URL } from "@/lib/api";

const STORAGE_KEY = "admin-locale";
const SUPPORTED_LOCALES = ["en", "ms", "zh", "ta", "tr"];
const DEFAULT_LOCALE = "en";
const NAMESPACE = "admin-ui";

type Translations = Record<string, string>;

interface I18nContextValue {
  locale: string;
  setLocale: (locale: string) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  loading: boolean;
}

const I18nContext = createContext<I18nContextValue>({
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
  t: (key: string) => key,
  loading: false,
});

function parseLocale(raw: string | null): string {
  const safe = raw || DEFAULT_LOCALE;
  const base = (safe.split("-")[0] || DEFAULT_LOCALE).toLowerCase();
  return SUPPORTED_LOCALES.includes(base) ? base : DEFAULT_LOCALE;
}

function interpolate(text: string, vars?: Record<string, string | number>): string {
  if (!vars) return text;
  return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String(vars[name] ?? `{{${name}}}`));
}

export function TranslationProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<string>(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    const nav = typeof window !== "undefined" ? navigator.language : null;
    return parseLocale(stored || nav);
  });
  const [translations, setTranslations] = useState<Translations>({});
  const [loading, setLoading] = useState(false);

  const loadTranslations = useCallback(async (targetLocale: string) => {
    setLoading(true);
    try {
      const cacheKey = `${NAMESPACE}-${targetLocale}`;
      if (typeof window !== "undefined") {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          try {
            setTranslations(JSON.parse(cached));
          } catch {
            // ignore corrupt cache
          }
        }
      }
      const res = await fetch(
        `${BASE_URL}/public/translations/ui?namespace=${NAMESPACE}&locale=${targetLocale}`,
        { credentials: "include" }
      );
      const json = await res.json();
      const data = (json && typeof json === "object" && "data" in json ? json.data : json) as Translations;
      if (data && typeof data === "object") {
        setTranslations(data);
        if (typeof window !== "undefined") {
          localStorage.setItem(cacheKey, JSON.stringify(data));
        }
      }
    } catch (e) {
      console.error("[TranslationProvider] failed to load translations:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (locale) loadTranslations(locale);
  }, [locale, loadTranslations]);

  const setLocale = useCallback((next: string) => {
    const normalized = parseLocale(next);
    setLocaleState(normalized);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, normalized);
    }
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const text = translations[key] ?? key;
      return interpolate(text, vars);
    },
    [translations]
  );

  return (
    <I18nContext.Provider value={{ locale, setLocale, t, loading }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useTranslation(): I18nContextValue {
  return useContext(I18nContext);
}

export { SUPPORTED_LOCALES, DEFAULT_LOCALE, STORAGE_KEY };
