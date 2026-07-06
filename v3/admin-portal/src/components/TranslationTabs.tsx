"use client";

import { useTranslation } from "@/lib/i18n";

interface TranslationTabsProps {
  active: string;
  onChange: (tab: string) => void;
}

const TABS = [
  { id: "pwa", labelKey: "admin.translations.tab.pwa", descKey: "admin.translations.tab.pwaDesc" },
  { id: "admin", labelKey: "admin.translations.tab.admin", descKey: "admin.translations.tab.adminDesc" },
  { id: "staff", labelKey: "admin.translations.tab.staff", descKey: "admin.translations.tab.staffDesc" },
];

export default function TranslationTabs({ active, onChange }: TranslationTabsProps) {
  const { t } = useTranslation();
  return (
    <div style={{ display: "flex", gap: 0, marginBottom: 24, borderBottom: "2px solid var(--color-border-light, #e5e7eb)" }}>
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          style={{
            padding: "12px 24px",
            border: "none",
            borderBottom: active === tab.id ? "2px solid var(--color-primary, #3B4A1A)" : "2px solid transparent",
            background: "transparent",
            fontWeight: active === tab.id ? 600 : 400,
            color: active === tab.id ? "var(--color-primary, #3B4A1A)" : "var(--color-text-muted, #6b7280)",
            cursor: "pointer",
            fontSize: 14,
            marginBottom: -2,
            transition: "all 0.15s",
          }}
          aria-label={t(tab.labelKey)}
        >
          <div>{t(tab.labelKey)}</div>
          <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>{t(tab.descKey)}</div>
        </button>
      ))}
    </div>
  );
}
