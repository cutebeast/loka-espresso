"use client";
import { useState } from "react";
import TranslationTabs from "@/components/TranslationTabs";
import PwaTranslationsTab from "@/components/PwaTranslationsTab";
import PlaceholderTab from "@/components/PlaceholderTab";

export default function TranslationPage() {
  const [tab, setTab] = useState("pwa");

  return (
    <div style={{ padding: 24 }}>
      <h1 className="page-title" style={{ marginBottom: 4 }}>Translations</h1>
      <p className="page-subtitle" style={{ marginBottom: 16 }}>
        Manage UI translations for all three portals from one place
      </p>

      <TranslationTabs active={tab} onChange={setTab} />

      {tab === "pwa" && <PwaTranslationsTab />}
      {tab === "admin" && (
        <PlaceholderTab
          title="Admin Portal Translations"
          description="Translate all admin dashboard UI labels, sidebar menus, form fields, button text, and notification messages. Currently the admin portal is English-only — this will enable multi-language support."
        />
      )}
      {tab === "staff" && (
        <PlaceholderTab
          title="Staff Portal Translations"
          description="Translate all staff POS, kitchen display, table management, and operations UI labels. Currently the staff portal is English-only — this will enable multi-language support for your crew."
        />
      )}

      <div style={{ marginTop: 24, padding: 12, background: "var(--color-bg-muted)", borderRadius: "var(--radius-sm)", fontSize: 11, color: "var(--color-text-muted)", lineHeight: 1.6 }}>
        📦 <strong>How translations work:</strong> All three portals share the same <code>translations</code> table in the database. Translations are segmented by <code>namespace</code> (<code>pwa-ui</code>, <code>admin-ui</code>, <code>staff-ui</code>). The PWA fetches translations dynamically on startup and caches them locally for 24 hours. Editing a translation here takes effect on the next PWA load.
      </div>
    </div>
  );
}
