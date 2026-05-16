"use client";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import "./globals.css";
import StoreHeader from "@/components/StoreHeader";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [checked, setChecked] = useState(false);
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    if (pathname === "/login") { setChecked(true); return; }
    const token = localStorage.getItem("token");
    const storeId = localStorage.getItem("staffStoreId");
    if (!token || !storeId) { router.replace("/login"); return; }
    setChecked(true);
  }, [pathname, router]);

  const isLoginPage = pathname === "/login";

  return (
    <html lang="en" style={{ height: "100%" }}>
      <body style={{ height: "100%", margin: 0, background: "var(--brand-bg, #F2EEE6)", color: "var(--brand-text, #1E1B18)", fontFamily: "system-ui, sans-serif" }}>
        {isLoginPage ? (
          <div style={{ height: "100%" }}>{children}</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <StoreHeader />
            <main style={{ flex: 1, overflow: "auto" }}>
              {forbidden ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", textAlign: "center" }}>
                  <div><p style={{ fontSize: 18, fontWeight: 700, color: "#991B1B" }}>Access Denied</p><p style={{ fontSize: 13, opacity: 0.6 }}>This account does not have staff portal access.<br />Redirecting to login...</p></div>
                </div>
              ) : checked ? children : (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", opacity: 0.5 }}>Loading...</div>
              )}
            </main>
          </div>
        )}
      </body>
    </html>
  );
}
