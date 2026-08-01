/**
 * Date helpers — always compute "today" in the device's LOCAL timezone.
 * `new Date().toISOString().split("T")[0]` returns the UTC date, which is
 * yesterday between 00:00 and 08:00 in Malaysia (UTC+8).
 */

/** Today's date as `YYYY-MM-DD` in the device's LOCAL timezone. */
export function localDateISO(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
