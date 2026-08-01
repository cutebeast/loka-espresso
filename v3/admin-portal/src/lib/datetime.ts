/**
 * Helpers for converting between API ISO datetimes (UTC) and
 * `datetime-local` input values (naive, browser-local wall-clock).
 *
 * The backend stores timestamptz and returns UTC ISO strings. Naive
 * `datetime-local` values must be interpreted as browser-local time on
 * save, and UTC ISO strings must be shifted to browser-local time on load.
 */

/**
 * Convert an API ISO datetime to `YYYY-MM-DDTHH:MM` in the browser's
 * LOCAL timezone (suitable for a `datetime-local` input value).
 * Returns "" for null/undefined/invalid input.
 */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Convert a `datetime-local` input value (naive local time) to a UTC ISO
 * string. Returns null for empty/invalid input. If the value already
 * carries a timezone (ends with Z or ±hh:mm), it is returned unchanged.
 */
export function localInputToISO(value: string): string | null {
  if (!value) return null;
  if (/([zZ]|[+-]\d{2}:\d{2})$/.test(value)) return value;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

/**
 * Format an API ISO datetime for display in the browser's LOCAL timezone:
 * `YYYY-MM-DD HH:MM`. Returns "—" for null/undefined/invalid input.
 * Use instead of `iso.slice(0, 16)` (which displays UTC wall-clock).
 */
export function formatLocalDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
