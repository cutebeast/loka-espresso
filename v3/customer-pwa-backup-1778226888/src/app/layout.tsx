"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import "./globals.css";
import BottomNav from "@/components/BottomNav";
import { CartProvider } from "@/contexts/CartContext";
import { isLoggedIn } from "@/lib/api";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [checked, setChecked] = useState(false);

  const publicPaths = ["/login", "/register"];
  const isPublic = publicPaths.includes(pathname);

  useEffect(() => {
    if (isPublic) {
      setChecked(true);
      return;
    }
    if (!isLoggedIn()) {
      router.replace("/login");
    }
    setChecked(true);
  }, [pathname, router, isPublic]);

  return (
    <html lang="en">
      <body className="bg-gray-100 text-gray-900">
        <CartProvider>
          <div className="max-w-md mx-auto min-h-screen bg-gray-50 relative shadow-2xl">
            <main className="pb-20">
              {checked || isPublic ? children : (
                <div className="flex items-center justify-center min-h-screen">
                  <div className="text-gray-500">Loading...</div>
                </div>
              )}
            </main>
            {!isPublic && <BottomNav />}
          </div>
        </CartProvider>
      </body>
    </html>
  );
}
