'use client';

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import type { Locale } from '@/lib/i18n-types';
import { isValidLocale, getDefaultLocale } from '@/lib/i18n-types';
import { setGlobalLocale, getLocale, readStoredLocale, detectBrowserLocale } from '@/stores/localeStore';

function resolveInitial(): string {
  const moduleLocale = getLocale();
  if (moduleLocale !== 'en') return moduleLocale;
  return readStoredLocale() ?? detectBrowserLocale();
}

// ── Context ──
interface Ctx {
  locale: string;
  setLocale: (loc: string) => void;
}

const LocaleCtx = createContext<Ctx>({ locale: 'en', setLocale: () => {} });

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, set] = useState<string>(resolveInitial);

  useEffect(() => {
    if (getLocale() !== locale) {
      setGlobalLocale(locale);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setLocale = useCallback((next: string) => {
    if (!isValidLocale(next)) return;
    set(next);
    setGlobalLocale(next);
  }, []);

  return <LocaleCtx.Provider value={{ locale, setLocale }}>{children}</LocaleCtx.Provider>;
}

export function useLocaleCtx(): Ctx {
  return useContext(LocaleCtx);
}
