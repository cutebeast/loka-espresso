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

const LOCALES = ["ms", "zh", "ta", "tr"] as const;
const FLAGS: Record<string, string> = { ms: "🇲🇾", zh: "🇨🇳", ta: "🇮🇳", tr: "🇹🇷" };
const NAMES: Record<string, string> = { ms: "BM", zh: "中文", ta: "தமிழ்", tr: "TR" };

export default function StaffTranslationsTab() {
  const { t } = useTranslation();
  const [items, setItems] = useState<Translation[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [regenerating, setRegenerating] = useState<string | false>(false);
  const [translateProgress, setTranslateProgress] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const results = await Promise.all(
        ["en", ...LOCALES].map((loc) =>
          api.getRaw<{ items: Translation[] }>(`/admin/translations?namespace=staff-ui&locale=${loc}&per_page=200`)
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

  const keyMap = new Map<string, Record<string, Translation>>();
  for (const t of items) {
    if (!keyMap.has(t.translation_key)) keyMap.set(t.translation_key, {});
    keyMap.get(t.translation_key)![t.locale] = t;
  }
  const keys = [...keyMap.keys()].sort();

  const upsertTranslation = async (key: string, locale: string, translated_text: string, existing: Translation | undefined) => {
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
        namespace: "staff-ui",
        translated_text,
        source_text: "",
        table_name: "staff_ui",
        record_id: 0,
        column_name: "label",
      });
    }
  };

  const autoTranslateAll = async (locale: string) => {
    setRegenerating(locale);
    setTranslateProgress("");
    let count = 0;
    const CONCURRENCY = 5;

    const missingKeys: { key: string; source: string }[] = [];
    for (const key of keys) {
      const row = keyMap.get(key)!;
      if (row[locale]?.translated_text) continue;
      const enRecord = row["en"];
      const source = enRecord?.translated_text || enRecord?.source_text || "";
      if (!source) continue;
      missingKeys.push({ key, source });
    }

    let batchIndex = 0;
    const total = missingKeys.length;
    setTranslateProgress(`0 / ${total}`);
    while (batchIndex < total) {
      const batch = missingKeys.slice(batchIndex, batchIndex + CONCURRENCY);
      batchIndex += CONCURRENCY;

      const results = await Promise.allSettled(
        batch.map(async ({ key, source }) => {
          const existing = keyMap.get(key)!;
          const r = await api.post<{ translated_text?: string }>("/admin/translations/translate", {
            text: source,
            source_locale: "en",
            target_locale: locale,
          });
          if (r?.translated_text) {
            await upsertTranslation(key, locale, r.translated_text, existing[locale]);
          }
        })
      );
      count += results.filter(r => r.status === "fulfilled").length;
      setTranslateProgress(`${Math.min(batchIndex, total)} / ${total}`);
    }

    setMsg(t("admin.translations.autoTranslatedDone", { count, locale }));
    setTimeout(() => setMsg(""), 3000);
    fetchAll();
    setRegenerating(false);
    setTranslateProgress("");
  };

  if (loading) return <div style={{ padding: 24, opacity: 0.5 }}>{t("admin.translations.loading")}</div>;

  if (items.length === 0) {
    return (
      <div style={{ padding: 48, textAlign: "center" }}>
        <h2>{t("admin.translations.noTranslations")}</h2>
        <p style={{ color: "var(--color-text-muted)", marginBottom: 16 }}>
          {t("admin.translations.noTranslationsDesc")}
        </p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-muted)", marginRight: 4 }}>{t("admin.translations.translateAll")}:</span>
        {LOCALES.map((loc) => (
          <button key={loc} type="button" onClick={() => autoTranslateAll(loc)} disabled={!!regenerating}
            className="btn btn-sm btn-primary" style={{ fontSize: 12 }}>
            {FLAGS[loc]} {regenerating === loc ? "..." : t("admin.translations.allLocale", { locale: NAMES[loc]! })}
          </button>
        ))}
        {msg && <span style={{ fontSize: 12, color: "var(--color-success)", marginLeft: 8 }}>{msg}</span>}
        {translateProgress && <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{translateProgress}</span>}
      </div>

      <div className="table-container">
        <table className="data-table" style={{ fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ width: 200 }}>{t("admin.translations.key")}</th>
              <th style={{ width: 200 }}>{t("admin.translations.englishSource")}</th>
              {LOCALES.map((loc) => (
                <th key={loc} style={{ textAlign: "center", minWidth: 160 }}>{FLAGS[loc]} {NAMES[loc]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {keys.map((key) => {
              const row = keyMap.get(key)!;
              const enRecord = row["en"];
              const enText = enRecord?.translated_text || enRecord?.source_text || key;
              const shortKey = key.split(".").slice(1).join(".") || key;
              return (
                <tr key={key}>
                  <td style={{ fontSize: 11, fontFamily: "monospace", color: "var(--color-text-muted)" }}>{shortKey}</td>
                  <td style={{ fontSize: 12 }}>{enText}</td>
                  {LOCALES.map((loc) => {
                    const existing = row[loc];
                    const value = existing?.translated_text || "";
                    return (
                      <td key={loc} style={{ padding: 4 }}>
                        <input type="text"
                          value={drafts[`${key}:${loc}`] ?? value}
                          placeholder={value ? "" : "—"}
                          onChange={(e) => setDrafts((prev) => ({ ...prev, [`${key}:${loc}`]: e.target.value }))}
                          onBlur={async (e) => {
                            const newVal = e.target.value.trim();
                            const current = value || "";
                            if (newVal && newVal !== current) {
                              try {
                                await upsertTranslation(key, loc, newVal, existing);
                                setMsg(t("admin.translations.saved"));
                                setTimeout(() => setMsg(""), 2000);
                              } catch (err) { console.error(err); }
                            }
                          }}
                          onKeyDown={async (e) => {
                            if (e.key === "Enter") {
                              const newVal = (e.target as HTMLInputElement).value.trim();
                              const current = value || "";
                              if (newVal && newVal !== current) {
                                try {
                                  await upsertTranslation(key, loc, newVal, existing);
                                  setMsg(t("admin.translations.saved"));
                                  setTimeout(() => setMsg(""), 2000);
                                } catch (err) { console.error(err); }
                              }
                              (e.target as HTMLInputElement).blur();
                            }
                          }}
                          className="form-input"
                          style={{ fontSize: 12, padding: "4px 6px", width: "100%",
                            border: value ? "1px solid var(--color-border, #d1d5db)" : "1px dashed var(--color-border-light, #e5e7eb)",
                            background: value ? "white" : "var(--color-bg-warm, #fefce8)", }}
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
      <div style={{ marginTop: 8, fontSize: 11, color: "var(--color-text-muted)" }}>
        {t("admin.translations.keyCount", { count: keys.length })}
      </div>
    </div>
  );
}
