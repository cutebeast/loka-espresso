"use client";
import { useState } from "react";
import TranslationTabs from "@/components/TranslationTabs";
import PwaTranslationsTab from "@/components/PwaTranslationsTab";
import StaffTranslationsTab from "@/components/StaffTranslationsTab";
import PlaceholderTab from "@/components/PlaceholderTab";
import { api } from "@/lib/api";
import { RefreshCw } from "lucide-react";

export default function TranslationPage() {
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
          <h1 className="page-title" style={{ marginBottom: 4 }}>Translations</h1>
          <p className="page-subtitle" style={{ marginBottom: 16 }}>
            Manage UI translations for all three portals from one place
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
          {syncing ? "Syncing..." : "Sync to JSON"}
        </button>
      </div>

      {syncMsg && (
        <div className="alert alert-success" style={{ marginBottom: 12, fontSize: 13 }}>{syncMsg}</div>
      )}

      <TranslationTabs active={tab} onChange={setTab} />

      {tab === "pwa" && <PwaTranslationsTab />}
      {tab === "admin" && (
        <PlaceholderTab
          title="Admin Portal Translations"
          description="Translate all admin dashboard UI labels, sidebar menus, form fields, button text, and notification messages. Currently the admin portal is English-only — this will enable multi-language support."
        />
      )}
      {tab === "staff" && <StaffTranslationsTab />}

      <div style={{ marginTop: 24, padding: 12, background: "var(--color-bg-muted)", borderRadius: "var(--radius-sm)", fontSize: 11, color: "var(--color-text-muted)", lineHeight: 1.6 }}>
        📦 <strong>How translations work:</strong> All three portals share the same <code>translations</code> table in the database. Translations are segmented by <code>namespace</code> (<code>pwa-ui</code>, <code>admin-ui</code>, <code>staff-ui</code>). The PWA fetches translations dynamically on startup and caches them locally for 24 hours. After generating translations, click <strong>{`"Sync to JSON"`}</strong> to write them to the PWA&apos;s static locale files for offline fallback.
      </div>
    </div>
  );
}
