"use client";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import { BrandProvider, useBrand } from "@/components/BrandProvider";
import { STORAGE_KEYS, ROUTES } from "@/lib/constants";
import { setAuthCookieManual } from "@/lib/api";

function isAdminLoggedIn(): boolean {
  if (typeof window === "undefined") return false;
  return !!localStorage.getItem(STORAGE_KEYS.TOKEN);
}

function parseJwtExp(token: string): number | null {
  try {
    const parts = token.split(".");
    const payload = parts[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(atob(base64));
    return json.exp ? json.exp * 1000 : null;
  } catch (e) { console.error("Failed to parse JWT:", e); return null; }
}

async function refreshToken(): Promise<boolean> {
  try {
    if (typeof window === "undefined") return false;
    const refresh = localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
    if (!refresh) return false;
    const res = await fetch("/api/admin/auth/refresh", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refresh }),
    });
    if (!res.ok) return false;
    const json = await res.json();
    const data = json.data || json;
    if (data.tokens?.access_token) {
      localStorage.setItem(STORAGE_KEYS.TOKEN, data.tokens.access_token);
      if (data.tokens.refresh_token) localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, data.tokens.refresh_token);
      setAuthCookieManual();
      return true;
    }
    return false;
  } catch (e) { console.error("Token refresh failed:", e); return false; }
}

function clearSession() {
  localStorage.removeItem(STORAGE_KEYS.TOKEN);
  localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
  localStorage.removeItem(STORAGE_KEYS.ADMIN_EMAIL);
  document.cookie = `${STORAGE_KEYS.AUTH_COOKIE}=; Path=/; SameSite=Strict; Max-Age=0`;
}

function LayoutInner({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const isLogin = pathname === ROUTES.LOGIN;
  const [checked, setChecked] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const { faviconUrl } = useBrand();

  useEffect(() => {
    if (!faviconUrl) return;
    let created: HTMLLinkElement | null = null;
    const link = document.querySelector("link[rel='icon']") as HTMLLinkElement | null;
    if (link) {
      link.type = "image/svg+xml";
      link.href = faviconUrl;
    } else {
      const el = document.createElement("link");
      el.rel = "icon";
      el.type = "image/svg+xml";
      el.href = faviconUrl;
      document.head.appendChild(el);
      created = el;
    }
    return () => {
      if (created) {
        created.remove();
      }
    };
  }, [faviconUrl]);

  // ── Idle timeout (30 min) ──
  useEffect(() => {
    if (isLogin) return;
    const IDLE_MS = 30 * 60 * 1000;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;

    const logoutIdle = () => {
      clearSession();
      router.replace(ROUTES.LOGIN);
    };

    const resetIdleTimer = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(logoutIdle, IDLE_MS);
    };

    const events = ["mousemove", "keydown", "click", "touchstart"];
    events.forEach((e) => window.addEventListener(e, resetIdleTimer, { passive: true }));
    resetIdleTimer();

    return () => {
      events.forEach((e) => window.removeEventListener(e, resetIdleTimer));
      if (idleTimer) clearTimeout(idleTimer);
    };
  }, [isLogin, router]);

  useEffect(() => {
    if (isLogin) { setChecked(true); return; }
    if (!isAdminLoggedIn()) { clearSession(); router.replace(ROUTES.LOGIN); return; }

    let cancelled = false;
    let redirectTimer: ReturnType<typeof setTimeout> | null = null;

    const verify = async () => {
      const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
      if (!token) { if (!cancelled) { clearSession(); router.replace(ROUTES.LOGIN); } return; }

      const exp = parseJwtExp(token);
      if (exp && Date.now() >= exp - 30000) {
        const refreshed = await refreshToken();
        if (!refreshed) { if (!cancelled) { clearSession(); router.replace(ROUTES.LOGIN); } return; }
      }

      const currentToken = localStorage.getItem(STORAGE_KEYS.TOKEN) || token;

      try {
        const res = await fetch("/api/admin/auth/me", { headers: { Authorization: `Bearer ${currentToken}` } });
        if (cancelled) return;

        if (res.status === 401) {
          const refreshed = await refreshToken();
          if (refreshed) {
            const retry = await fetch("/api/admin/auth/me", { headers: { Authorization: `Bearer ${localStorage.getItem(STORAGE_KEYS.TOKEN) || ""}` } });
            if (cancelled) return;
            if (retry.status === 401) {
              clearSession();
              router.replace(ROUTES.LOGIN);
              return;
            }
            if (retry.status === 403) {
              setForbidden(true);
              redirectTimer = setTimeout(() => {
                if (!cancelled) { clearSession(); router.replace(ROUTES.LOGIN); }
              }, 2000);
              return;
            }
            setChecked(true);
            return;
          }
          clearSession();
          router.replace(ROUTES.LOGIN);
          return;
        }

        if (res.status === 403) {
          setForbidden(true);
          redirectTimer = setTimeout(() => {
            if (!cancelled) { clearSession(); router.replace(ROUTES.LOGIN); }
          }, 2000);
          return;
        }

        setChecked(true);
      } catch (err) {
        console.error("Auth verification failed:", err);
        if (!cancelled) { clearSession(); router.replace(ROUTES.LOGIN); }
      }
    };

    verify();
    return () => { cancelled = true; if (redirectTimer) clearTimeout(redirectTimer); };
  }, [pathname, router, isLogin]);

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {!isLogin && !forbidden && <Sidebar />}
      <main style={{ flex: 1, overflow: "auto", minWidth: 0 }}>
      {forbidden ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", textAlign: "center" }}>
          <div><p style={{ fontSize: 18, fontWeight: 700, color: "#991B1B" }}>Access Denied</p><p style={{ fontSize: 13, opacity: 0.6 }}>Staff accounts cannot access the admin portal.<br />Redirecting to login...</p></div>
        </div>
      ) : checked ? children : (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
          <div style={{ color: "var(--color-text-muted)" }}>Loading...</div>
        </div>
      )}
      </main>
    </div>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <BrandProvider>
      <LayoutInner>{children}</LayoutInner>
    </BrandProvider>
  );
}
