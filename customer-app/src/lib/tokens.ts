/**
 * LOKA ESPRESSO — Single Source of Truth for Design Tokens
 * Premium Turkish Coffee Brand Aesthetic
 * 
 * Import from here in every component. Do NOT define local LOKA objects.
 * For layout/spacing/radii/shadows, prefer CSS utilities from globals.css.
 * Use these tokens only for truly dynamic values (conditional colors, etc.).
 */

export const LOKA = {
  // Primary — Turkish Olive Grove
  primary: '#3B4A1A',
  primaryDark: '#263210',
  primaryDeep: '#1A2309',
  primaryLight: '#4E6E20',
  primary50: '#F5F7F0',
  primary100: '#E8EDE0',
  primary200: '#D1DBC1',
  primaryAlpha10: 'rgba(59, 74, 26, 0.10)',
  primaryAlpha12: 'rgba(59, 74, 26, 0.12)',
  primaryAlpha15: 'rgba(59, 74, 26, 0.15)',
  primaryAlpha20: 'rgba(59, 74, 26, 0.20)',
  primaryAlpha25: 'rgba(59, 74, 26, 0.25)',
  primaryAlpha35: 'rgba(59, 74, 26, 0.35)',

  // Accent — Turkish Gold
  gold: '#C9A84C',
  goldLight: '#D9C06A',
  goldSoft: 'rgba(201, 168, 76, 0.12)',
  goldMid: 'rgba(201, 168, 76, 0.25)',

  // Accent — Copper (backward compat)
  copper: '#C4893A',
  copperLight: '#D9A558',
  copperSoft: 'rgba(196, 137, 58, 0.12)',
  copperMid: 'rgba(196, 137, 58, 0.25)',

  // Accent — Turkish Coffee Brown
  brown: '#4A2210',
  brownLight: '#6A3A22',

  // Cream
  cream: '#F5F0E6',

  // Text — Warm Tones
  textPrimary: '#1E1B18',
  textSecondary: '#4A4038',
  textMuted: '#8A8078',

  // Surfaces & Backgrounds — Warm Parchment
  white: '#FFFFFF',
  bg: '#F2EEE6',
  bgLight: '#F8F5EF',
  surface: '#FFFDF8',
  surfaceWarm: '#F5F7F0',

  // Borders — Warm Cream
  border: '#D5CCBE',
  borderLight: '#E0D8CB',
  borderSubtle: '#EBE5DA',

  // Semantic — Warm Tints
  success: '#7AAA7A',
  successLight: '#E8F2E8',
  warning: '#C9A84C',
  warningLight: '#FDF5E6',
  danger: '#C75050',
  dangerLight: '#FFEBEE',
  info: '#5A707A',
  infoLight: '#E8EFF3',

  // Tier — Metallic Gradients
  tierBronze: '#A0783A',
  tierBronzeDark: '#7A5828',
  tierSilver: '#B0A9A0',
  tierSilverDark: '#8A8278',
  tierGold: '#D4AF37',
  tierGoldDark: '#B8942A',
  tierPlatinum: '#8A9AB0',
  tierPlatinumDark: '#5A6A80',

  // Shadows — Golden Tint
  shadowSm: '0 1px 3px rgba(74, 34, 16, 0.04)',
  shadowMd: '0 4px 6px rgba(74, 34, 16, 0.06)',
  shadowLg: '0 10px 15px rgba(74, 34, 16, 0.08)',
  shadowXl: '0 20px 25px rgba(74, 34, 16, 0.10)',
  shadowCard: '0 4px 12px rgba(74, 34, 16, 0.04)',
  shadowNav: '0 -4px 10px rgba(74, 34, 16, 0.03)',
  shadowPrimary: '0 8px 16px rgba(59, 74, 26, 0.20)',
  shadowPrimarySm: '0 2px 8px rgba(59, 74, 26, 0.10)',
  shadowWallet: '0 12px 24px -8px rgba(26, 35, 9, 0.35)',
} as const;

/** Format a number as Malaysian Ringgit */
export function formatPrice(val: number | string): string {
  return `RM ${Number(val).toFixed(2)}`;
}

const ADMIN_BASE = process.env.NEXT_PUBLIC_ADMIN_URL || 'https://admin.loyaltysystem.uk';
const APP_BASE = process.env.NEXT_PUBLIC_APP_URL || 'https://app.loyaltysystem.uk';

/** Resolve an asset path to a full URL using the admin base. */
export function resolveAssetUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const url = path.startsWith('http') ? path : `${ADMIN_BASE}${path}`;
  return url;
}

/** Resolve the app URL for deep links */
export function resolveAppUrl(path: string = ''): string {
  return `${APP_BASE}${path}`;
}
