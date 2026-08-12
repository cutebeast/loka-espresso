"use client";

/**
 * Base URL of the customer PWA, derived from the current origin.
 *
 * Domain-agnostic by construction — works on the dev server
 * (localhost:13820 → localhost:13810) and after domain migration
 * (staff.lokaespresso.com / pos-disp.lokaespresso.com → app.lokaespresso.com).
 * Never hardcode a domain here.
 *
 * Returns "" during SSR (no window) — callers run client-side.
 */
export function pwaBaseUrl(): string {
  if (typeof window === "undefined") return "";
  const origin = window.location.origin;

  // Dev: map known portal ports to the PWA port (13810)
  if (origin.includes("://localhost") || origin.includes("://127.0.0.1")) {
    return origin.replace(/:13[0-9]+/, ":13810");
  }

  // Live: subdomain mapping
  return origin
    .replace("://staff.", "://app.")
    .replace("://pos-disp.", "://app.");
}
