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
  } catch { /* response is not JSON, fall through to text handling */ }
  return raw || fallback;
}

export function isNotFoundError(err: unknown): boolean {
  const e = err as any;
  if (e?.response?.status === 404) return true;
  if (e?.status === 404) return true;
  if (err instanceof Error) {
    const m = err.message.toLowerCase();
    return m.includes("404") || m.includes("not found");
  }
  return false;
}
