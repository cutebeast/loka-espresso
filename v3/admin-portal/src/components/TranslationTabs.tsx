/**
 * Translations — Tab Navigation (shared)
 */
"use client";

interface TranslationTabsProps {
  active: string;
  onChange: (tab: string) => void;
}

const TABS = [
  { id: "pwa", label: "Customer PWA", desc: "UI labels for customer-facing mobile app" },
  { id: "admin", label: "Admin Portal", desc: "UI labels for admin dashboard" },
  { id: "staff", label: "Staff Portal", desc: "UI labels for staff POS & operations" },
];

export default function TranslationTabs({ active, onChange }: TranslationTabsProps) {
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
          aria-label={tab.label}
        >
          <div>{tab.label}</div>
          <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>{tab.desc}</div>
        </button>
      ))}
    </div>
  );
}
