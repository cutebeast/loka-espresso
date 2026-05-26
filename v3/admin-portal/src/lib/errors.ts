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
  } catch { /* not JSON */ }
  return raw || fallback;
}
