"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface Translation {
  id: number; translation_key: string; locale: string;
  translated_text: string; source_text: string | null; namespace: string;
}

const LOCALES = ["ms", "zh", "ta", "tr"];
const LOCALE_FLAGS: Record<string, string> = { ms: "🇲🇾", zh: "🇨🇳", ta: "🇮🇳", tr: "🇹🇷" };
const LOCALE_NAMES: Record<string, string> = { ms: "BM", zh: "中文", ta: "தமிழ்", tr: "TR" };

export default function TranslationPage() {
  const [items, setItems] = useState<Translation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all(
      LOCALES.map(loc => api.getRaw<{ items: Translation[] }>(`/translations?per_page=500&locale=${loc}`))
    ).then(results => {
      const all: Translation[] = [];
      results.forEach(r => { if (r?.items) all.push(...r.items); });
      setItems(all);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  // Group by namespace
  const byNs: Record<string, Translation[]> = {};
  for (const t of items) {
    const ns = t.translation_key.split(".")[0] || "other";
    if (!byNs[ns]) byNs[ns] = [];
    byNs[ns].push(t);
  }

  const fmtNs = (ns: string) => ns.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  const nsKeys = Object.keys(byNs).sort();

  return (
    <div style={{ padding: 24 }}>
      <h1 className="page-title" style={{ marginBottom: 8 }}>Translations</h1>
      <p className="page-subtitle" style={{ marginBottom: 16 }}>System-level labels for PWA and fixed content</p>

      {/* Info box */}
      <div style={{ marginBottom: 20, padding: 16, borderRadius: 10, background: "rgba(59,74,26,0.04)", border: "1px solid rgba(59,74,26,0.1)", fontSize: 13, lineHeight: 1.7 }}>
        <strong>💡 Content translations are auto-managed.</strong><br />
        All menu items, info cards, products, events, stores, rewards, vouchers, surveys, campaigns, notifications, inventory, dietary tags, tax categories, allergens, splash screens, system pages, and promo banners are <strong>auto-translated</strong> when created or updated.<br />
        <strong>Deleting</strong> any of the above also <strong>automatically cleans up</strong> their translations.<br />
        <span style={{ opacity: 0.7 }}>This page shows only the current snapshot of all translation records in the database — for reference only. No manual editing needed.</span>
      </div>

      {loading ? <p style={{ opacity: 0.5 }}>Loading...</p>
      : nsKeys.length === 0 ? <p style={{ opacity: 0.5 }}>No translations in database.</p>
      : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {nsKeys.map(ns => {
            const group = byNs[ns];
            const unique = new Set(group.map(t => t.translation_key));
            return (
              <div key={ns} className="card" style={{ padding: 14 }}>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{fmtNs(ns)}</div>
                <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 10 }}>
                  {unique.size} entry{unique.size !== 1 ? "ies" : "y"} · {group.length} locale{group.length !== 1 ? "s" : ""} covered
                </div>
                <div className="table-container"><table className="data-table" style={{ fontSize: 12 }}>
                  <thead><tr><th>Key</th>{LOCALES.map(loc => <th key={loc} style={{ textAlign: "center" }}>{LOCALE_FLAGS[loc]} {LOCALE_NAMES[loc]}</th>)}</tr></thead>
                  <tbody>
                    {[...unique].sort().slice(0, 50).map(key => {
                      const keyGroup = group.filter(t => t.translation_key === key);
                      const src = keyGroup.find(t => t.source_text)?.source_text || key.split(".").pop() || "";
                      return (
                        <tr key={key}>
                          <td style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={key}>{src}</td>
                          {LOCALES.map(loc => {
                            const match = keyGroup.find(t => t.locale === loc);
                            return (
                              <td key={loc} style={{ textAlign: "center", maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: match?.translated_text ? "inherit" : "var(--color-text-muted)" }}>
                                {match?.translated_text || <span style={{ opacity: 0.3 }}>—</span>}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table></div>
                {unique.size > 50 && <div style={{ fontSize: 11, opacity: 0.5, marginTop: 4 }}>Showing first 50 of {unique.size} entries</div>}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ marginTop: 20, padding: 12, background: "var(--color-bg-muted)", borderRadius: "var(--radius-sm)", fontSize: 11, color: "var(--color-text-muted)", lineHeight: 1.6 }}>
        📦 <strong>Translation cascade:</strong> 24 entity types are registered in the system. All supported by auto-translate on create/update and automatic cleanup on delete (via <code>delete_translations</code>).
      </div>
    </div>
  );
}
