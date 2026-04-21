export const LOKA = {
  primary: '#384B16',
  primaryDark: '#2A3910',
  primaryDeep: '#1F2C0B',
  primaryLight: '#4A6A1D',
  copper: '#D18E38',
  copperLight: '#E5A559',
  copperSoft: 'rgba(209,142,56,0.12)',
  cream: '#F3EEE5',
  brown: '#57280D',
  textPrimary: '#1B2023',
  textSecondary: '#3A4A5A',
  textMuted: '#6A7A8A',
  border: '#D4DCE5',
  borderSubtle: '#E4EAEF',
  surface: '#F5F7FA',
  bg: '#E4EAEF',
  white: '#FFFFFF',
  success: '#85B085',
  danger: '#DC2626',
} as const;

export function formatPrice(val: number | string): string {
  return `RM ${Number(val).toFixed(2)}`;
}

export function resolveAssetUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return `https://admin.loyaltysystem.uk${path}`;
}
