"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import StoreHeader from "@/components/StoreHeader";

function parseJwtExp(token: string): number | null {
  try {
    const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(atob(base64));
    return json.exp ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

async function refreshToken(): Promise<boolean> {
  try {
    const refresh = localStorage.getItem("refreshToken");
    if (!refresh) return false;
    const res = await fetch("/api/v1/staff/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refresh }),
    });
    if (!res.ok) return false;
    const json = await res.json();
    const data = json.data || json;
    if (data.tokens?.access_token) {
      localStorage.setItem("token", data.tokens.access_token);
      if (data.tokens.refresh_token) localStorage.setItem("refreshToken", data.tokens.refresh_token);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function clearSession() {
  localStorage.removeItem("token");
  localStorage.removeItem("refreshToken");
  localStorage.removeItem("staffEmail");
  localStorage.removeItem("staffName");
  localStorage.removeItem("staffStoreId");
  localStorage.removeItem("staffProfile");
  localStorage.removeItem("staffId");
  localStorage.removeItem("isAdmin");
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [checked, setChecked] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const isLoginPage = pathname === "/login";

  // Branding favicon
  useEffect(() => {
    fetch("/api/v1/staff/config/branding")
      .then((r) => r.json())
      .then((d) => {
        const items = d.data || {};
        const fv = items["branding.staff_favicon_url"];
        if (fv && fv !== '""' && fv !== "" && /^(https?:\/\/|\/)/.test(fv)) {
          let link = document.querySelector("link[rel='icon']") as HTMLLinkElement | null;
          if (!link) {
            link = document.createElement("link");
            link.rel = "icon";
            document.head.appendChild(link);
          }
          link.type = "image/svg+xml";
          link.href = fv;
        }
      })
      .catch((err) => { console.error("Branding fetch failed:", err); });
  }, []);

  // ── Idle timeout (30 min) ──
  useEffect(() => {
    if (isLoginPage) return;
    const IDLE_MS = 30 * 60 * 1000;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;

    const logoutIdle = () => {
      clearSession();
      router.replace("/login");
    };

    const resetIdleTimer = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(logoutIdle, IDLE_MS);
    };

    const events = ["mousemove", "keydown", "click", "touchstart", "scroll"];
    events.forEach((e) => window.addEventListener(e, resetIdleTimer, { passive: true }));
    resetIdleTimer();

    return () => {
      events.forEach((e) => window.removeEventListener(e, resetIdleTimer));
      if (idleTimer) clearTimeout(idleTimer);
    };
  }, [isLoginPage, router]);

  useEffect(() => {
    if (isLoginPage) {
      setChecked(true);
      return;
    }

    let cancelled = false;
    let redirectTimer: ReturnType<typeof setTimeout> | null = null;

    const verify = async () => {
      const token = localStorage.getItem("token");
      const storeId = localStorage.getItem("staffStoreId");

      if (!token || !storeId) {
        if (!cancelled) {
          clearSession();
          router.replace("/login");
        }
        return;
      }

      // Check client-side token expiry first
      const exp = parseJwtExp(token);
      if (exp && Date.now() >= exp - 30000) {
        // Token expired (or within 30s of expiry) — try refresh
        const refreshed = await refreshToken();
        if (!refreshed) {
          if (!cancelled) {
            clearSession();
            router.replace("/login");
          }
          return;
        }
      }

      const currentToken = localStorage.getItem("token") || token;

      try {
        const res = await fetch("/api/v1/staff/auth/me", {
          headers: { Authorization: `Bearer ${currentToken}` },
        });

        if (cancelled) return;

        if (res.status === 401) {
          // Try refresh once more
          const refreshed = await refreshToken();
          if (refreshed) {
            const retry = await fetch("/api/v1/staff/auth/me", {
              headers: { Authorization: `Bearer ${localStorage.getItem("token") || ""}` },
            });
            if (cancelled) return;
            if (retry.status === 401 || retry.status === 403) {
              clearSession();
              router.replace("/login");
              return;
            }
            setChecked(true);
            return;
          }
          clearSession();
          router.replace("/login");
          return;
        }

        if (res.status === 403) {
          setForbidden(true);
          redirectTimer = setTimeout(() => {
            if (!cancelled) {
              clearSession();
              router.replace("/login");
            }
          }, 3000);
          return;
        }

        setChecked(true);
      } catch (err) {
        console.error("Auth verification failed:", err);
        if (!cancelled) {
          // Network error — don't boot user immediately, but mark checked
          // so they can see cached content. Next API call will handle 401.
          setChecked(true);
        }
      }
    };

    verify();

    return () => {
      cancelled = true;
      if (redirectTimer) clearTimeout(redirectTimer);
    };
  }, [pathname, router, isLoginPage]);

  if (isLoginPage) {
    return <>{children}</>;
  }

  return (
    <div className="app-shell">
      <StoreHeader />
      <main className="app-main">
        {forbidden ? (
          <div className="forbidden-screen">
            <div>
              <p className="forbidden-title">Access Denied</p>
              <p className="forbidden-desc">This account does not have staff portal access.<br />Redirecting to login...</p>
            </div>
          </div>
        ) : checked ? (
          children
        ) : (
          <div className="loading-screen">
            <div className="animate-spin" style={{ width: 24, height: 24, border: "2px solid var(--color-border-light)", borderTopColor: "var(--color-primary)", borderRadius: "50%" }} />
          </div>
        )}
      </main>
    </div>
  );
}
