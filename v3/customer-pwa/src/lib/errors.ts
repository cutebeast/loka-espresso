'use client';

/**
 * Localize backend API error details for the customer PWA.
 *
 * The backend returns human-readable English `detail` strings (e.g. "Choose
 * one voucher OR one reward per order"). For zh users we map the stable,
 * user-facing messages to localized copy; anything unmapped falls back to
 * the raw detail (never hides the error).
 */

type TFunc = (key: string, options?: Record<string, string | number>) => string;

const MAPPINGS: { test: (d: string) => boolean; key: string }[] = [
  { test: (d) => d.includes('one voucher OR one reward'), key: 'errors.oneRedemption' },
  { test: (d) => d.includes('already has a voucher applied') || d.includes('already has a reward applied'), key: 'errors.otherRedemption' },
  { test: (d) => d.includes('has expired') || d.includes('expired'), key: 'errors.expired' },
  { test: (d) => d.includes('insufficient'), key: 'errors.insufficient' },
  { test: (d) => d.includes('voucher not found') || d.includes('reward not found'), key: 'errors.notFound' },
  { test: (d) => d.includes('already been paid'), key: 'errors.alreadyPaid' },
  { test: (d) => d.includes('minimum order') || d.includes('minimum spend') || d.includes('min spend'), key: 'errors.minSpend' },
  { test: (d) => d.includes('otp') && (d.includes('invalid') || d.includes('expired')), key: 'errors.invalidOtp' },
  { test: (d) => d.includes('first order'), key: 'errors.firstOrderOnly' },
  { test: (d) => d.includes('tier'), key: 'errors.tierRequirement' },
  { test: (d) => d.includes('already used'), key: 'errors.alreadyUsed' },
];

export function localizeApiError(detail: unknown, t: TFunc): string {
  if (!detail || typeof detail !== 'string') return '';
  const d = detail.toLowerCase();
  for (const m of MAPPINGS) {
    if (m.test(d)) return t(m.key);
  }
  return detail;
}
