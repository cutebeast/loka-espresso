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
    if (pathname === "/login") {
      setChecked(true);
      return;
    }
    if (!isLoggedIn()) {
      router.replace("/login");
    }
    setChecked(true);
  }, [pathname, router]);

  const isLoginPage = pathname === "/login";

  return (
    <html lang="en" className="h-full">
      <body className="h-full bg-brand-bg text-brand-text">
        <div className="flex h-full">
          {!isLoginPage && <Sidebar />}
          <main className="flex-1 overflow-auto">
            {checked || isLoginPage ? children : (
              <div className="flex items-center justify-center h-full">
                <div className="text-brand-text-muted">Loading...</div>
              </div>
            )}
          </main>
        </div>
      </body>
    </html>
  );
}
