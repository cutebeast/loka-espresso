"use client";
import { useRouter, usePathname } from "next/navigation";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { staffLogout } from "@/lib/api";
import { Store, LogOut, Shield } from "lucide-react";

export default function StoreHeader() {
  const router = useRouter();
  const path = usePathname();
  const isAdmin = useIsAdmin();
  const isHome = path === "/";
  const staffName = typeof window !== "undefined" ? localStorage.getItem("staffName") || "" : "";

  const handleLogout = () => {
    staffLogout();
    router.replace("/login");
  };

  return (
    <header className="store-header">
      <button
        className="store-header-brand"
        onClick={() => router.push("/")}
        aria-label="Back to dashboard"
      >
        <Store size={24} />
        <span className="store-header-brand-name">Loka Espresso</span>
      </button>
      <div className="store-header-actions">
        {isAdmin && (
          <span className="badge badge-sm" style={{ background: "var(--color-accent-gold)", color: "#1E1B18" }}>
            <Shield size={10} /> Admin
          </span>
        )}
        <span className="store-header-name">
          {staffName}
        </span>
        <button type="button" className="store-header-logout" onClick={handleLogout} title="Logout" aria-label="Logout">
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
}
