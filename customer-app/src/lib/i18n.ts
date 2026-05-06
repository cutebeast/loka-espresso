/**
 * Lightweight i18n engine for LOKA Espresso PWA.
 *
 * Features:
 * - Nested key lookup: t('cart.empty.title')
 * - Interpolation:    t('hello_name', { name: 'Ali' })
 * - Pluralization:    t('item_count', { count: 3 }) → looks up item_count_one / item_count_other
 * - Fallback chain:   if key missing in active locale, falls back to English
 */

import { getLocale } from '@/stores/localeStore';
import enDict from '@/locales/en.json';
import msDict from '@/locales/ms.json';
import zhDict from '@/locales/zh.json';
import taDict from '@/locales/ta.json';
import trDict from '@/locales/tr.json';
import type { Locale } from '@/lib/i18n-types';
import { AVAILABLE_LOCALES, DEFAULT_LOCALE, isValidLocale, getDefaultLocale, getSupportedLocales } from '@/lib/i18n-types';

// Re-export for backward compatibility with existing imports
export type { Locale };
export { AVAILABLE_LOCALES, DEFAULT_LOCALE, isValidLocale, getDefaultLocale, getSupportedLocales };

// Statically import all dictionaries — available immediately, no async loading
const dictionaries: Record<Locale, Record<string, unknown>> = {
  en: enDict as Record<string, unknown>,
  ms: msDict as Record<string, unknown>,
  zh: zhDict as Record<string, unknown>,
  ta: taDict as Record<string, unknown>,
  tr: trDict as Record<string, unknown>,
};

// No-op for backwards compatibility with code that calls loadLocale
export async function loadLocale(_locale: Locale): Promise<void> {
  // Dictionaries are already loaded statically
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
  const activeLocale = getLocale() as Locale;
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
