"use client";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

function isLoggedIn(): boolean {
  if (typeof window === "undefined") return false;
  return !!localStorage.getItem("token");
}

function parseJwtExp(token: string): number | null {
  try {
    const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(atob(base64));
    return json.exp ? json.exp * 1000 : null;
  } catch { return null; }
}

async function refreshToken(): Promise<boolean> {
  try {
    const refresh = localStorage.getItem("refreshToken");
    if (!refresh) return false;
    const res = await fetch("/api/v1/admin/auth/refresh", {
      method: "POST", headers: { "Content-Type": "application/json" },
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
  } catch { return false; }
}

function clearSession() {
  localStorage.removeItem("token");
  localStorage.removeItem("refreshToken");
  localStorage.removeItem("adminEmail");
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const isLogin = pathname === "/login";
  const [checked, setChecked] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [favicon, setFavicon] = useState("");

  useEffect(() => {
    if (isLogin) { setChecked(true); return; }
    if (!isLoggedIn()) { clearSession(); router.replace("/login"); return; }

    let cancelled = false;
    let redirectTimer: ReturnType<typeof setTimeout> | null = null;

    const verify = async () => {
      const token = localStorage.getItem("token");
      if (!token) { if (!cancelled) { clearSession(); router.replace("/login"); } return; }

      // Check client-side token expiry first
      const exp = parseJwtExp(token);
      if (exp && Date.now() >= exp - 30000) {
        const refreshed = await refreshToken();
        if (!refreshed) { if (!cancelled) { clearSession(); router.replace("/login"); } return; }
      }

      const currentToken = localStorage.getItem("token") || token;

      try {
        const res = await fetch("/api/v1/admin/auth/me", { headers: { Authorization: `Bearer ${currentToken}` } });
        if (cancelled) return;

        if (res.status === 401) {
          const refreshed = await refreshToken();
          if (refreshed) {
            const retry = await fetch("/api/v1/admin/auth/me", { headers: { Authorization: `Bearer ${localStorage.getItem("token") || ""}` } });
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
            if (!cancelled) { clearSession(); router.replace("/login"); }
          }, 2000);
          return;
        }

        setChecked(true);
        // Load favicon after auth succeeds
        fetch("/api/v1/admin/config?prefix=branding.admin_favicon", { headers: { Authorization: `Bearer ${currentToken}` } })
          .then(r => r.json())
          .then(d => {
            if (cancelled) return;
            const items = d.data || [];
            const fv = items.find((i: any) => i.config_key === "branding.admin_favicon_url");
            if (fv?.config_value) setFavicon(fv.config_value);
          })
          .catch(() => {});
      } catch {
        if (!cancelled) setChecked(true);
      }
    };

    verify();
    return () => { cancelled = true; if (redirectTimer) clearTimeout(redirectTimer); };
  }, [pathname, router, isLogin]);

  return (
    <html lang="en" style={{ height: "100%" }}>
      <head>{favicon && <link rel="icon" type="image/svg+xml" href={favicon} />}</head>
      <body style={{ height: "100%", display: "flex", margin: 0 }}>
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
      </body>
    </html>
  );
}
