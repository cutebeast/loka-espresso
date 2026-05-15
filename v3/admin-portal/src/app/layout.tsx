"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import { isLoggedIn } from "@/lib/api";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (pathname === "/login") { setChecked(true); return; }
    if (!isLoggedIn()) { router.replace("/login"); }
    setChecked(true);
  }, [pathname, router]);

  const isLogin = pathname === "/login";

  return (
    <html lang="en" style={{ height: "100%" }}>
      <body style={{ height: "100%", display: "flex", margin: 0 }}>
        {!isLogin && <Sidebar />}
        <main style={{ flex: 1, overflow: "auto", minWidth: 0 }}>
          {checked || isLogin ? children : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
              <div style={{ color: "var(--color-text-muted)" }}>Loading...</div>
            </div>
          )}
        </main>
      </body>
    </html>
  );
}
