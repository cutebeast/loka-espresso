/**
 * Customer PWA Translations Tab
 *
 * Lists PWA UI labels grouped by section. Supports viewing/editing translations
 * across all 4 locales (ms, zh, ta, tr) with auto-translate on demand.
 */
"use client";
import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";

interface Translation {
  id: number;
  translation_key: string;
  locale: string;
  translated_text: string | null;
  source_text: string | null;
  namespace: string;
}

const LOCALES = ["ms", "zh", "ta", "tr"] as const;
const FLAGS: Record<string, string> = { ms: "🇲🇾", zh: "🇨🇳", ta: "🇮🇳", tr: "🇹🇷" };
const NAMES: Record<string, string> = { ms: "BM", zh: "中文", ta: "தமிழ்", tr: "TR" };

const SECTIONS = [
  "accountDetails", "auth", "cart", "checkout", "common", "errorBoundary",
  "events", "helpSupport", "history", "home", "information", "legal", "menu",
  "myCard", "myRewards", "nav", "notifications", "orderDetail", "orders",
  "paymentMethods", "profile", "promotions", "qr", "referral", "reservations",
  "rewards", "savedAddresses", "settings", "store", "storePicker", "surveys",
  "toast", "voucher", "wallet",
];

function sectionFor(key: string): string {
  return key.split(".")[0] || "other";
}

export default function PwaTranslationsTab() {
  const [items, setItems] = useState<Translation[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<string>("");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState<number | null>(null);
  const [msg, setMsg] = useState("");
  const [regenerating, setRegenerating] = useState(false);

  // Fetch all PWA translations
  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const results = await Promise.all(
        LOCALES.map((loc) =>
          api
            .getRaw<{ items: Translation[] }>(`/translations?namespace=pwa-ui&locale=${loc}&per_page=500`)
            .catch((e) => { console.error(`Failed to fetch ${loc}:`, e); return null; })
        )
      );
      const all: Translation[] = [];
      for (const r of results) {
        if (r?.items) all.push(...r.items);
      }
      setItems(all);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Group by section
  const sections = SECTIONS.filter((s) => items.some((t) => sectionFor(t.translation_key) === s));
  const activeItems = items.filter(
    (t) => sectionFor(t.translation_key) === activeSection &&
    (!search || t.translation_key.includes(search))
  );

  // Deduplicate by key (show one row per key, columns = locales)
  const keyMap = new Map<string, Record<string, Translation>>();
  for (const t of activeItems) {
    if (!keyMap.has(t.translation_key)) keyMap.set(t.translation_key, {});
    keyMap.get(t.translation_key)![t.locale] = t;
  }

  const keys = [...keyMap.keys()].sort();

  // Upsert a single translation
  const upsertTranslation = async (
    key: string,
    locale: string,
    translated_text: string,
    existing: Translation | undefined
  ) => {
    if (existing) {
      await api.put(`/translations/${existing.id}`, {
        translated_text,
        translation_key: existing.translation_key,
        locale: existing.locale,
        namespace: existing.namespace,
      });
    } else {
      const section = sectionFor(key);
      await api.post("/translations", {
        translation_key: key,
        locale,
        namespace: "pwa-ui",
        translated_text,
        source_text: "",
        table_name: "pwa_ui",
        record_id: 0,
        column_name: "label",
      });
    }
  };

  // Handle cell edit
  const handleCellBlur = async (key: string, locale: string, value: string, existing: Translation | undefined) => {
    if (!value.trim()) return;
    setSaving(Date.now());
    try {
      await upsertTranslation(key, locale, value.trim(), existing);
      setMsg("Saved");
      setTimeout(() => setMsg(""), 2000);
      fetchAll(); // Refresh
    } catch (e) { console.error(e); }
    finally { setSaving(null); }
  };

  // Auto-translate all missing keys for a locale
  const autoTranslate = async (locale: string) => {
    setRegenerating(true);
    let count = 0;
    for (const key of [...keyMap.keys()]) {
      const existing = keyMap.get(key)!;
      if (existing[locale]?.translated_text) continue; // Already has translation
      // Get English source
      const en = existing["en"] || items.find(t => t.translation_key === key && t.locale === "en");
      const source = en?.source_text || en?.translated_text || "";
      if (!source) continue;
      try {
        const r = await api.post<{ translated_text?: string }>("/translations/translate", {
          text: source,
          source_locale: "en",
          target_locale: locale,
        });
        if (r?.translated_text) {
          await upsertTranslation(key, locale, r.translated_text, existing[locale]);
          count++;
        }
      } catch (e) { console.error(e); }
    }
    setMsg(`Auto-translated ${count} keys for ${locale}`);
    setTimeout(() => setMsg(""), 3000);
    fetchAll();
    setRegenerating(false);
  };

  if (loading) {
    return <div style={{ padding: 24, opacity: 0.5 }}>Loading PWA translations...</div>;
  }

  if (items.length === 0) {
    return (
      <div style={{ padding: 48, textAlign: "center" }}>
        <h2>No PWA translations in database</h2>
        <p style={{ color: "var(--color-text-muted)", marginBottom: 16 }}>
          Run the seed script to import PWA UI labels from en.json:
        </p>
        <code style={{ background: "var(--color-bg-muted)", padding: "8px 16px", borderRadius: 6 }}>
          cd v3/backend && python scripts/seed_pwa_translations.py
        </code>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: 0, minHeight: 400 }}>
      {/* Left sidebar — sections */}
      <div style={{ width: 200, flexShrink: 0, borderRight: "1px solid var(--color-border-light, #e5e7eb)", paddingRight: 12 }}>
        <input
          type="text"
          placeholder="Search keys..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="form-input"
          style={{ marginBottom: 12, fontSize: 12 }}
          aria-label="Search translation keys"
        />
        {sections.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setActiveSection(s)}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              padding: "6px 10px",
              border: "none",
              borderRadius: 6,
              background: activeSection === s ? "var(--color-primary-alpha, rgba(59,74,26,0.1))" : "transparent",
              fontWeight: activeSection === s ? 600 : 400,
              color: activeSection === s ? "var(--color-primary, #3B4A1A)" : "inherit",
              cursor: "pointer",
              fontSize: 13,
              marginBottom: 2,
            }}
            aria-label={`PWA section: ${s}`}
          >
            {s.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())}
          </button>
        ))}
      </div>

      {/* Right — translation grid */}
      <div style={{ flex: 1, paddingLeft: 20, overflow: "auto" }}>
        {activeSection ? (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>
                {activeSection.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())}
              </h3>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {msg && <span style={{ fontSize: 12, color: "var(--color-success, #16a34a)" }}>{msg}</span>}
                {LOCALES.map((loc) => (
                  <button
                    key={loc}
                    type="button"
                    onClick={() => autoTranslate(loc)}
                    disabled={regenerating}
                    className="btn btn-sm btn-outline"
                    style={{ fontSize: 12 }}
                    aria-label={`Auto-translate to ${loc}`}
                  >
                    {FLAGS[loc]} Auto {NAMES[loc]}
                  </button>
                ))}
              </div>
            </div>
            {keys.length === 0 ? (
              <p style={{ opacity: 0.5 }}>No keys match your search.</p>
            ) : (
              <div className="table-container">
                <table className="data-table" style={{ fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th style={{ width: 200 }}>Key</th>
                      <th style={{ width: 200 }}>EN (source)</th>
                      {LOCALES.map((loc) => (
                        <th key={loc} style={{ textAlign: "center", minWidth: 160 }}>
                          {FLAGS[loc]} {NAMES[loc]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {keys.map((key) => {
                      const row = keyMap.get(key)!;
                      const enText = row["en"]?.translated_text || row["en"]?.source_text || "";
                      const shortKey = key.split(".").slice(1).join(".") || key;
                      return (
                        <tr key={key}>
                          <td style={{ fontSize: 11, fontFamily: "monospace", color: "var(--color-text-muted)" }}>{shortKey}</td>
                          <td style={{ fontSize: 12, color: "var(--color-text-primary)" }}>{enText}</td>
                          {LOCALES.map((loc) => {
                            const existing = row[loc];
                            const value = existing?.translated_text || "";
                            return (
                              <td key={loc} style={{ padding: 4 }}>
                                <input
                                  type="text"
                                  defaultValue={value}
                                  placeholder={value ? "" : "—"}
                                  onBlur={(e) => {
                                    const newVal = e.target.value;
                                    if (newVal !== (value || "")) {
                                      handleCellBlur(key, loc, newVal, existing);
                                    }
                                  }}
                                  className="form-input"
                                  style={{
                                    fontSize: 12,
                                    padding: "4px 6px",
                                    width: "100%",
                                    border: value ? "1px solid var(--color-border, #d1d5db)" : "1px dashed var(--color-border-light, #e5e7eb)",
                                    background: value ? "white" : "var(--color-bg-warm, #fefce8)",
                                  }}
                                  aria-label={`Translate ${shortKey} to ${loc}`}
                                />
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div style={{ marginTop: 8, fontSize: 11, color: "var(--color-text-muted)" }}>
              {keys.length} key{keys.length !== 1 ? "s" : ""} in this section
            </div>
          </>
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", opacity: 0.5 }}>
            Select a section from the left to view translations
          </div>
        )}
      </div>
    </div>
  );
}
