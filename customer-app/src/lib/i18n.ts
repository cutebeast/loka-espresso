/**
 * Lightweight i18n engine for LOKA Espresso PWA.
 *
 * Features:
 * - Nested key lookup: t('cart.empty.title')
 * - Interpolation:    t('hello_name', { name: 'Ali' })
 * - Pluralization:    t('item_count', { count: 3 }) → looks up item_count_one / item_count_other
 * - Fallback chain:   if key missing in active locale, falls back to English
 * - Code-splitting:   locale JSONs loaded via dynamic import()
 */

import { localeStore } from '@/stores/localeStore';

type Locale = 'en' | 'ms' | 'zh' | 'ta' | 'tr';

export const AVAILABLE_LOCALES: Locale[] = ['en', 'ms', 'zh', 'ta', 'tr'];
export const DEFAULT_LOCALE: Locale = 'en';

// In-memory cache for loaded locale dictionaries
const dictionaries: Record<string, Record<string, unknown>> = {};

/**
 * Load a locale dictionary dynamically.
 * Only the active locale is kept in memory; others are dropped on switch.
 */
export async function loadLocale(locale: Locale): Promise<void> {
  if (!AVAILABLE_LOCALES.includes(locale)) {
    console.warn(`[i18n] Unsupported locale "${locale}", falling back to ${DEFAULT_LOCALE}`);
    return;
  }
  if (dictionaries[locale]) return; // already loaded

  try {
    const module = await import(`@/locales/${locale}.json`);
    dictionaries[locale] = module.default ?? module;
  } catch (err) {
    console.error(`[i18n] Failed to load locale "${locale}":`, err);
    dictionaries[locale] = {};
  }
}

/** Get a nested value from a dictionary by dot-notation key. */
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
 * @param key       Dot-notation key, e.g. 'cart.empty.title'
 * @param options   Optional vars for interpolation, or { count } for pluralization
 * @returns         Translated string (falls back to English, then to the raw key)
 */
export function t(key: string, options?: Record<string, string | number>): string {
  const activeLocale = localeStore.getState().locale;
  const dict = dictionaries[activeLocale];
  const fallbackDict = dictionaries[DEFAULT_LOCALE];

  // Pluralization: if options.count is provided, try plural key first
  if (options && typeof options.count === 'number') {
    const pKey = pluralKey(key, options.count);
    const pluralValue = getNestedValue(dict, pKey) ?? getNestedValue(fallbackDict, pKey);
    if (pluralValue) return interpolate(pluralValue, options);
  }

  // Standard lookup
  const value = getNestedValue(dict, key) ?? getNestedValue(fallbackDict, key);
  if (value) {
    return options ? interpolate(value, options) : value;
  }

  // Key missing in both active and fallback — return the key itself as last resort
  if (process.env.NODE_ENV === 'development') {
    console.warn(`[i18n] Missing translation key: "${key}" (locale: ${activeLocale})`);
  }
  return key;
}

/** Check if a locale is supported. */
export function isValidLocale(locale: string): locale is Locale {
  return AVAILABLE_LOCALES.includes(locale as Locale);
}

/** Get list of supported locales. */
export function getSupportedLocales(): readonly Locale[] {
  return AVAILABLE_LOCALES;
}

/** Get default locale. */
export function getDefaultLocale(): Locale {
  return DEFAULT_LOCALE;
}

export type { Locale };
