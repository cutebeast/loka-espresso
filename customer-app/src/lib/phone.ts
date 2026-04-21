export function normalizePhone(input: string): string {
  const digits = input.replace(/\D/g, '');
  if (digits.startsWith('600')) return '+60' + digits.slice(3);
  if (digits.startsWith('60')) return '+' + digits;
  if (digits.startsWith('01')) return '+6' + digits;
  if (digits.startsWith('1') && digits.length >= 9) return '+60' + digits;
  if (digits.startsWith('+60')) return digits;
  return '+60' + digits;
}
