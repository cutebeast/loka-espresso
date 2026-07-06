"use client";
import { useState } from "react";
import TranslationTabs from "@/components/TranslationTabs";
import PwaTranslationsTab from "@/components/PwaTranslationsTab";
import StaffTranslationsTab from "@/components/StaffTranslationsTab";
import AdminTranslationsTab from "@/components/AdminTranslationsTab";
import { api } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import { RefreshCw } from "lucide-react";

export default function TranslationPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState("pwa");
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");

  const handleSync = async () => {
    setSyncing(true);
    setSyncMsg("");
    try {
      const res = await api.post<{ message?: string; results?: Record<string, number> }>("/admin/translations/sync-to-json");
      const results = res?.results || {};
      const parts = Object.entries(results).map(([loc, count]) => `${loc}: ${count} keys`);
      setSyncMsg(`Synced — ${parts.join(", ")}`);
      setTimeout(() => setSyncMsg(""), 5000);
    } catch (e: any) {
      setSyncMsg(e.message || "Sync failed");
      setTimeout(() => setSyncMsg(""), 5000);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: 4 }}>{t("admin.translations.title")}</h1>
          <p className="page-subtitle" style={{ marginBottom: 16 }}>
            {t("admin.translations.subtitle")}
          </p>
        </div>
        <button
          type="button"
          onClick={handleSync}
          disabled={syncing}
          className="btn btn-sm btn-outline"
          style={{ display: "flex", alignItems: "center", gap: 6 }}
          title="Sync DB translations to PWA JSON locale files"
        >
          <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
          {syncing ? t("admin.translations.syncing") : t("admin.translations.syncToJson")}
        </button>
      </div>

      {syncMsg && (
        <div className="alert alert-success" style={{ marginBottom: 12, fontSize: 13 }}>{syncMsg}</div>
      )}

      <TranslationTabs active={tab} onChange={setTab} />

      {tab === "pwa" && <PwaTranslationsTab />}
      {tab === "admin" && <AdminTranslationsTab />}
      {tab === "staff" && <StaffTranslationsTab />}

      <div style={{ marginTop: 24, padding: 12, background: "var(--color-bg-muted)", borderRadius: "var(--radius-sm)", fontSize: 11, color: "var(--color-text-muted)", lineHeight: 1.6 }}>
        📦 <strong>{t("admin.translations.howItWorksTitle")}:</strong> {t("admin.translations.howItWorksText")}
      </div>
    </div>
  );
}
