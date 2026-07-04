/**
 * Minimal cookie helpers for staff auth.
 * The auth token is duplicated in a cookie so middleware can enforce
 * server-side route protection; localStorage remains the primary runtime store.
 */

const AUTH_COOKIE_NAME = "staff_token";

export function setAuthCookie(token: string): void {
  if (typeof document === "undefined") return;
  const maxAge = 60 * 60 * 24; // 24 hours
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
}

export function clearAuthCookie(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${AUTH_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax`;
}

export function getAuthCookieValue(cookieHeader?: string | null): string | null {
  const raw = cookieHeader ?? (typeof document !== "undefined" ? document.cookie : "");
  if (!raw) return null;
  const match = raw.split(";").find((c) => c.trim().startsWith(`${AUTH_COOKIE_NAME}=`));
  if (!match) return null;
  const value = match.split("=")[1];
  if (!value) return null;
  return decodeURIComponent(value);
}

export function isTokenExpired(token: string): boolean {
  try {
    const payload = token.split(".")[1];
    if (!payload) return true;
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(atob(base64));
    const exp = json.exp ? json.exp * 1000 : 0;
    return exp ? Date.now() >= exp : false;
  } catch {
    return true;
  }
}
