"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ArrowLeft, Save, RefreshCw } from "lucide-react";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const inputClass = "w-full border rounded px-3 py-2 text-sm";
const labelClass = "block text-xs font-semibold text-gray-500 uppercase mb-1";
const sectionClass = "mb-6";
const sectionTitle = "text-sm font-bold uppercase text-gray-400 border-b pb-1 mb-3";

interface Store {
  id: number; store_name: string; store_code: string; slug: string;
  address_line_1: string; city: string; postal_code: string; country_code: string;
  phone_number: string; timezone: string; currency_code: string;
  is_active: boolean; is_accepting_orders: boolean;
}

type LocaleTab = "en" | "ms" | "zh" | "ta" | "tr";
const LOCALES: { code: LocaleTab; label: string; flag: string }[] = [
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "ms", label: "BM", flag: "🇲🇾" },
  { code: "zh", label: "中文", flag: "🇨🇳" },
  { code: "ta", label: "தமிழ்", flag: "🇮🇳" },
  { code: "tr", label: "TR", flag: "🇹🇷" },
];

const TRANSLATABLE_FIELDS = [
  // Basic (except store_code, slug)
  { key: "store_name", label: "Store Name" },
  { key: "brand_name", label: "Brand Name" },
  // Address
  { key: "address_line_1", label: "Address Line 1" },
  { key: "address_line_2", label: "Address Line 2" },
  { key: "city", label: "City" },
  { key: "state_province", label: "State/Province" },
];

const ALL_FIELDS: { section: string; fields: { key: string; label: string; type?: string }[] }[] = [
  { section: "Basic", fields: [
    { key: "store_name", label: "Store Name" },
    { key: "store_code", label: "Store Code" },
    { key: "slug", label: "Slug" },
    { key: "brand_name", label: "Brand Name" },
  ]},
  { section: "Sort Order", fields: [
    { key: "position", label: "Position", type: "number" },
  ]},
  { section: "Address", fields: [
    { key: "address_line_1", label: "Address Line 1" },
    { key: "address_line_2", label: "Address Line 2" },
    { key: "city", label: "City" },
    { key: "state_province", label: "State/Province" },
    { key: "postal_code", label: "Postal Code" },
    { key: "country_code", label: "Country (2-letter)", type: "country" },
  ]},
  { section: "Contact", fields: [
    { key: "phone_number", label: "Phone" },
    { key: "email_address", label: "Email" },
    { key: "timezone", label: "Timezone" },
    { key: "currency_code", label: "Currency" },
  ]},
  { section: "Location", fields: [
    { key: "latitude", label: "Latitude", type: "number" },
    { key: "longitude", label: "Longitude", type: "number" },
  ]},
  { section: "Operations", fields: [
    { key: "pickup_lead_minutes", label: "Pickup Lead (min)", type: "number" },
    { key: "delivery_radius_km", label: "Delivery Radius (km)", type: "number" },
    { key: "first_order_minutes_after_open", label: "First Order After Open (min)", type: "number" },
    { key: "last_order_minutes_before_close", label: "Last Order Before Close (min)", type: "number" },
  ]},
  { section: "Media", fields: [
    { key: "logo_url", label: "Logo URL" },
    { key: "banner_image_url", label: "Banner Image URL" },
  ]},
  { section: "Settings", fields: [
    { key: "is_active", label: "Active", type: "checkbox" },
    { key: "is_accepting_orders", label: "Accepting Orders", type: "checkbox" },
  ]},
];

export default function StoreEditPage() {
  const params = useParams();
  const router = useRouter();
  const storeId = params.id as string;

  const [store, setStore] = useState<Store | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeLocale, setActiveLocale] = useState<LocaleTab>("en");
  const [regenerating, setRegenerating] = useState<string>(""); // "field:locale"
  const [msg, setMsg] = useState("");
  const [specialHours, setSpecialHours] = useState<any[]>([]);

  // Form data — English source
  const [form, setForm] = useState<Record<string, any>>({});
  const [hours, setHours] = useState(DAYS.map((_, i) => ({ day_of_week: i, open_time: "08:00", close_time: "22:00", is_closed: false, is_24_hours: false, last_order_time: "" })));

  // Translations: { "zh:store_name": "value", ... }
  const [translations, setTranslations] = useState<Record<string, string>>({});

  const loadStore = async () => {
    setLoading(true);
    try {
      const d = await api.getRaw<any>(`/admin/stores/${storeId}`);
      setStore(d);
      const f: Record<string, any> = {};
      for (const section of ALL_FIELDS) {
        for (const field of section.fields) {
          f[field.key] = d[field.key] !== undefined ? d[field.key] : "";
        }
      }
      setForm(f);

      // Load operating hours
      if (d.operating_hours && Array.isArray(d.operating_hours)) {
        setHours(d.operating_hours);
      }
      if (d.special_hours && Array.isArray(d.special_hours)) {
        setSpecialHours(d.special_hours);
      }

      // Load translations for all locales — filtered by THIS store's record_id
      const allTr: Record<string, string> = {};
      const results = await Promise.all(
        LOCALES.filter(loc => loc.code !== "en").map(async (loc) => {
          try {
            const tr = await api.getRaw<{ items: { translation_key: string; translated_text: string; locale: string }[] }>(
              `/admin/translations?table_name=stores&record_id=${storeId}&locale=${loc.code}&per_page=100`
            );
            return { loc: loc.code, tr };
          } catch (e) { console.error(e); return { loc: loc.code, tr: null }; }
        })
      );
      for (const { loc, tr } of results) {
        if (tr?.items) {
          for (const t of tr.items) {
            const field = t.translation_key.split(".").pop() || "";
            allTr[`${loc}:${field}`] = t.translated_text || "";
          }
        }
      }
      setTranslations(allTr);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (!storeId) return;
    loadStore();
  }, [storeId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: any = { ...form };
      ["latitude","longitude","pickup_lead_minutes","delivery_radius_km","first_order_minutes_after_open","last_order_minutes_before_close","position"].forEach(k => {
        if (payload[k] === "" || payload[k] === undefined) { delete payload[k]; }
        else if (payload[k] !== null) payload[k] = Number(payload[k]);
      });
      payload.operating_hours = hours;
      payload.special_hours = specialHours;
      await api.patch(`/admin/stores/${storeId}`, payload);
      setMsg("Saved");
      setTimeout(() => setMsg(""), 2000);
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  const handleTranslate = async (field: string, locale: string) => {
    const sourceText = (form[field] || "").trim();
    if (!sourceText) return; // skip blank fields

    const key = `${locale}:${field}`;
    setRegenerating(key);
    try {
      const r: any = await api.post("/admin/translations/translate", {
        text: sourceText, source_locale: "en", target_locale: locale,
      });
      const translated = r?.translated_text;
      if (translated) {
        setTranslations(prev => ({ ...prev, [key]: translated }));
        // Save to DB — create or update
        await upsertTranslation(field, locale, sourceText, translated);
      }
    } catch (e) { console.error(e); }
    finally { setRegenerating(""); }
  };

  const handleRegenerateAll = async (locale: string) => {
    setRegenerating("all");
    const results: { field: string; text: string }[] = [];
    // Step 1: Generate all translations
    for (const field of TRANSLATABLE_FIELDS) {
      const sourceText = (form[field.key] || "").trim();
      if (!sourceText) continue;
      try {
        const r: any = await api.post("/admin/translations/translate", {
          text: sourceText, target_locale: locale, source_locale: "en",
        });
        const translated = r?.translated_text;
        if (translated) {
          results.push({ field: field.key, text: translated });
          setTranslations(prev => ({ ...prev, [`${locale}:${field.key}`]: translated }));
        }
      } catch (e) { console.error(e); }
    }
    // Step 2: Save all in one batch
    if (results.length > 0) {
      for (const r of results) {
        await upsertTranslation(r.field, locale, (form[r.field] || "").trim(), r.text);
      }
      setMsg(`Regenerated ${results.length} ${locale.toUpperCase()} translations & saved`);
    } else {
      setMsg("No translatable content found");
    }
    setTimeout(() => setMsg(""), 2500);
    setRegenerating("");
  };

  const upsertTranslation = async (field: string, locale: string, sourceText: string, translatedText: string) => {
    // Use record_id filter to find the exact translation for this store
    const allTr = await api.getRaw<{ items: { id: number; translation_key: string }[] }>(
      `/admin/translations?table_name=stores&record_id=${storeId}&column_name=${field}&locale=${locale}&per_page=1`
    );
    const existing = allTr?.items?.[0];
    if (existing) {
      await api.put(`/admin/translations/${existing.id}`, { translated_text: translatedText });
    } else {
      await api.post("/admin/translations", {
        translation_key: `stores.${storeId}.${field}`,
        locale: locale,
        namespace: "store",
        translated_text: translatedText,
        source_text: sourceText,
        table_name: "stores",
        record_id: Number(storeId),
        column_name: field,
      });
    }
  };

  const handleSaveTranslation = async (locale: string, field: string, text: string) => {
    const sourceText = form[field] || "";
    await upsertTranslation(field, locale, sourceText, text);
    setMsg("Translation saved");
    setTimeout(() => setMsg(""), 2000);
  };
  handleSaveTranslation; // keep reference for TS

  if (loading) return <div style={{ padding: 32 }}><p>Loading...</p></div>;
  if (!store) return <div style={{ padding: 32 }}><p>Store not found</p></div>;

  return (
    <div style={{ padding: 32 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={() => router.push("/stores")} className="btn btn-ghost btn-sm">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>{store.store_name}</h1>
          <p className="page-subtitle" style={{ marginTop: 2 }}>Edit store details & translations</p>
        </div>
      </div>
      {msg && <div className="alert alert-success" style={{ marginBottom: 12 }}>{msg}</div>}

      {/* Language Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "2px solid var(--color-border-light)", paddingBottom: 0 }}>
        {LOCALES.map(loc => (
          <button
            key={loc.code}
            onClick={() => setActiveLocale(loc.code)}
            style={{
              padding: "10px 20px",
              fontSize: 13,
              fontWeight: activeLocale === loc.code ? 700 : 400,
              border: "none",
              borderBottom: activeLocale === loc.code ? "3px solid var(--color-primary)" : "3px solid transparent",
              background: activeLocale === loc.code ? "rgba(59,74,26,0.05)" : "transparent",
              cursor: "pointer",
              color: activeLocale === loc.code ? "var(--color-primary)" : "var(--color-text-muted)",
              transition: "all 0.15s",
              borderRadius: "4px 4px 0 0",
            }}
          >
            {loc.flag} {loc.label}
          </button>
        ))}
      </div>

      {/* English Tab — All Fields */}
      {activeLocale === "en" && (
        <div className="card" style={{ padding: 24, maxWidth: 720 }}>
          <h3 style={{ marginBottom: 20 }}>English (Source Content)</h3>
          {ALL_FIELDS.map(section => (
            <div key={section.section} className={sectionClass}>
              <div className={sectionTitle}>{section.section}</div>
              <div className="df-grid">
                {section.fields.map(field => {
                  if (field.type === "checkbox") {
                    return (
                      <div className="df-field" key={field.key}>
                        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                          <input type="checkbox" checked={!!form[field.key]} onChange={e => setForm({ ...form, [field.key]: e.target.checked })} />
                          {field.label}
                        </label>
                      </div>
                    );
                  }
                  return (
                    <div className="df-field" key={field.key}>
                      <label className={labelClass}>{field.label}</label>
                      <input
                        type={field.type || "text"}
                        value={form[field.key] != null ? form[field.key] : ""}
                        onChange={e => setForm({ ...form, [field.key]: e.target.value })}
                        maxLength={field.type === "country" ? 2 : undefined}
                        placeholder={field.type === "country" ? "e.g. MY" : ""}
                        className={inputClass}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {/* Operating Hours */}
          <div className={sectionClass}>
            <div className={sectionTitle}>Operating Hours</div>
            {hours.map((h, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, opacity: h.is_closed ? 0.5 : 1, flexWrap: "wrap" }}>
                <span style={{ width: 40, fontSize: 13, fontWeight: 600 }}>{DAYS[i]}</span>
                <input type="time" value={h.open_time || "00:00"} onChange={e => { const hh = [...hours]; hh[i].open_time = e.target.value; setHours(hh); }} className={inputClass} style={{ width: 120 }} disabled={h.is_closed || h.is_24_hours} />
                <span style={{ fontSize: 12 }}>to</span>
                <input type="time" value={h.close_time || "23:59"} onChange={e => { const hh = [...hours]; hh[i].close_time = e.target.value; setHours(hh); }} className={inputClass} style={{ width: 120 }} disabled={h.is_closed || h.is_24_hours} />
                <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, marginLeft: 4 }}><input type="checkbox" checked={h.is_closed} onChange={e => { const hh = [...hours]; hh[i].is_closed = e.target.checked; setHours(hh); }} /> Closed</label>
                <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, marginLeft: 4 }}><input type="checkbox" checked={h.is_24_hours} onChange={e => { const hh = [...hours]; hh[i].is_24_hours = e.target.checked; if (e.target.checked) { hh[i].open_time = "00:00"; hh[i].close_time = "23:59"; } setHours(hh); }} /> 24h</label>
                {!h.is_closed && !h.is_24_hours && (
                  <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, marginLeft: 4 }}>
                    <span style={{ color: "var(--color-text-muted)" }}>Last order</span>
                    <input type="time" value={h.last_order_time || ""} onChange={e => { const hh = [...hours]; hh[i].last_order_time = e.target.value; setHours(hh); }} className={inputClass} style={{ width: 100 }} />
                  </label>
                )}
                {!h.is_closed && h.is_24_hours && (
                  <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, marginLeft: 4 }}>
                    <span style={{ color: "var(--color-text-muted)" }}>Last order</span>
                    <input type="time" value={h.last_order_time || ""} onChange={e => { const hh = [...hours]; hh[i].last_order_time = e.target.value; setHours(hh); }} className={inputClass} style={{ width: 100 }} />
                  </label>
                )}
              </div>
            ))}
          </div>
          {/* Special Hours */}
          <div className={sectionClass}>
            <div className={sectionTitle}>Special Hours (Holidays & Events)</div>
            {specialHours.map((sh: any, i: number) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, flexWrap: "wrap", opacity: sh.is_closed ? 0.5 : 1 }}>
                <input type="date" value={sh.special_date || ""} onChange={e => { const hh = [...specialHours]; hh[i].special_date = e.target.value; setSpecialHours(hh); }} className={inputClass} style={{ width: 140 }} title="Date" />
                <input type="text" value={sh.reason || ""} onChange={e => { const hh = [...specialHours]; hh[i].reason = e.target.value; setSpecialHours(hh); }} className={inputClass} style={{ width: 100 }} placeholder="Reason" />
                <input type="time" value={sh.open_time || ""} onChange={e => { const hh = [...specialHours]; hh[i].open_time = e.target.value; setSpecialHours(hh); }} className={inputClass} style={{ width: 110 }} disabled={sh.is_closed} title="Open" />
				<span style={{ fontSize: 12 }}>to</span>
                <input type="time" value={sh.close_time || ""} onChange={e => { const hh = [...specialHours]; hh[i].close_time = e.target.value; setSpecialHours(hh); }} className={inputClass} style={{ width: 110 }} disabled={sh.is_closed} title="Close" />
                <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}><input type="checkbox" checked={sh.is_closed} onChange={e => { const hh = [...specialHours]; hh[i].is_closed = e.target.checked; setSpecialHours(hh); }} /> Closed</label>
                <button type="button" onClick={() => setSpecialHours(shs => shs.filter((_s, idx) => idx !== i))} className="btn btn-ghost btn-sm" style={{ color: "var(--color-error)", fontSize: 11 }}>Remove</button>
              </div>
            ))}
            <button type="button" onClick={() => setSpecialHours([...specialHours, { special_date: "", reason: "", open_time: "", close_time: "", is_closed: false }])} className="btn btn-sm btn-outline" style={{ marginTop: 8 }}>+ Add Special Date</button>
          </div>
          <div className="df-actions">
            <button type="button" onClick={() => router.push("/stores")} className="btn btn-ghost">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="btn btn-primary"><Save size={16} /> {saving ? "Saving..." : "Save Changes"}</button>
          </div>
        </div>
      )}

      {/* Translation Tabs — MS, ZH, TA, TR */}
      {activeLocale !== "en" && (
        <div className="card" style={{ padding: 24, maxWidth: 720 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <h3 style={{ margin: 0, fontSize: 16 }}>
              {LOCALES.find(l => l.code === activeLocale)?.flag} {LOCALES.find(l => l.code === activeLocale)?.label} Translation
            </h3>
            <button onClick={() => handleRegenerateAll(activeLocale)} disabled={!!regenerating} className="btn btn-primary btn-sm" style={{ fontSize: 12, padding: "8px 16px" }}>
              <RefreshCw size={14} /> {regenerating === "all" ? "Generating..." : "Regenerate All"}
            </button>
          </div>

          {/* Same layout as EN tab — df-grid */}
          <div style={{ marginBottom: 20 }}>
            <h4 style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", color: "var(--color-text-muted)", borderBottom: "1px solid var(--color-border-light)", paddingBottom: 4, marginBottom: 10 }}>Basic & Address</h4>
            <div className="df-grid">
              {TRANSLATABLE_FIELDS.map(field => {
                const trKey = `${activeLocale}:${field.key}`;
                const translation = translations[trKey] || "";
                const sourceText = form[field.key] || "";
                return (
                  <div className="df-field" key={field.key}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-muted)", display: "flex", justifyContent: "space-between" }}>
                      <span>{field.label}</span>
                      <span style={{ fontWeight: 400, fontStyle: "italic" }}>EN: {sourceText?.slice(0, 30) || "—"}</span>
                    </label>
                    <input
                      value={translation}
                      onChange={e => setTranslations(prev => ({ ...prev, [trKey]: e.target.value }))}
                      style={{ width: "100%", padding: "8px 10px", fontSize: 13, border: translation ? "1px solid var(--color-border-light)" : "2px solid #FCD34D", borderRadius: "var(--radius-sm)", background: translation ? "var(--color-bg-white)" : "#FFFBEB" }}
                      placeholder={translation ? "" : "—"}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Non-translatable sections — hidden (store_code, slug, contact, location, operations, media, settings, hours) */}

          <div style={{ marginTop: 20 }}>
            <button
              onClick={async () => {
                for (const field of TRANSLATABLE_FIELDS) {
                  await handleSaveTranslation(activeLocale, field.key, translations[`${activeLocale}:${field.key}`] || "");
                }
                setMsg(`All ${activeLocale.toUpperCase()} translations saved`);
                setTimeout(() => setMsg(""), 2000);
              }}
              className="btn btn-primary"
              style={{ fontSize: 13, padding: "10px 24px" }}
            >
              <Save size={16} /> Save All Translations
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
