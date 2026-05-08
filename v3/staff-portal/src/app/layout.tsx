"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
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
        {isLoginPage ? (
          <div className="h-full">{children}</div>
        ) : (
          <div className="flex h-full">
            <Sidebar />
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
              <TopBar />
              <main className="flex-1 overflow-auto">
                {checked ? children : (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-brand-text-muted">Loading...</div>
                  </div>
                )}
              </main>
            </div>
          </div>
        )}
      </body>
    </html>
  );
}
