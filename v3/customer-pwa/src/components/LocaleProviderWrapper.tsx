'use client';

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { isValidLocale } from '@/lib/i18n-types';
import { readStoredLocale, detectBrowserLocale, setGlobalLocale } from '@/stores/localeStore';

interface LocaleCtx {
  locale: string;
  setLocaleAction: (loc: string) => void;
}

const Ctx = createContext<LocaleCtx>({ locale: 'en', setLocaleAction: () => {} });

export function LocaleProviderWrapper({ children }: { children: ReactNode }) {
  // ── SSR-safe: always start 'en' to match server HTML ──
  const [locale, setReactLocale] = useState<string>('en');
  const [ready, setReady] = useState(false);

  // ── After mount, apply persisted/browser locale ──
  useEffect(() => {
    const stored = readStoredLocale();
    const resolved = stored ?? detectBrowserLocale();
    setGlobalLocale(resolved);
    if (resolved !== 'en') {
      setReactLocale(resolved);
    }
    setReady(true);
  }, []);

  // ── User-triggered locale change ──
  const setLocaleAction = useCallback((next: string) => {
    if (!isValidLocale(next)) return;
    setGlobalLocale(next);
    setReactLocale(next);
  }, []);

  return <Ctx.Provider value={{ locale, setLocaleAction }}>{children}</Ctx.Provider>;
}

export function useLocaleCtx() {
  return useContext(Ctx);
}
