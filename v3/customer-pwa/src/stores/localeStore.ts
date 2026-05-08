/**
 * Module-level locale state — readable by non-React code like i18n.ts t().
 */

import { isValidLocale } from '@/lib/i18n-types';

const STORAGE_KEY = 'loka-locale';

let _currentLocale = 'en';

export function getLocale(): string {
  return _currentLocale;
}

export function readStoredLocale(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const v = parsed?.state?.locale ?? parsed?.locale ?? null;
    return typeof v === 'string' && isValidLocale(v) ? v : null;
  } catch { return null; }
}

export function writeStoredLocale(locale: string) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: { locale } })); } catch {}
}

export function detectBrowserLocale(): string {
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

export function applyLocaleToDOM(locale: string) {
  if (typeof document === 'undefined') return;
  try { document.documentElement.lang = locale; } catch {}
}

/** Called by the React provider to sync the module-level variable. */
export function setGlobalLocale(locale: string) {
  _currentLocale = locale;
  applyLocaleToDOM(locale);
  writeStoredLocale(locale);
}
