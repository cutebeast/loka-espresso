"use client";

/**
 * Base URL of the customer PWA, derived from the current staff-portal origin
 * by swapping the `staff.` subdomain for `app.`.
 *
 * Domain-agnostic by construction — works on the dev server
 * (staff.loyaltysystem.uk → app.loyaltysystem.uk) and after domain migration
 * (staff.lokaespresso.com → app.lokaespresso.com). Never hardcode a domain
 * here; the migration checklist relies on this derivation.
 *
 * Returns "" during SSR (no window) — callers run client-side.
 */
export function pwaBaseUrl(): string {
  if (typeof window === "undefined") return "";
  return window.location.origin.replace("://staff.", "://app.");
}
