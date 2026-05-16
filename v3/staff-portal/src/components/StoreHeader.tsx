"use client";
import { useRouter, usePathname } from "next/navigation";
import { Store, LogOut, ArrowLeft } from "lucide-react";

export default function StoreHeader() {
  const router = useRouter();
  const path = usePathname();
  const isHome = path === "/";
  const staffName = typeof window !== "undefined" ? localStorage.getItem("staffName") || "" : "";

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("staffName");
    localStorage.removeItem("staffEmail");
    router.replace("/login");
  };

  return (
    <header style={{
      position: "sticky", top: 0, zIndex: 50,
      background: "var(--brand-sidebar, #1E1B18)", color: "#F5F0E6",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "10px 14px", minHeight: 48,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {!isHome && (
          <button onClick={() => router.push("/")} style={{ background: "none", border: "none", color: "#F5F0E6", cursor: "pointer", padding: 4 }}>
            <ArrowLeft size={22} />
          </button>
        )}
        <Store size={20} />
        <span style={{ fontWeight: 600, fontSize: 15 }}>Loka Espresso</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 12, opacity: 0.7, maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{staffName}</span>
        <button onClick={handleLogout} style={{ background: "none", border: "none", color: "#C9A84C", cursor: "pointer", padding: 4 }} title="Logout">
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
}
