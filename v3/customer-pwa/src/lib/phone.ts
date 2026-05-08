/**
 * Phone number normalization.
 * Given a local number and a country dial code (e.g. "+60"),
 * returns a clean E.164 formatted string.
 *
 * If the user already typed a full international number
 * (starts with "+"), we return it as-is after cleaning.
 */

/**
 * Normalize a phone number to E.164 format.
 *
 * @param input  - Raw user input (may include spaces, country prefix, etc.)
 * @param dialCode - Country dial code (e.g. "+60"). Defaults to "+60" (Malaysia).
 */
export function normalizePhone(input: string, dialCode = '+60'): string {
  let digits = input.replace(/\D/g, '');

  // If the input already starts with a known international dial code,
  // respect it as-is (user typed a full international number).
  if (input.trim().startsWith('+')) {
    return '+' + digits;
  }

  // Strip the dial code prefix if the user typed it
  const dialDigits = dialCode.replace(/\D/g, '');
  if (digits.startsWith(dialDigits) && digits.length > dialDigits.length) {
    digits = digits.slice(dialDigits.length);
  }

  // Strip leading zero (common local convention) if it would double-count
  if (digits.startsWith('0') && dialDigits !== '0') {
    digits = digits.slice(1);
  }

  // Trim whitespace
  digits = digits.trim();

  return dialCode + digits;
}

/**
 * Format a local number for display with the given dial code.
 * Handles Malaysian format (+60 XX XXX XXXX) and generic formats.
 */
export function formatPhoneForDisplay(raw: string, dialCode = '+60'): string {
  let digits = raw.replace(/\D/g, '');

  // Strip dial code prefix
  const dialDigits = dialCode.replace(/\D/g, '');
  if (digits.startsWith(dialDigits) && digits.length > dialDigits.length) {
    digits = digits.slice(dialDigits.length);
  }

  // Strip leading zero
  if (digits.startsWith('0') && dialDigits !== '0') {
    digits = digits.slice(1);
  }

  digits = digits.slice(0, 10);

  // Malaysian / standard 10-digit format
  if (dialCode === '+60' && digits.length >= 7) {
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)} ${digits.slice(3)}`;
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  }

  // Generic international format
  if (digits.length <= 4) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)} ${digits.slice(3)}`;
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
}

/**
 * Formats a full E.164 number for display (e.g. "+60123456789" → "+60 12-345 6789")
 */
export function displayE164(phone: string): string {
  const digits = phone.replace(/\D/g, '');

  // Try to match known country codes
  const sorted = [...new Set(['+60', '+65', '+62', '+66', '+63', '+84', '+1', '+44', '+61', '+81', '+82', '+86', '+91', '+971', '+966'])];

  for (const code of sorted) {
    const cd = code.replace(/\D/g, '');
    if (digits.startsWith(cd) && digits.length > cd.length) {
      const local = digits.slice(cd.length).slice(0, 10);
      if (local.length <= 3) return `${code} ${local}`;
      if (local.length <= 6) return `${code} ${local.slice(0, 3)}-${local.slice(3)}`;
      return `${code} ${local.slice(0, 3)}-${local.slice(3, 6)} ${local.slice(6)}`;
    }
  }

  // Fallback generic
  if (digits.length <= 3) return '+' + digits;
  const rest = digits.slice(2);
  return `+${digits.slice(0, 2)} ${rest.slice(0, 3)} ${rest.slice(3)}`;
}
