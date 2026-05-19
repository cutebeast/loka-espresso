"use client";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

function isLoggedIn(): boolean {
  if (typeof window === "undefined") return false;
  return !!localStorage.getItem("token");
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
    if (!isLoggedIn()) { router.replace("/login"); return; }
    // Verify admin access (staff-only accounts cannot access admin portal)
    const token = localStorage.getItem("token");
    fetch("/api/v1/admin/auth/me", { headers: { Authorization: `Bearer ${token || ""}` } })
      .then(r => { if (r.status === 403) { setForbidden(true); localStorage.removeItem("token"); setTimeout(() => router.replace("/login"), 2000); } else { setChecked(true); fetchFavicon(token!); } })
      .catch(() => setChecked(true));
  }, [pathname, router]);

  const fetchFavicon = (token: string) => {
    fetch("/api/v1/admin/config?prefix=branding.admin_favicon", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { const items = d.data || []; const fv = items.find((i: any) => i.config_key === "branding.admin_favicon_url"); if (fv?.config_value) setFavicon(fv.config_value); })
      .catch(() => {});
  };

  return (
    <html lang="en" style={{ height: "100%" }}>
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
