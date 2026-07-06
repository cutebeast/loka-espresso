"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";

interface Translation {
  id: number;
  translation_key: string;
  locale: string;
  translated_text: string | null;
  source_text: string | null;
  namespace: string;
}

const LOCALES = ["en", "ms", "zh", "ta", "tr"] as const;
const FLAGS: Record<string, string> = { en: "🇬🇧", ms: "🇲🇾", zh: "🇨🇳", ta: "🇮🇳", tr: "🇹🇷" };
const NAMES: Record<string, string> = { en: "EN", ms: "BM", zh: "中文", ta: "தமிழ்", tr: "TR" };
const NAMESPACE = "admin-ui";

function humanizeSection(section: string): string {
  return section.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
}

export default function AdminTranslationsTab() {
  const { t } = useTranslation();
  const [items, setItems] = useState<Translation[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<string>("");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState<number | null>(null);
  const [msg, setMsg] = useState("");

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const results = await Promise.all(
        LOCALES.map((loc) =>
          api
            .getRaw<{ items: Translation[] }>(`/admin/translations?namespace=${NAMESPACE}&locale=${loc}&per_page=2000`)
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

  const sections = Array.from(new Set(items.map((t) => t.translation_key.split(".")[0] || "other"))).sort();
  const activeItems = items.filter(
    (t) => (t.translation_key.split(".")[0] || "other") === activeSection &&
    (!search || t.translation_key.includes(search))
  );

  const keyMap = new Map<string, Record<string, Translation>>();
  for (const t of activeItems) {
    if (!keyMap.has(t.translation_key)) keyMap.set(t.translation_key, {});
    keyMap.get(t.translation_key)![t.locale] = t;
  }
  const keys = [...keyMap.keys()].sort();

  const upsertTranslation = async (
    key: string,
    locale: string,
    translated_text: string,
    existing: Translation | undefined
  ) => {
    if (existing) {
      await api.put(`/admin/translations/${existing.id}`, {
        translated_text,
        translation_key: existing.translation_key,
        locale: existing.locale,
        namespace: existing.namespace,
      });
    } else {
      await api.post("/admin/translations", {
        translation_key: key,
        locale,
        namespace: NAMESPACE,
        translated_text,
        source_text: locale === "en" ? translated_text : "",
        table_name: "admin_ui",
      });
    }
  };

  const handleCellBlur = async (key: string, locale: string, value: string, existing: Translation | undefined) => {
    if (!value.trim()) return;
    setSaving(Date.now());
    try {
      await upsertTranslation(key, locale, value.trim(), existing);
      setMsg(t("admin.translations.saved"));
      setTimeout(() => setMsg(""), 2000);
      fetchAll();
    } catch (e) { console.error(e); }
    finally { setSaving(null); }
  };

  const autoTranslateAll = async (locale: string) => {
    if (locale === "en") return;
    setSaving(Date.now());
    setMsg(t("admin.translations.autoTranslating", { locale }));
    try {
      const allKeyMap = new Map<string, Record<string, Translation>>();
      for (const t of items) {
        if (!allKeyMap.has(t.translation_key)) allKeyMap.set(t.translation_key, {});
        allKeyMap.get(t.translation_key)![t.locale] = t;
      }
      const missing: { key: string; source: string }[] = [];
      for (const key of [...allKeyMap.keys()]) {
        const row = allKeyMap.get(key)!;
        if (row[locale]?.translated_text) continue;
        const source = row["en"]?.translated_text || "";
        if (!source) continue;
        missing.push({ key, source });
      }
      const CONCURRENCY = 5;
      let count = 0;
      for (let i = 0; i < missing.length; i += CONCURRENCY) {
        const batch = missing.slice(i, i + CONCURRENCY);
        const results = await Promise.allSettled(
          batch.map(async ({ key, source }) => {
            const row = allKeyMap.get(key)!;
            const r = await api.post<{ translated_text?: string }>("/admin/translations/translate", {
              text: source,
              source_locale: "en",
              target_locale: locale,
            });
            if (r?.translated_text) {
              await upsertTranslation(key, locale, r.translated_text, row[locale]);
            }
          })
        );
        count += results.filter((r) => r.status === "fulfilled").length;
        setMsg(t("admin.translations.autoTranslatedProgress", { current: Math.min(i + CONCURRENCY, missing.length), total: missing.length }));
      }
      setMsg(t("admin.translations.autoTranslatedDone", { count, locale }));
      fetchAll();
    } catch {
      setMsg(t("admin.translations.autoTranslateFailed"));
    } finally {
      setSaving(null);
      setTimeout(() => setMsg(""), 3000);
    }
  };

  if (loading) {
    return <div style={{ padding: 24, opacity: 0.5 }}>{t("admin.translations.loading")}</div>;
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-muted)", marginRight: 4 }}>{t("admin.translations.translateAll")}:</span>
        {LOCALES.filter((loc) => loc !== "en").map((loc) => (
          <button
            key={loc}
            type="button"
            onClick={() => autoTranslateAll(loc)}
            disabled={!!saving}
            className="btn btn-sm btn-primary"
            style={{ fontSize: 12 }}
          >
            {FLAGS[loc]} {saving ? "..." : t("admin.translations.allLocale", { locale: NAMES[loc]! })}
          </button>
        ))}
        {msg && <span style={{ fontSize: 12, color: "var(--color-success, #16a34a)", marginLeft: 8 }}>{msg}</span>}
      </div>

      <div style={{ display: "flex", gap: 0, minHeight: 400 }}>
        <div style={{ width: 200, flexShrink: 0, borderRight: "1px solid var(--color-border-light, #e5e7eb)", paddingRight: 12 }}>
          <input
            type="text"
            placeholder={t("admin.translations.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="form-input"
            style={{ marginBottom: 12, fontSize: 12 }}
            aria-label={t("admin.translations.searchAriaLabel")}
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
            >
              {humanizeSection(s)}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, paddingLeft: 20, overflow: "auto" }}>
          {activeSection ? (
            <>
              <h3 style={{ margin: "0 0 12px", fontSize: 16 }}>
                {humanizeSection(activeSection)}
              </h3>
              {keys.length === 0 ? (
                <p style={{ opacity: 0.5 }}>{t("admin.translations.noKeys")}</p>
              ) : (
                <div className="table-container">
                  <table className="data-table" style={{ fontSize: 12 }}>
                    <thead>
                      <tr>
                        <th style={{ width: 200 }}>{t("admin.translations.key")}</th>
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
                        const shortKey = key.split(".").slice(1).join(".") || key;
                        return (
                          <tr key={key}>
                            <td style={{ fontSize: 11, fontFamily: "monospace", color: "var(--color-text-muted)" }}>{shortKey}</td>
                            {LOCALES.map((loc) => {
                              const existing = row[loc];
                              const value = existing?.translated_text || "";
                              return (
                                <td key={loc} style={{ padding: 4 }}>
                                  <input
                                    type="text"
                                    defaultValue={value}
                                    placeholder={loc === "en" ? t("admin.translations.englishSource") : "—"}
                                    onBlur={(e) => {
                                      const newVal = e.target.value;
                                      if (newVal !== (value || "")) {
                                        handleCellBlur(key, loc, newVal, existing);
                                      }
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        const newVal = (e.target as HTMLInputElement).value;
                                        if (newVal !== (value || "")) {
                                          handleCellBlur(key, loc, newVal, existing);
                                        }
                                        (e.target as HTMLInputElement).blur();
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
                {t("admin.translations.keyCount", { count: keys.length })}
              </div>
            </>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", opacity: 0.5 }}>
              {t("admin.translations.selectSection")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
