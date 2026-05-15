"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface Translation {
  id: number; translation_key: string; locale: string;
  translated_text: string; source_text: string | null; namespace: string;
}

const NAMESPACES = ["menu", "store", "reward", "voucher", "information", "product", "event", "loyalty", "dietary", "tax", "allergens"];
const NAMESPACE_LABELS: Record<string, string> = {
  menu: "🍽️ Menu", store: "🏪 Stores", reward: "🎁 Rewards", voucher: "🎫 Vouchers",
  information: "📋 Info Cards", product: "🛍️ Product Cards", event: "📅 Event Cards",
  loyalty: "⭐ Loyalty", dietary: "🏷️ Dietary Tags", tax: "💰 Tax", allergens: "⚠️ Allergens",
};
const LOCALES = ["ms", "zh", "ta", "tr"];
const LOCALE_FLAGS: Record<string, string> = { ms: "🇲🇾", zh: "🇨🇳", ta: "🇮🇳", tr: "🇹🇷" };
const LOCALE_NAMES: Record<string, string> = { ms: "BM", zh: "中文", ta: "தமிழ்", tr: "TR" };

type FieldGroup = { fieldName: string; sourceText: string; locales: Record<string, { id: number; text: string }> };
type ContentGroup = { sourceText: string; fields: Record<string, FieldGroup> };

export default function TranslationPage() {
  const [groups, setGroups] = useState<Record<string, ContentGroup>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ns, setNs] = useState("menu");
  const [savingKey, setSavingKey] = useState(""); // "id:text" format

  const fetchAll = async () => {
    setLoading(true);
    setError("");
    try {
      const results = await Promise.all(
        LOCALES.map(loc => api.getRaw<{ items: Translation[] }>(`/translations?namespace=${ns}&locale=${loc}&per_page=100`))
      );
      const all: Translation[] = [];
      results.forEach(r => { if (r?.items) all.push(...r.items); });

      // Group by entity key, then by field
      const grouped: Record<string, ContentGroup> = {};
      for (const t of all) {
        const parts = t.translation_key.split(".");
        const fieldName = parts.pop() || "text";
        const entityKey = parts.join(".") || t.translation_key;

        if (!grouped[entityKey]) grouped[entityKey] = { sourceText: t.source_text || "", fields: {} };
        if (!grouped[entityKey].fields[fieldName]) {
          grouped[entityKey].fields[fieldName] = { fieldName, sourceText: t.source_text || "", locales: {} };
        }
        grouped[entityKey].fields[fieldName].locales[t.locale] = { id: t.id, text: t.translated_text || "" };
        if (t.source_text && (t.source_text.length > (grouped[entityKey].sourceText?.length || 0))) {
          grouped[entityKey].sourceText = t.source_text;
        }
      }
      setGroups(grouped);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchAll(); }, [ns]);

  const save = async (id: number, text: string) => {
    const k = `${id}:${text}`;
    setSavingKey(k);
    try {
      await api.put(`/translations/${id}`, { translated_text: text });
    } catch { /* ignore */ }
    finally { setSavingKey(""); }
  };

  const groupKeys = Object.keys(groups).sort();
  const inputStyle = (isEmpty: boolean) => ({
    width: "100%", border: isEmpty ? "2px solid #FCD34D" : "1px solid var(--color-border-light)",
    borderRadius: "var(--radius-sm)", padding: "6px 8px", fontSize: 12,
    background: isEmpty ? "#FFFBEB" : "var(--color-bg-white)", boxSizing: "border-box" as const,
  });

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>Translations</h1>
          <p className="page-subtitle" style={{ marginTop: 4 }}>Review & edit auto-translated content — all 4 languages per field</p>
        </div>
        <select value={ns} onChange={e => setNs(e.target.value)} style={{ padding: "8px 12px", borderRadius: "var(--radius-sm)", fontSize: 14, fontWeight: 600 }}>
          {NAMESPACES.map(n => <option key={n} value={n}>{NAMESPACE_LABELS[n] || n}</option>)}
        </select>
      </div>
      {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}

      {loading ? <p>Loading...</p> : groupKeys.length === 0 ? (
        <div className="card" style={{ padding: 32, textAlign: "center", color: "var(--color-text-muted)" }}>
          <p style={{ fontSize: 16 }}>No translations yet</p>
          <p style={{ fontSize: 13, marginTop: 8 }}>Translations are auto-generated when you create or update content. Select a namespace above to view.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {groupKeys.map(key => {
            const content = groups[key];
            const fieldNames = Object.keys(content.fields).sort();
            const displayName = content.sourceText || key;

            return (
              <div key={key} className="card" style={{ padding: 14, border: "1px solid var(--color-border-light)" }}>
                {/* Content header */}
                <div style={{ marginBottom: 12 }}>
                  <span style={{ fontSize: 15, fontWeight: 700 }}>{displayName}</span>
                  <span style={{ fontSize: 11, color: "var(--color-text-muted)", marginLeft: 8 }}>
                    {fieldNames.length} field{fieldNames.length > 1 ? "s" : ""}
                  </span>
                </div>

                {/* Locale header row */}
                <div style={{ display: "grid", gridTemplateColumns: `140px repeat(${LOCALES.length}, 1fr)`, gap: 6, marginBottom: 6 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-muted)" }}></div>
                  {LOCALES.map(loc => (
                    <div key={loc} style={{ fontSize: 12, fontWeight: 600, textAlign: "center" }}>
                      {LOCALE_FLAGS[loc]} {LOCALE_NAMES[loc]}
                    </div>
                  ))}
                </div>

                {/* One row per field */}
                {fieldNames.map(field => {
                  const fg = content.fields[field];
                  return (
                    <div key={field} style={{ display: "grid", gridTemplateColumns: `140px repeat(${LOCALES.length}, 1fr)`, gap: 6, marginBottom: 4, alignItems: "center" }}>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-muted)", textTransform: "capitalize" }}>
                          {field.replace(/_/g, " ")}
                        </div>
                        {fg.sourceText && (
                          <div style={{ fontSize: 10, color: "var(--color-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 130 }}>
                            EN: {fg.sourceText.slice(0, 30)}
                          </div>
                        )}
                      </div>
                      {LOCALES.map(loc => {
                        const cell = fg.locales[loc];
                        const id = cell?.id || 0;
                        const text = cell?.text || "";
                        const isEmpty = !text;
                        const isSaving = savingKey === `${id}:${text}`;

                        return (
                          <div key={loc} style={{ position: "relative" }}>
                            <input
                              value={text}
                              onChange={e => {
                                if (!id) return;
                                setGroups(prev => {
                                  const g = { ...prev };
                                  const ck = key;
                                  if (g[ck]?.fields[field]?.locales[loc]) {
                                    g[ck].fields[field].locales[loc].text = e.target.value;
                                  }
                                  return g;
                                });
                              }}
                              onBlur={e => {
                                if (id && e.target.value !== (cell?.text || "")) {
                                  save(id, e.target.value);
                                }
                              }}
                              style={inputStyle(isEmpty)}
                              placeholder="—"
                            />
                            {isSaving && <span style={{ position: "absolute", right: 6, top: 6, fontSize: 10, color: "var(--color-info)" }}>...</span>}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ marginTop: 16, padding: 10, background: "var(--color-bg-muted)", borderRadius: "var(--radius-sm)", fontSize: 11, color: "var(--color-text-muted)" }}>
        <strong>How to use:</strong> Each card is one content item. Each row is a field (item_name, description, etc.) with 4 locale columns. Edit any cell and tab away to auto-save. <strong>Yellow</strong> = missing translation. Switch namespace at top right to view different content types.
      </div>
    </div>
  );
}
