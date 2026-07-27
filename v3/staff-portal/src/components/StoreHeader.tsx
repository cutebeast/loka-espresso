"use client";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { api, staffLogout, type Store, type PaginatedResponse } from "@/lib/api";
import { useTranslation } from "@/hooks/useTranslation";
import LanguageSelector from "@/components/LanguageSelector";
import { Store as StoreIcon, LogOut, Shield, HelpCircle } from "lucide-react";

export default function StoreHeader() {
  const router = useRouter();
  const isAdmin = useIsAdmin();
  const { t } = useTranslation();
  const [staffName, setStaffName] = useState("");
  const [stores, setStores] = useState<Store[]>([]);
  const [currentStoreId, setCurrentStoreId] = useState("");
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState("");

  useEffect(() => {
    setStaffName(localStorage.getItem("staffName") || "");
    setCurrentStoreId(localStorage.getItem("staffStoreId") || "");
    const onStorage = () => {
      setStaffName(localStorage.getItem("staffName") || "");
      setCurrentStoreId(localStorage.getItem("staffStoreId") || "");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Admins can switch stores — load the same store list the login page offers.
  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    const locale = typeof window !== "undefined" ? localStorage.getItem("locale") || "en" : "en";
    api.get<PaginatedResponse<Store> | Store[]>(`/stores?locale=${locale}`)
      .then((d) => {
        if (cancelled) return;
        const list = Array.isArray(d) ? d : (d?.items || []);
        setStores(list.filter((s) => s.is_active !== false));
      })
      .catch((err: unknown) => console.error("Store list fetch failed:", err));
    return () => { cancelled = true; };
  }, [isAdmin]);

  const handleSwitchStore = async (storeId: string) => {
    if (!storeId || storeId === currentStoreId || switching) return;
    setSwitching(true);
    setSwitchError("");
    try {
      const res = await fetch("/auth/admin-store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ store_id: Number(storeId) }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.detail || t("header.store_switch_failed"));
      }
      // Session cookie is already re-scoped by the proxy route; update the
      // store-scoped client state and reload so every page refetches.
      localStorage.setItem("staffStoreId", storeId);
      window.location.reload();
    } catch (e) {
      console.error("Store switch failed:", e);
      setSwitchError((e as Error)?.message || t("header.store_switch_failed"));
      setSwitching(false);
    }
  };

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
        <StoreIcon size={24} />
        <span className="store-header-brand-name">Loka Espresso</span>
      </button>
      <div className="store-header-actions">
        {isAdmin && stores.length > 0 && (
          <select
            className="form-input"
            style={{ padding: "4px 8px", fontSize: 12, width: "auto", height: "auto" }}
            value={currentStoreId}
            onChange={(e) => handleSwitchStore(e.target.value)}
            disabled={switching}
            title={t("header.switch_store")}
            aria-label={t("header.switch_store")}
          >
            {!currentStoreId && <option value="">{t("header.switch_store")}</option>}
            {stores.map((s) => (
              <option key={s.id} value={String(s.id)}>{s.store_name}</option>
            ))}
          </select>
        )}
        {switchError && (
          <span style={{ fontSize: 12, color: "var(--color-error)" }}>{switchError}</span>
        )}
        {isAdmin && (
          <span className="badge badge-sm" style={{ background: "var(--color-accent-gold)", color: "#1E1B18" }}>
            <Shield size={10} /> {t("header.admin_badge")}
          </span>
        )}
        <span className="store-header-name">
          {staffName}
        </span>
        <LanguageSelector dark />
        <button
          type="button"
          className="store-header-logout"
          onClick={() => router.push("/help")}
          title={t("header.help")}
          aria-label={t("header.help")}
          style={{ marginRight: 4 }}
        >
          <HelpCircle size={18} />
        </button>
        <button type="button" className="store-header-logout" onClick={handleLogout} title={t("header.logout")} aria-label={t("header.logout")}>
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
}
