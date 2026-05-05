/**
 * Locale store — manages active language for the i18n system.
 *
 * Features:
 * - Persisted to localStorage (survives reloads)
 * - Syncs with <html lang="..."> attribute
 * - Loads locale dictionary on change
 * - Exposed outside React for API interceptors
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { loadLocale, isValidLocale, getDefaultLocale, type Locale } from '@/lib/i18n';

interface LocaleState {
  locale: Locale;
  dir: 'ltr';
  setLocale: (locale: Locale) => void;
}

function detectBrowserLocale(): Locale {
  if (typeof window === 'undefined') return getDefaultLocale();
  const browserLang = navigator.language?.toLowerCase() ?? '';
  if (browserLang.startsWith('ms') || browserLang.startsWith('id')) return 'ms';
  if (browserLang.startsWith('zh')) return 'zh';
  if (browserLang.startsWith('ta')) return 'ta';
  if (browserLang.startsWith('tr')) return 'tr';
  return getDefaultLocale();
}

function applyLocaleToDOM(locale: Locale) {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = locale;
  // All supported locales are LTR (en, ms, zh, ta, tr)
  document.documentElement.dir = 'ltr';
}

export const localeStore = create<LocaleState>()(
  persist(
    (set) => ({
      locale: getDefaultLocale(),
      dir: 'ltr',
      setLocale: (locale: Locale) => {
        set({ locale });
        applyLocaleToDOM(locale);
        loadLocale(locale).catch(() => {});
      },
    }),
    {
      name: 'loka-locale',
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        if (state) {
          const valid = isValidLocale(state.locale) ? state.locale : getDefaultLocale();
          state.locale = valid;
          applyLocaleToDOM(valid);
          loadLocale(valid).catch(() => {});
        }
      },
    }
  )
);

// On module init (client-side), detect browser language if no persisted preference exists
if (typeof window !== 'undefined') {
  const persisted = localStorage.getItem('loka-locale');
  if (!persisted) {
    const detected = detectBrowserLocale();
    localeStore.getState().setLocale(detected);
  }
}
