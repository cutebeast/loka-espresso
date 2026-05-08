/* ============================================
   Country Data — sourced from restcountries.com API
   ISO 3166-1 alpha-2 codes with E.164 dial codes
   ============================================ */

import countriesJson from '@/data/countries.json';

export interface Country {
  code: string;      // ISO 3166-1 alpha-2 (e.g., "MY")
  name: string;      // Common name (e.g., "Malaysia")
  dialCode: string;  // E.164 dial code (e.g., "+60")
}

/** All countries from restcountries.com */
export const COUNTRIES: Country[] = countriesJson as Country[];

/** Default country (Malaysia — home of Loka Espresso) */
export const DEFAULT_COUNTRY: Country =
  COUNTRIES.find((c) => c.code === 'MY') || COUNTRIES[0];

/** Compute a flag emoji from an ISO alpha-2 country code */
export function countryFlag(isoCode: string): string {
  return isoCode
    .toUpperCase()
    .replace(/./g, (c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65));
}

/** Flagpedia CDN URL for a country flag PNG */
export function flagUrl(isoCode: string, size: 'h20' | 'h24' | 'w40' | 'w80' = 'h24'): string {
  return `https://flagcdn.com/${size}/${isoCode.toLowerCase()}.png`;
}

/** Flagpedia CDN URL for the flag SVG */
export function flagSvgUrl(isoCode: string): string {
  return `https://flagcdn.com/${isoCode.toLowerCase()}.svg`;
}

/**
 * All countries alphabetically by name.
 * Malaysia placed first (default).
 */
export const ALL_COUNTRIES: Country[] = (() => {
  const my = COUNTRIES.find((c) => c.code === 'MY');
  const rest = COUNTRIES
    .filter((c) => c.code !== 'MY')
    .sort((a, b) => a.name.localeCompare(b.name));
  return my ? [my, ...rest] : rest;
})();

/** Quick-lookup by ISO code */
export function findCountry(code: string): Country | undefined {
  return COUNTRIES.find((c) => c.code.toUpperCase() === code.toUpperCase());
}

/** Search countries by name or dial code */
export function searchCountries(query: string, list: Country[] = ALL_COUNTRIES): Country[] {
  const q = query.toLowerCase().trim();
  if (!q) return list;
  return list.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      c.dialCode.replace(/\s/g, '').includes(q)
  );
}
