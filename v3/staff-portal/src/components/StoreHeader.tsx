"use client";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { staffLogout } from "@/lib/api";
import { useTranslation } from "@/hooks/useTranslation";
import LanguageSelector from "@/components/LanguageSelector";
import { Store, LogOut, Shield } from "lucide-react";

export default function StoreHeader() {
  const router = useRouter();
  const isAdmin = useIsAdmin();
  const { t } = useTranslation();
  const [staffName, setStaffName] = useState(() => typeof window !== "undefined" ? localStorage.getItem("staffName") || "" : "");

  useEffect(() => {
    const onStorage = () => {
      setStaffName(localStorage.getItem("staffName") || "");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const handleLogout = () => {
    staffLogout();
    router.replace("/login");
  };

  return (
    <header className="store-header">
      <button
        className="store-header-brand"
        onClick={() => router.push("/")}
        aria-label={t("header.back_to_dashboard")}
      >
        <Store size={24} />
        <span className="store-header-brand-name">Loka Espresso</span>
      </button>
      <div className="store-header-actions">
        {isAdmin && (
          <span className="badge badge-sm" style={{ background: "var(--color-accent-gold)", color: "#1E1B18" }}>
            <Shield size={10} /> {t("header.admin_badge")}
          </span>
        )}
        <span className="store-header-name">
          {staffName}
        </span>
        <LanguageSelector />
        <button type="button" className="store-header-logout" onClick={handleLogout} title={t("header.logout")} aria-label={t("header.logout")}>
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
}
