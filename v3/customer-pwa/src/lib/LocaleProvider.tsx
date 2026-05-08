'use client';

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { Locale } from '@/lib/i18n-types';
import { isValidLocale, getDefaultLocale } from '@/lib/i18n-types';

const STORAGE_KEY = 'loka-locale';

function readStoredLocale(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const v = parsed?.state?.locale ?? parsed?.locale ?? null;
    return typeof v === 'string' && isValidLocale(v) ? v : null;
  } catch { return null; }
}

function writeStoredLocale(locale: string) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: { locale } })); } catch {}
}

function detectBrowser(): Locale {
  if (typeof window === 'undefined') return 'en';
  try {
    const lang = navigator.language?.toLowerCase() ?? '';
    if (lang.startsWith('ms') || lang.startsWith('id')) return 'ms';
    if (lang.startsWith('zh')) return 'zh';
    if (lang.startsWith('ta')) return 'ta';
    if (lang.startsWith('tr')) return 'tr';
  } catch {}
  return 'en';
}

function resolveInitial(): string {
  return readStoredLocale() ?? detectBrowser();
}

// ── Context ──
interface Ctx {
  locale: string;
  setLocale: (loc: string) => void;
}

const LocaleCtx = createContext<Ctx>({ locale: 'en', setLocale: () => {} });

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, set] = useState<string>(resolveInitial);

  const setLocale = useCallback((next: string) => {
    if (!isValidLocale(next)) return;
    set(next);
    writeStoredLocale(next);
    if (typeof document !== 'undefined') document.documentElement.lang = next;
  }, []);

  return <LocaleCtx.Provider value={{ locale, setLocale }}>{children}</LocaleCtx.Provider>;
}

export function useLocaleCtx(): Ctx {
  return useContext(LocaleCtx);
}
