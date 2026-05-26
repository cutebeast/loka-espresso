/** Parse API error response into a user-friendly message. */
export function parseApiError(err: unknown, fallback = "Something went wrong"): string {
  if (!(err instanceof Error)) return fallback;
  const raw = err.message;
  try {
    const parsed = JSON.parse(raw);
    if (parsed.detail) {
      if (typeof parsed.detail === "string") return parsed.detail;
      if (Array.isArray(parsed.detail)) {
        return parsed.detail.map((e: { msg?: string }) => e.msg || "").filter(Boolean).join("; ") || fallback;
      }
    }
    if (parsed.message) return parsed.message;
    if (parsed.errors) return String(parsed.errors);
  } catch {
    // not JSON — use raw message
  }
  return raw || fallback;
}
