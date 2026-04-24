/**
 * LOKA ESPRESSO — Single Source of Truth for Design Tokens
 * 
 * Import from here in every component. Do NOT define local LOKA objects.
 * For layout/spacing/radii/shadows, prefer Tailwind utilities from globals.css.
 * Use these tokens only for truly dynamic values (conditional colors, etc.).
 */

export const LOKA = {
  // Primary — Dark Olive
  primary: '#384B16',
  primaryDark: '#2A3910',
  primaryDeep: '#1F2C0B',
  primaryLight: '#4A6A1D',
  primary50: '#F5F7F0',
  primary100: '#E8EDE0',
  primary200: '#D1DBC1',
  primaryAlpha10: 'rgba(56, 75, 22, 0.10)',
  primaryAlpha12: 'rgba(56, 75, 22, 0.12)',
  primaryAlpha15: 'rgba(56, 75, 22, 0.15)',
  primaryAlpha20: 'rgba(56, 75, 22, 0.20)',
  primaryAlpha25: 'rgba(56, 75, 22, 0.25)',
  primaryAlpha35: 'rgba(56, 75, 22, 0.35)',

  // Accent — Copper
  copper: '#D18E38',
  copperLight: '#E5A559',
  copperSoft: 'rgba(209, 142, 56, 0.12)',
  copperMid: 'rgba(209, 142, 56, 0.25)',

  // Accent — Brown
  brown: '#57280D',
  brownLight: '#7A4A2E',

  // Cream
  cream: '#F3EEE5',

  // Text
  textPrimary: '#1B2023',
  textSecondary: '#3A4A5A',
  textMuted: '#6A7A8A',

  // Surfaces & Backgrounds
  white: '#FFFFFF',
  bg: '#E4EAEF',
  bgLight: '#F5F7FA',
  surface: '#F9FBFE',
  surfaceWarm: '#F5F7F0',

  // Borders
  border: '#C4CED8',
  borderLight: '#D4DCE5',
  borderSubtle: '#E4EAEF',

  // Semantic
  success: '#85B085',
  successLight: '#E8F5E9',
  warning: '#D18E38',
  warningLight: '#FFF3E0',
  danger: '#C75050',
  dangerLight: '#FFEBEE',
  info: '#4A607A',
  infoLight: '#E3F2FD',

  // Shadows (as CSS strings)
  shadowSm: '0 1px 2px rgba(0, 0, 0, 0.05)',
  shadowMd: '0 4px 6px rgba(0, 0, 0, 0.07)',
  shadowLg: '0 10px 15px rgba(0, 0, 0, 0.10)',
  shadowXl: '0 20px 25px rgba(0, 0, 0, 0.12)',
  shadowCard: '0 4px 12px rgba(0, 0, 0, 0.03)',
  shadowNav: '0 -4px 10px rgba(0, 0, 0, 0.02)',
  shadowPrimary: '0 8px 16px rgba(56, 75, 22, 0.25)',
  shadowPrimarySm: '0 2px 8px rgba(56, 75, 22, 0.12)',
  shadowWallet: '0 12px 24px -8px rgba(42, 57, 16, 0.35)',
} as const;

/** Format a number as Malaysian Ringgit */
export function formatPrice(val: number | string): string {
  return `RM ${Number(val).toFixed(2)}`;
}

/** Resolve an asset path to a full URL */
export function resolveAssetUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return `https://admin.loyaltysystem.uk${path}`;
}
