"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ArrowLeft, Save, RefreshCw } from "lucide-react";
import { useAudienceSegments } from "@/lib/useAudienceSegments";

type LocaleTab = "en" | "ms" | "zh" | "ta" | "tr";
const LOCALES: { code: LocaleTab; label: string; flag: string }[] = [
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "ms", label: "BM", flag: "🇲🇾" },
  { code: "zh", label: "中文", flag: "🇨🇳" },
  { code: "ta", label: "தமிழ்", flag: "🇮🇳" },
  { code: "tr", label: "TR", flag: "🇹🇷" },
];

const TRANSLATABLE_FIELDS = [
  { key: "display_title", label: "Display Title" },
  { key: "short_description", label: "Short Description" },
  { key: "long_description", label: "Full Description" },
  { key: "how_to_redeem", label: "How to Redeem" },
  { key: "terms_and_conditions", label: "Terms & Conditions" },
];

interface Voucher {
  id: number; voucher_code: string; display_title: string; voucher_type: string;
  description?: string; short_description?: string; long_description?: string;
  discount_value: number; minimum_order_value?: number;
  max_global_uses?: number; global_use_count?: number;
  max_uses_per_customer?: number; validity_days?: number;
  valid_from?: string; valid_until?: string;
  promo_type?: string; how_to_redeem?: string; terms_and_conditions?: string;
  customer_segments?: string[]; is_active: boolean;
}

export default function VoucherEditPage() {
  const params = useParams();
  const router = useRouter();
  const voucherId = params.id as string;
  const { allSegments } = useAudienceSegments();

  const [voucher, setVoucher] = useState<Voucher | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeLocale, setActiveLocale] = useState<LocaleTab>("en");
  const [regenerating, setRegenerating] = useState<string>("");
  const [msg, setMsg] = useState("");

  const [form, setForm] = useState<Record<string, any>>({});
  const [translations, setTranslations] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!voucherId) return;
    loadVoucher();
  }, [voucherId]);

  const loadVoucher = async () => {
    setLoading(true);
    try {
      const d = await api.getRaw<Voucher>(`/admin/vouchers/${voucherId}`);
      setVoucher(d);
      setForm({
        voucher_code: d.voucher_code || "",
        display_title: d.display_title || "",
        voucher_type: d.voucher_type || "fixed_amount_off",
        discount_value: d.voucher_type === "percentage_off" ? Math.round((d.discount_value || 0) * 100) : (d.discount_value || 0),
        minimum_order_value: d.minimum_order_value || 0,
        max_uses_per_customer: d.max_uses_per_customer || 1,
        max_global_uses: d.max_global_uses || "",
        validity_days: d.validity_days != null ? String(d.validity_days) : "",
        valid_from: d.valid_from?.slice(0, 16) || "",
        valid_until: d.valid_until?.slice(0, 16) || "",
        promo_type: d.promo_type || "generic",
        description: d.description || "",
        short_description: d.short_description || "",
        long_description: d.long_description || "",
        how_to_redeem: d.how_to_redeem || "",
        terms_and_conditions: d.terms_and_conditions || "",
        is_active: d.is_active,
        customer_segments: d.customer_segments||[],
      });

      // Load translations
      const allTr: Record<string, string> = {};
      for (const loc of LOCALES) {
        if (loc.code === "en") continue;
        try {
          const tr = await api.getRaw<{ items: { translation_key: string; translated_text: string; locale: string }[] }>(
            `/translations?table_name=voucher_definitions&record_id=${voucherId}&locale=${loc.code}&per_page=50`
          );
          if (tr?.items) {
            for (const t of tr.items) {
              const field = t.translation_key.split(".").pop() || "";
              allTr[`${loc.code}:${field}`] = t.translated_text || "";
            }
          }
        } catch { /* ignore */ }
      }
      setTranslations(allTr);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { ...form };
      if (!payload.max_global_uses) payload.max_global_uses = null;
      else payload.max_global_uses = Number(payload.max_global_uses);
      payload.validity_days = form.validity_days ? Number(form.validity_days) : null;
      payload.max_uses_per_customer = Number(form.max_uses_per_customer) || 1;
      payload.minimum_order_value = Number(form.minimum_order_value) || 0;
      if (form.voucher_type === "percentage_off") {
        payload.discount_value = Number(form.discount_value) / 100;
      } else {
        payload.discount_value = Number(form.discount_value);
      }
      await api.put(`/admin/vouchers/${voucherId}`, payload);
      setMsg("Saved");
      setTimeout(() => setMsg(""), 2000);
    } catch { /* ignore */ }
    finally { setSaving(false); }
  };

  const upsertTranslation = async (field: string, locale: string, sourceText: string, translatedText: string) => {
    const allTr = await api.getRaw<{ items: { id: number; translation_key: string }[] }>(
      `/translations?table_name=voucher_definitions&record_id=${voucherId}&column_name=${field}&locale=${locale}&per_page=1`
    );
    const existing = allTr?.items?.[0];
    if (existing) {
      await api.put(`/translations/${existing.id}`, { translated_text: translatedText });
    } else {
      await api.post("/translations", {
        translation_key: `voucher_definitions.${voucherId}.${field}`,
        locale: locale,
        namespace: "voucher",
        translated_text: translatedText,
        source_text: sourceText,
        table_name: "voucher_definitions",
        record_id: Number(voucherId),
        column_name: field,
      });
    }
  };

  const handleRegenerateAll = async (locale: string) => {
    setRegenerating("all");
    const results: { field: string; text: string }[] = [];
    for (const field of TRANSLATABLE_FIELDS) {
      const sourceText = (form[field.key] || "").trim();
      if (!sourceText) continue;
      try {
        const r: any = await api.post("/translations/translate", {
          text: sourceText, target_locale: locale, source_locale: "en",
        });
        const translated = r?.translated_text;
        if (translated) {
          results.push({ field: field.key, text: translated });
          setTranslations(prev => ({ ...prev, [`${locale}:${field.key}`]: translated }));
        }
      } catch { /* ignore */ }
    }
    for (const r of results) {
      await upsertTranslation(r.field, locale, (form[r.field] || "").trim(), r.text);
    }
    setMsg(results.length > 0 ? `Regenerated ${results.length} ${locale.toUpperCase()} translations & saved` : "No translatable content found");
    setTimeout(() => setMsg(""), 2500);
    setRegenerating("");
  };

  const handleSaveTranslations = async (locale: string) => {
    setSaving(true);
    for (const field of TRANSLATABLE_FIELDS) {
      const trKey = `${locale}:${field.key}`;
      const text = translations[trKey] || "";
      if (text.trim()) {
        await upsertTranslation(field.key, locale, form[field.key] || "", text);
      }
    }
    setMsg(`All ${locale.toUpperCase()} translations saved`);
    setTimeout(() => setMsg(""), 2000);
    setSaving(false);
  };

  if (loading) return <div style={{ padding: 32 }}><p>Loading...</p></div>;
  if (!voucher) return <div style={{ padding: 32 }}><p>Voucher not found</p></div>;

  return (
    <div style={{ padding: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={() => router.push("/vouchers")} className="btn btn-ghost btn-sm"><ArrowLeft size={18} /></button>
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>{voucher.display_title}</h1>
          <p className="page-subtitle" style={{ marginTop: 2 }}>Edit voucher details & translations</p>
        </div>
      </div>
      {msg && <div className="alert alert-success" style={{ marginBottom: 12 }}>{msg}</div>}

      {/* Language Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "2px solid var(--color-border-light)", paddingBottom: 0 }}>
        {LOCALES.map(loc => (
          <button key={loc.code} onClick={() => setActiveLocale(loc.code)}
            style={{
              padding: "10px 20px", fontSize: 13,
              fontWeight: activeLocale === loc.code ? 700 : 400,
              border: "none",
              borderBottom: activeLocale === loc.code ? "3px solid var(--color-primary)" : "3px solid transparent",
              background: activeLocale === loc.code ? "rgba(59,74,26,0.05)" : "transparent",
              cursor: "pointer",
              color: activeLocale === loc.code ? "var(--color-primary)" : "var(--color-text-muted)",
              borderRadius: "4px 4px 0 0",
            }}
          >{loc.flag} {loc.label}</button>
        ))}
      </div>

      {/* English Tab — All Fields */}
      {activeLocale === "en" && (
        <div className="card" style={{ padding: 24, maxWidth: 700 }}>
          <h3 style={{ marginBottom: 20 }}>English (Source Content)</h3>
          <div className="df-grid">
            <div className="df-field"><label className="df-label">Code *</label><input required value={form.voucher_code} onChange={e => setForm({ ...form, voucher_code: e.target.value })} /><div className="df-hint">Customer-facing code</div></div>
            <div className="df-field"><label className="df-label">Title *</label><input required value={form.display_title} onChange={e => setForm({ ...form, display_title: e.target.value })} /></div>
            <div className="df-field">
              <label className="df-label">Type</label>
              <select value={form.voucher_type} onChange={e => { setForm({ ...form, voucher_type: e.target.value, discount_value: 0 }); }}>
                <option value="percentage_off">Percentage Off (%)</option>
                <option value="fixed_amount_off">Fixed Amount (RM)</option>
                <option value="free_item">Free Item</option>
              </select>
            </div>
            <div className="df-field">
              <label className="df-label">{form.voucher_type === "free_item" ? "Max Value (RM)" : form.voucher_type === "percentage_off" ? "Discount %" : "Discount (RM)"}</label>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="number" required step={form.voucher_type === "percentage_off" ? "1" : "0.01"} min="0" value={form.discount_value} onChange={e => setForm({ ...form, discount_value: Number(e.target.value) })} style={{ flex: 1 }} />
                {form.voucher_type === "percentage_off" && <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>%</span>}
              </div>
              {form.voucher_type === "percentage_off" && <div className="df-hint">Enter percentage like 50 for 50% off</div>}
            </div>
            <div className="df-field"><label className="df-label">Min Order Value (RM)</label><input type="number" step="0.01" min="0" value={form.minimum_order_value} onChange={e => setForm({ ...form, minimum_order_value: Number(e.target.value) })} /></div>
            <div className="df-field"><label className="df-label">Max Uses Per Customer</label><input type="number" min="1" value={form.max_uses_per_customer} onChange={e => setForm({ ...form, max_uses_per_customer: Number(e.target.value) })} /></div>
            <div className="df-field"><label className="df-label">Max Global Uses</label><input type="number" min="1" value={form.max_global_uses} onChange={e => setForm({ ...form, max_global_uses: e.target.value })} /></div>
            <div className="df-field"><label className="df-label">Validity (days)</label><input type="number" value={form.validity_days} onChange={e => setForm({ ...form, validity_days: e.target.value })} /></div>
            <div className="df-field"><label className="df-label">Promo Type</label><select value={form.promo_type} onChange={e => setForm({ ...form, promo_type: e.target.value })}><option value="generic">Generic</option><option value="bogo">BOGO (Buy One Get One)</option><option value="happy_hour">Happy Hour</option><option value="seasonal">Seasonal</option></select>            </div>
            <div className="df-field" style={{ gridColumn: "1/-1" }}>
              <label className="df-label">Target Customer Segments</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {allSegments.map(seg=>{
                  const isSelected = (form.customer_segments||[]).includes(seg.value);
                  return <button type="button" key={seg.value} onClick={()=>{
                    const arr = form.customer_segments||[];
                    setForm({...form, customer_segments: isSelected ? arr.filter((x:string)=>x!==seg.value) : [...arr, seg.value]});
                  }} style={{ display:"inline-flex",alignItems:"center",gap:4,padding:"4px 12px",borderRadius:"var(--radius-full)",fontSize:12,fontWeight:500,cursor:"pointer",border:isSelected?"2px solid var(--color-primary)":"1px solid var(--color-border-light)",background:isSelected?"rgba(59,74,26,0.08)":"var(--color-bg-white)",color:isSelected?"var(--color-primary)":"var(--color-text-muted)"}}>{isSelected&&"✓ "}{seg.label}</button>;
                })}
              </div>
              <div className="df-hint">Leave empty for all customers</div>
            </div>
            <div className="df-field"><label className="df-label">Valid From</label><input type="datetime-local" value={form.valid_from} onChange={e => setForm({ ...form, valid_from: e.target.value })} /></div>
            <div className="df-field"><label className="df-label">Valid Until</label><input type="datetime-local" value={form.valid_until} onChange={e => setForm({ ...form, valid_until: e.target.value })} /></div>
            <div className="df-field" style={{ gridColumn: "1/-1" }}><label className="df-label">Short Description</label><input value={form.short_description} onChange={e => setForm({ ...form, short_description: e.target.value })} placeholder="Brief summary" /></div>
            <div className="df-field" style={{ gridColumn: "1/-1" }}><label className="df-label">Full Description</label><textarea rows={3} value={form.long_description} onChange={e => setForm({ ...form, long_description: e.target.value })} placeholder="Full details" /></div>
            <div className="df-field" style={{ gridColumn: "1/-1" }}><label className="df-label">How to Redeem</label><textarea rows={2} value={form.how_to_redeem} onChange={e => setForm({ ...form, how_to_redeem: e.target.value })} placeholder="Instructions for customer" /></div>
            <div className="df-field" style={{ gridColumn: "1/-1" }}><label className="df-label">Terms & Conditions</label><textarea rows={2} value={form.terms_and_conditions} onChange={e => setForm({ ...form, terms_and_conditions: e.target.value })} placeholder="Legal terms" /></div>
            <div className="df-field"><label className="df-label" style={{ display: "flex", alignItems: "center", gap: 8 }}><input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} /> Active</label></div>
          </div>
           <div className="df-actions" style={{ marginTop: 20 }}>
             <button type="button" onClick={() => router.push("/vouchers")} className="btn btn-ghost">Cancel</button>
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
          <div className="df-grid">
            {TRANSLATABLE_FIELDS.map(field => {
              const trKey = `${activeLocale}:${field.key}`;
              const translation = translations[trKey] || "";
              const sourceText = form[field.key] || "";
              const isLong = field.key === "long_description" || field.key === "how_to_redeem" || field.key === "terms_and_conditions";
              return (
                <div className="df-field" key={field.key} style={isLong ? { gridColumn: "1/-1" } : {}}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-muted)", display: "flex", justifyContent: "space-between" }}>
                    <span>{field.label}</span>
                    <span style={{ fontWeight: 400, fontStyle: "italic" }}>EN: {sourceText?.slice(0, 30) || "—"}</span>
                  </label>
                  {isLong ? (
                    <textarea rows={3} value={translation} onChange={e => setTranslations(prev => ({ ...prev, [trKey]: e.target.value }))} style={{ width: "100%", padding: "8px 10px", fontSize: 13, border: translation ? "1px solid var(--color-border-light)" : "2px solid #FCD34D", borderRadius: "var(--radius-sm)", background: translation ? "var(--color-bg-white)" : "#FFFBEB" }} placeholder={translation ? "" : "—"} />
                  ) : (
                    <input value={translation} onChange={e => setTranslations(prev => ({ ...prev, [trKey]: e.target.value }))} style={{ width: "100%", padding: "8px 10px", fontSize: 13, border: translation ? "1px solid var(--color-border-light)" : "2px solid #FCD34D", borderRadius: "var(--radius-sm)", background: translation ? "var(--color-bg-white)" : "#FFFBEB" }} placeholder={translation ? "" : "—"} />
                  )}
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 20 }}>
            <button onClick={() => handleSaveTranslations(activeLocale)} disabled={saving} className="btn btn-primary" style={{ fontSize: 13, padding: "10px 24px" }}>
              <Save size={16} /> Save All Translations
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
