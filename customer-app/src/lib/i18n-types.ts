/**
 * i18n type definitions and pure helper functions.
 *
 * Split into its own file to break the circular dependency between
 * i18n.ts (which imports localeStore) and localeStore.ts (which imports
 * isValidLocale / getDefaultLocale / Locale from i18n.ts).
 */

export type Locale = 'en' | 'ms' | 'zh' | 'ta' | 'tr';

export const AVAILABLE_LOCALES: Locale[] = ['en', 'ms', 'zh', 'ta', 'tr'];
export const DEFAULT_LOCALE: Locale = 'en';

export function isValidLocale(locale: string): locale is Locale {
  return AVAILABLE_LOCALES.includes(locale as Locale);
}

export function getDefaultLocale(): Locale {
  return DEFAULT_LOCALE;
}

export function getSupportedLocales(): readonly Locale[] {
  return AVAILABLE_LOCALES;
}
