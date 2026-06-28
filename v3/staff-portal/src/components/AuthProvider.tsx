"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import StoreHeader from "@/components/StoreHeader";
import { staffLogout, refreshToken as apiRefreshToken } from "@/lib/api";

function parseJwtExp(token: string): number | null {
  try {
    const parts = token.split(".");
    const payload = parts[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(atob(base64));
    return json.exp ? json.exp * 1000 : null;
  } catch (e) {
    console.error("Failed to parse JWT:", e);
    return null;
  }
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [checked, setChecked] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [authError, setAuthError] = useState(false);
  const [showIdleWarning, setShowIdleWarning] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: string } | null>(null);
  const isLoginPage = pathname === "/login";

  // Branding favicon
  useEffect(() => {
    let injectedLink: HTMLLinkElement | null = null;
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    fetch("/api/staff/config/branding", {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => { if (!r.ok) throw new Error('branding fetch failed'); return r.json(); })
      .then((d) => {
        const items = d.data || {};
        const fv = items["branding.staff_favicon_url"];
        if (fv && fv !== '""' && fv !== "" && /^(https?:\/\/|\/)/.test(fv)) {
          let link = document.querySelector("link[rel='icon']") as HTMLLinkElement | null;
          if (!link) {
            link = document.createElement("link");
            link.rel = "icon";
            document.head.appendChild(link);
            injectedLink = link;
          }
          const ext = fv.split("?").at(0)?.split(".").pop()?.toLowerCase();
          link.type = ext === "png" ? "image/png" : ext === "ico" ? "image/x-icon" : "image/svg+xml";
          link.href = fv;
        }
      })
      .catch((err) => { console.error("Branding fetch failed:", err); });
    return () => { if (injectedLink) injectedLink.remove(); };
  }, []);

  // Global toast listener for feature-flag toasts
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.message) {
        setToast({ message: detail.message, type: detail.type || "info" });
        setTimeout(() => setToast(null), 4000);
      }
    };
    window.addEventListener("pos:toast", handler);
    return () => window.removeEventListener("pos:toast", handler);
  }, []);

  // ── Idle timeout (30 min) with 60s warning ──
  useEffect(() => {
    if (isLoginPage) return;
    const IDLE_MS = 30 * 60 * 1000;
    const WARN_MS = 60 * 1000;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    let warnTimer: ReturnType<typeof setTimeout> | null = null;

    const forceLogout = () => {
      setShowIdleWarning(false);
      staffLogout();
      router.replace("/login");
    };

    const showWarning = () => {
      setShowIdleWarning(true);
      warnTimer = setTimeout(forceLogout, WARN_MS);
    };

    const resetIdleTimer = () => {
      setShowIdleWarning(false);
      if (idleTimer) clearTimeout(idleTimer);
      if (warnTimer) clearTimeout(warnTimer);
      idleTimer = setTimeout(showWarning, IDLE_MS - WARN_MS);
    };

    const events = ["mousemove", "keydown", "click", "touchstart", "scroll"];
    events.forEach((e) => window.addEventListener(e, resetIdleTimer, { passive: true }));
    window.addEventListener("staff:activity", resetIdleTimer);
    resetIdleTimer();

    return () => {
      events.forEach((e) => window.removeEventListener(e, resetIdleTimer));
      window.removeEventListener("staff:activity", resetIdleTimer);
      if (idleTimer) clearTimeout(idleTimer);
      if (warnTimer) clearTimeout(warnTimer);
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
          staffLogout();
          router.replace("/login");
        }
        return;
      }

      // Check client-side token expiry first
      const exp = parseJwtExp(token);
      if (exp && Date.now() >= exp - 30000) {
        // Token expired (or within 30s of expiry) — try refresh
        const refreshed = await apiRefreshToken();
        if (!refreshed) {
          if (!cancelled) {
            staffLogout();
            router.replace("/login");
          }
          return;
        }
      }

      const currentToken = localStorage.getItem("token") || token;

      try {
        const res = await fetch("/api/staff/auth/me", {
          headers: { Authorization: `Bearer ${currentToken}` },
        });

        if (cancelled) return;

        if (res.status === 401) {
          // Try refresh once more
          const refreshed = await apiRefreshToken();
          if (refreshed) {
            const retry = await fetch("/api/staff/auth/me", {
              headers: { Authorization: `Bearer ${localStorage.getItem("token") || ""}` },
            });
            if (cancelled) return;
            if (retry.status === 401 || retry.status === 403) {
              staffLogout();
              router.replace("/login");
              return;
            }
            setChecked(true);
            return;
          }
          staffLogout();
          router.replace("/login");
          return;
        }

        if (res.status === 403) {
          setForbidden(true);
          redirectTimer = setTimeout(() => {
            if (!cancelled) {
              staffLogout();
              router.replace("/login");
            }
          }, 3000);
          return;
        }

        setChecked(true);
      } catch (err) {
        console.error("Auth verification failed:", err);
        // Network error — retry up to 3 times with backoff, then show error
        if (!cancelled) {
          setAuthError(true);
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
      {showIdleWarning && (
        <div style={{ background: "#FFF3CD", color: "#856404", padding: "10px 16px", textAlign: "center", fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
          Session expiring soon — tap anywhere to stay logged in
          <button type="button" onClick={() => { setShowIdleWarning(false); window.dispatchEvent(new Event("staff:activity")); }} style={{ background: "#856404", color: "white", border: "none", padding: "4px 12px", borderRadius: 6, cursor: "pointer", fontSize: 13 }}>
            I&apos;m here
          </button>
        </div>
      )}
      <main className="app-main">
        {toast && (
          <div style={{
            position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", zIndex: 9999,
            background: toast.type === "error" ? "#FEE2E2" : toast.type === "success" ? "#DCFCE7" : "#DBEAFE",
            color: toast.type === "error" ? "#991B1B" : toast.type === "success" ? "#166534" : "#1E40AF",
            padding: "12px 24px", borderRadius: 12, fontSize: 14, fontWeight: 600,
            boxShadow: "0 4px 20px rgba(0,0,0,0.15)", pointerEvents: "none",
          }}>
            {toast.message}
          </div>
        )}
        {forbidden ? (
          <div className="forbidden-screen">
            <div>
              <p className="forbidden-title">Access Denied</p>
              <p className="forbidden-desc">This account does not have staff portal access.<br />Redirecting to login...</p>
            </div>
          </div>
        ) : authError ? (
          <div className="forbidden-screen">
            <div>
              <p className="forbidden-title">Connection Error</p>
              <p className="forbidden-desc">Unable to reach the server. Please check your connection.</p>
              <button
                type="button"
                style={{ marginTop: 16, padding: "8px 24px", borderRadius: 8, background: "var(--color-primary)", color: "white", border: "none", cursor: "pointer" }}
                onClick={() => { setAuthError(false); window.location.reload(); }}
              >
                Retry
              </button>
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
