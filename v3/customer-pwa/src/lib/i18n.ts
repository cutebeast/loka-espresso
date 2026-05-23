/**
 * Lightweight i18n engine for LOKA Espresso PWA.
 *
 * Features:
 * - Nested key lookup: t('cart.empty.title')
 * - Interpolation:    t('hello_name', { name: 'Ali' })
 * - Pluralization:    t('item_count', { count: 3 }) → looks up item_count_one / item_count_other
 * - Fallback chain:   if key missing in active locale, falls back to English
 * - Dynamic loading:  fetches translations from the backend on startup;
 *                     falls back to bundled en.json when offline.
 */

import { getLocale, setGlobalLocale } from '@/stores/localeStore';
import enDict from '@/locales/en.json';
import type { Locale } from '@/lib/i18n-types';
import { AVAILABLE_LOCALES, DEFAULT_LOCALE, isValidLocale, getDefaultLocale, getSupportedLocales } from '@/lib/i18n-types';
import { API_BASE } from '@/lib/api';

// Re-export for backward compatibility with existing imports
export type { Locale };
export { AVAILABLE_LOCALES, DEFAULT_LOCALE, isValidLocale, getDefaultLocale, getSupportedLocales };

// ── Dynamic locale loaders (non-en locales loaded on demand via code splitting) ──
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const localeLoaders: Record<string, () => Promise<{ default: Record<string, any> }>> = {
  ms: () => import('@/locales/ms.json'),
  zh: () => import('@/locales/zh.json'),
  ta: () => import('@/locales/ta.json'),
  tr: () => import('@/locales/tr.json'),
};

// ── Mutable static dictionaries — en always bundled, others loaded dynamically ──
const staticDictionaries: Record<string, Record<string, unknown>> = {
  en: enDict as Record<string, unknown>,
};

const staticLoaded = new Set<string>(['en']);

// ── React re-render subscription (notifies useTranslation when a locale loads) ──
const subscribers = new Set<() => void>();

function notifySubscribers() {
  subscribers.forEach(fn => fn());
}

export function subscribeI18n(fn: () => void): () => void {
  subscribers.add(fn);
  return () => { subscribers.delete(fn); };
}

// ── Dynamic overlay (populated from backend API at runtime) ──
const dynamicOverlays: Record<string, Record<string, string>> = {};

// Cache: locale -> { data, timestamp }
const dynamicCache: Record<string, { data: Record<string, string>; ts: number }> = {};
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const LS_CACHE_KEY = 'loka_i18n_cache';

// Load cache from localStorage on module init (SSR-safe)
if (typeof window !== 'undefined') {
  try {
    const raw = localStorage.getItem(LS_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      for (const [locale, entry] of Object.entries(parsed)) {
        const e = entry as { data: Record<string, string>; ts: number };
        if (Date.now() - e.ts < CACHE_TTL_MS) {
          dynamicCache[locale] = e;
          dynamicOverlays[locale] = e.data;
        }
      }
    }
  } catch (e) { console.error(e); }
}

/** Fetch dynamic translations from the backend for a given locale. */
export async function fetchDynamicTranslations(locale: string): Promise<boolean> {
  if (locale === 'en') {
    // English is the source of truth — no dynamic fetch needed
    return true;
  }
  try {
    const res = await fetch(`${API_BASE}/public/translations/ui?locale=${locale}&namespace=pwa-ui`);
    if (!res.ok) return false;
    const json = await res.json();
    const data: Record<string, string> = json.data || {};
    if (Object.keys(data).length === 0) return false;

    dynamicOverlays[locale] = data;
    dynamicCache[locale] = { data, ts: Date.now() };

    // Persist to localStorage (SSR-safe)
    if (typeof window !== 'undefined') {
      try {
        const toStore: Record<string, { data: Record<string, string>; ts: number }> = {};
        for (const [loc, entry] of Object.entries(dynamicCache)) {
          toStore[loc] = entry;
        }
        localStorage.setItem(LS_CACHE_KEY, JSON.stringify(toStore));
      } catch (e) { console.error(e); }
    }

    return true;
  } catch (e) {
    console.error(e);
    return false;
  }
}

/** Fetch translations and update the locale atomically. */
export async function switchLocale(locale: Locale): Promise<void> {
  setGlobalLocale(locale);
  if (locale !== 'en') {
    await Promise.all([
      fetchDynamicTranslations(locale),
      loadStaticLocale(locale),
    ]);
  }
}

/**
 * Load dynamic translations on app startup.
 * Call this once from AppShell or layout after auth is established.
 */
export async function initTranslations(): Promise<void> {
  const locale = getLocale() as Locale;
  if (locale !== 'en') {
    await Promise.all([
      fetchDynamicTranslations(locale),
      loadStaticLocale(locale),
    ]);
  }
}

// No-op for backwards compatibility with code that calls loadLocale
export async function loadLocale(_locale: Locale): Promise<void> {
  // Dictionaries are loaded via loadStaticLocale; dynamic overlay handles non-en
}

export async function loadStaticLocale(locale: string): Promise<void> {
  if (locale === 'en' || staticLoaded.has(locale)) return;
  const loader = localeLoaders[locale];
  if (!loader) return;
  try {
    const mod = await loader();
    staticDictionaries[locale] = mod.default as Record<string, unknown>;
    staticLoaded.add(locale);
    notifySubscribers();
  } catch (e) {
    console.error(`[i18n] Failed to load static locale "${locale}":`, e);
  }
}

/** Get a nested value from a flat key -> value map by dot-notation key. */
function getNestedValue(dict: Record<string, unknown> | undefined, key: string): string | undefined {
  if (!dict) return undefined;
  const parts = key.split('.');
  let current: unknown = dict;
  for (const part of parts) {
    if (current && typeof current === 'object' && !Array.isArray(current)) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return typeof current === 'string' ? current : undefined;
}

/** Look up a key in the flat dynamic overlay (dot-notation keys). */
function getFromOverlay(locale: string, key: string): string | undefined {
  const overlay = dynamicOverlays[locale];
  if (!overlay) return undefined;
  return overlay[key];
}

/** Simple plural rule: _one for count === 1, _other for everything else. */
function pluralKey(baseKey: string, count: number): string {
  const suffix = count === 1 ? '_one' : '_other';
  return `${baseKey}${suffix}`;
}

/** Replace {varName} placeholders in a string with values from the vars object. */
function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_match, name) => {
    const value = vars[name];
    return value !== undefined ? String(value) : `{${name}}`;
  });
}

/**
 * Translate a key.
 *
 * Lookup order:
 *   1. Dynamic overlay (backend DB) for active locale
 *   2. Static dictionary for active locale
 *   3. Static dictionary for English (fallback)
 *   4. Raw key string (last resort)
 *
 * @param key       Dot-notation key, e.g. 'cart.empty.title'
 * @param options   Optional vars for interpolation, or { count } for pluralization
 * @returns         Translated string
 */
export function t(key: string, options?: Record<string, string | number>): string {
  const activeLocale = getLocale() as Locale;
  const staticDict = staticDictionaries[activeLocale];
  const fallbackDict = staticDictionaries[DEFAULT_LOCALE];

  // Helper: try all sources in priority order
  const lookup = (k: string): string | undefined => {
    // 1. Dynamic overlay (DB translations)
    if (activeLocale !== 'en') {
      const overlayVal = getFromOverlay(activeLocale, k);
      if (overlayVal) return overlayVal;
    }
    // 2. Static dictionary for active locale
    const staticVal = getNestedValue(staticDict, k);
    if (staticVal) return staticVal;
    // 3. English fallback
    return getNestedValue(fallbackDict, k);
  };

  // Pluralization
  if (options && typeof options.count === 'number') {
    const pKey = pluralKey(key, options.count);
    const pluralValue = lookup(pKey);
    if (pluralValue) return interpolate(pluralValue, options);
  }

  // Standard lookup
  const value = lookup(key);
  if (value) {
    return options ? interpolate(value, options) : value;
  }

  // Key missing everywhere — return the key itself as last resort
  if (process.env.NODE_ENV === 'development') {
    console.warn(`[i18n] Missing translation key: "${key}" (locale: ${activeLocale})`);
  }
  return key;
}
