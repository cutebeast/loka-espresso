/**
 * Referral code capture (?ref=CODE share links).
 *
 * The code is persisted in localStorage on landing and attached to the
 * /auth/register payload when a new customer completes profile setup.
 * It is cleared only after a successful registration.
 */

const REFERRAL_CODE_KEY = 'loka_referral_code';

export function storeReferralCode(code: string): void {
  if (typeof window === 'undefined') return;
  const cleaned = code.trim().toUpperCase();
  if (!cleaned || cleaned.length > 20) return;
  try {
    localStorage.setItem(REFERRAL_CODE_KEY, cleaned);
  } catch { /* storage unavailable */ }
}

export function getStoredReferralCode(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(REFERRAL_CODE_KEY);
  } catch {
    return null;
  }
}

export function clearStoredReferralCode(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(REFERRAL_CODE_KEY);
  } catch { /* storage unavailable */ }
}
