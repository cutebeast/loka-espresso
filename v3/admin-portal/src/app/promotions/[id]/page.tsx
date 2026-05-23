"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ArrowLeft, Save, RefreshCw, Upload } from "lucide-react";
import GalleryUpload from "@/components/GalleryUpload";

type LocaleTab = "en" | "ms" | "zh" | "ta" | "tr";
const LOCALES: { code: LocaleTab; label: string; flag: string }[] = [
  { code: "en", label: "English", flag: "🇬🇧" }, { code: "ms", label: "BM", flag: "🇲🇾" }, { code: "zh", label: "中文", flag: "🇨🇳" }, { code: "ta", label: "தமிழ்", flag: "🇮🇳" }, { code: "tr", label: "TR", flag: "🇹🇷" },
];
const TR_FIELDS = [{ key: "title", label: "Title" }, { key: "short_description", label: "Short Description" }, { key: "long_description", label: "Full Description" }];
const ACTION_TYPES = [{ value: "read_claim", label: "Read & Claim" }, { value: "url_claim", label: "Visit Link & Claim" }, { value: "survey_claim", label: "Survey & Claim" }];

export default function PromotionEditPage() {
  const p = useParams(); const r = useRouter(); const id = p.id as string;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loc, setLoc] = useState<LocaleTab>("en");
  const [regen, setRegen] = useState("");
  const [msg, setMsg] = useState("");
  const [uploading, setUploading] = useState(false);
  const [img, setImg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [vouchers, setVouchers] = useState<any[]>([]);
  const [voucherSegments, setVoucherSegments] = useState<string[]>([]);
  const [surveys, setSurveys] = useState<any[]>([]);
  const [form, setForm] = useState<Record<string, any>>({});
  const [tr, setTr] = useState<Record<string, string>>({});

  useEffect(() => { load(); loadRefs(); }, [id]);

  useEffect(() => {(async () => {

      if (!form.voucher_id) { setVoucherSegments([]); return; }
      api.getRaw<any>(`/admin/vouchers/${form.voucher_id}`).then(d => {
        const segs = d.customer_segments || [];
        setVoucherSegments(Array.isArray(segs) ? segs : []);
      }).catch((e) => { console.error('voucher segments:', e); setVoucherSegments([]); });
    
})();}, [form.voucher_id]);

  const loadRefs = async () => {
    try { const d = await api.getRaw<any>("/admin/vouchers?per_page=100&is_active=true"); setVouchers(Array.isArray(d) ? d : (d.items||[])); } catch (e) { console.error(e); }
    try { const d = await api.getRaw<any>("/admin/surveys?per_page=100"); setSurveys(Array.isArray(d) ? d : (d.items||[])); } catch (e) { console.error(e); }
  };

  const load = useCallback(async () => {
    try {
      const d = await api.getRaw<any>(`/admin/promo-banners/${id}`);
      setForm({ title: d.title || "", short_description: d.short_description || "", long_description: d.long_description || "", image_url: d.image_url || "", image_gallery_urls: d.image_gallery_urls||[], gallery_video_url: d.gallery_video_url||"", action_type: d.action_type || "", action_url: d.action_url || "", voucher_id: String(d.voucher_id || ""), survey_id: String(d.survey_id || ""), position: d.position||0, is_active: d.is_active, start_date: d.start_date?.slice(0,10)||"", end_date: d.end_date?.slice(0,10)||"" });
      setImg(d.image_url || "");
      const x: Record<string, string> = {};
      for (const lc of LOCALES) { if (lc.code === "en") continue;
        try { const rt = await api.getRaw<{ items: { id: number; translation_key: string; translated_text: string }[] }>(`/admin/translations?table_name=promo_banners&record_id=${id}&locale=${lc.code}&per_page=50`); if (rt?.items) for (const t of rt.items) { const f = t.translation_key.split(".").pop() || ""; x[`${lc.code}:${f}`] = t.translated_text || ""; } } catch (e) { console.error(e); }
      }
      setTr(x);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, [id]);

  const handleUpload = async () => {
    const f = fileRef.current?.files?.[0]; if (!f) return; setUploading(true);
    try { const fd = new FormData(); fd.append("file", f); const j = await api.upload("/upload/image", fd); const url = j.url || j.filename || ""; setForm({ ...form, image_url: url }); setImg(url); } catch (e) { console.error(e); } finally { setUploading(false); }
  };

  const handleSave = async () => { setSaving(true); try { const p: Record<string, unknown> = { ...form, voucher_id: Number(form.voucher_id), survey_id: form.survey_id ? Number(form.survey_id) : null, start_date: form.start_date || null, end_date: form.end_date || null }; await api.patch(`/admin/promo-banners/${id}`, p); setMsg("Saved"); setTimeout(() => setMsg(""), 2000); } catch (e) { console.error(e); } finally { setSaving(false); } };

  const upsertTr = async (field: string, locale: string, src: string, text: string) => {
    const all = await api.getRaw<{ items: { id: number; translation_key?: string; translated_text?: string }[] }>(`/admin/translations?table_name=promo_banners&record_id=${id}&column_name=${field}&locale=${locale}&per_page=1`);
    if (all?.items?.[0]) { await api.put(`/admin/translations/${all.items[0].id}`, { translated_text: text }); }
    else { await api.post("/admin/translations", { translation_key: `promo_banners.${id}.${field}`, locale, namespace: "promo", translated_text: text, source_text: src, table_name: "promo_banners", record_id: Number(id), column_name: field }); }
  };

  const regenAll = async (locale: string) => { setRegen("all"); const results: { field: string; text: string }[] = [];
    for (const f of TR_FIELDS) { const src = (form[f.key] || "").trim(); if (!src) continue; try { const r = await api.post<{ translated_text?: string }>("/admin/translations/translate", { text: src, target_locale: locale, source_locale: "en" }); if (r?.translated_text) { results.push({ field: f.key, text: r.translated_text }); setTr(prev => ({ ...prev, [`${locale}:${f.key}`]: r.translated_text! })); } } catch (e) { console.error(e); } }
    for (const r of results) { await upsertTr(r.field, locale, (form[r.field] || "").trim(), r.text); }
    setMsg(results.length > 0 ? `Regenerated ${results.length} ${locale.toUpperCase()} translations & saved` : "No translatable content"); setTimeout(() => setMsg(""), 2500); setRegen("");
  };

  const saveAllTr = async (locale: string) => { setSaving(true); for (const f of TR_FIELDS) { const key = `${locale}:${f.key}`; const text = tr[key] || ""; if (text.trim()) await upsertTr(f.key, locale, form[f.key] || "", text); } setMsg(`All ${locale.toUpperCase()} translations saved`); setTimeout(() => setMsg(""), 2000); setSaving(false); };

  if (loading) return <div style={{ padding: 32 }}><p>Loading...</p></div>;

  return (
    <div style={{ padding: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={() => r.push("/promotions")} className="btn btn-ghost btn-sm"><ArrowLeft size={18} /></button>
        <div><h1 className="page-title" style={{ margin: 0 }}>{form.title || "Promotion"}</h1><p className="page-subtitle" style={{ marginTop: 2 }}>Edit details & translations</p></div>
      </div>
      {msg && <div className="alert alert-success" style={{ marginBottom: 12 }}>{msg}</div>}

      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "2px solid var(--color-border-light)", paddingBottom: 0 }}>
        {LOCALES.map(l => <button key={l.code} onClick={() => setLoc(l.code)} style={{ padding: "10px 20px", fontSize: 13, fontWeight: loc === l.code ? 700 : 400, border: "none", borderBottom: loc === l.code ? "3px solid var(--color-primary)" : "3px solid transparent", background: loc === l.code ? "rgba(59,74,26,0.05)" : "transparent", cursor: "pointer", color: loc === l.code ? "var(--color-primary)" : "var(--color-text-muted)", borderRadius: "4px 4px 0 0" }}>{l.flag} {l.label}</button>)}
      </div>

      {loc === "en" && <div className="card" style={{ padding: 24, maxWidth: 700 }}>
        <h3 style={{ marginBottom: 20 }}>English (Source Content)</h3>
        <div className="df-grid">
          <div className="df-field" style={{ gridColumn: "1/-1" }}><label className="df-label">Title *</label><input required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></div>
          <div className="df-field"><label className="df-label">Position</label><input type="number" value={form.position} onChange={e => setForm({ ...form, position: Number(e.target.value) })} /></div>
          <div className="df-field" style={{ gridColumn: "1/-1" }}><label className="df-label">Short Description</label><input value={form.short_description} onChange={e => setForm({ ...form, short_description: e.target.value })} /></div>
          <div className="df-field" style={{ gridColumn: "1/-1" }}><label className="df-label">Full Description</label><textarea rows={4} value={form.long_description} onChange={e => setForm({ ...form, long_description: e.target.value })} /></div>
          <div className="df-field"><label className="df-label">Action Type *</label><select value={form.action_type} onChange={e => setForm({ ...form, action_type: e.target.value })}><option value="">— Select —</option>{ACTION_TYPES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}</select></div>
          <div className="df-field"><label className="df-label">Reward Voucher *</label><select required value={form.voucher_id} onChange={e => setForm({ ...form, voucher_id: e.target.value })}><option value="">— Required —</option>{vouchers.map(v => <option key={v.id} value={v.id}>{v.display_title} ({v.voucher_code})</option>)}</select>
            {voucherSegments.length > 0 && <div style={{ marginTop: 6, padding: "6px 10px", background: "var(--color-bg-muted)", borderRadius: "var(--radius-sm)", fontSize: 11, color: "var(--color-text-muted)" }}>⚠ This voucher is restricted to: <strong>{voucherSegments.join(", ")}</strong></div>}</div>
          {form.action_type === "url_claim" && <div className="df-field" style={{ gridColumn: "1/-1" }}><label className="df-label">Link URL</label><input value={form.action_url} onChange={e => setForm({ ...form, action_url: e.target.value })} /></div>}
          {form.action_type === "survey_claim" && <div className="df-field"><label className="df-label">Survey</label><select value={form.survey_id} onChange={e => setForm({ ...form, survey_id: e.target.value })}><option value="">— Select —</option>{surveys.map(s => <option key={s.id} value={s.id}>{s.survey_name}</option>)}</select></div>}
          <div className="df-field" style={{ gridColumn: "1/-1" }}>
            <label className="df-label">Image</label>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}><input ref={fileRef} type="file" accept="image/*" onChange={handleUpload} style={{ display: "none" }} /><button type="button" onClick={() => fileRef.current?.click()} className="btn btn-sm btn-outline" disabled={uploading}><Upload size={14} /> {uploading ? "Uploading..." : "Upload Image"}</button>{img && <><img src={img} alt="" style={{ width: 48, height: 48, borderRadius: 6, objectFit: "cover" }} /><button type="button" onClick={() => { setForm({ ...form, image_url: "" }); setImg(""); }} className="btn btn-ghost btn-sm" style={{ color: "var(--color-error)" }}>Clear</button></>}</div>
          </div>
          <GalleryUpload
            imageUrls={form.image_gallery_urls||[]}
            videoUrl={form.gallery_video_url||""}
            onImagesChange={urls => setForm({...form, image_gallery_urls: urls})}
            onVideoChange={url => setForm({...form, gallery_video_url: url})}
            disabled={uploading}
          />
          <div className="df-field"><label className="df-label">Start Date</label><input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} /></div>
          <div className="df-field"><label className="df-label">End Date</label><input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} /></div>
          <div className="df-field"><label className="df-label" style={{ display: "flex", alignItems: "center", gap: 8 }}><input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} /> Active</label></div>
        </div>
        <div className="df-actions" style={{ marginTop: 20 }}><button type="button" onClick={() => r.push("/promotions")} className="btn btn-ghost">Cancel</button><button onClick={handleSave} disabled={saving} className="btn btn-primary"><Save size={16} /> {saving ? "Saving..." : "Save Changes"}</button></div>
      </div>}

      {loc !== "en" && <div className="card" style={{ padding: 24, maxWidth: 720 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}><h3 style={{ margin: 0, fontSize: 16 }}>{LOCALES.find(l => l.code === loc)?.flag} {LOCALES.find(l => l.code === loc)?.label} Translation</h3><button onClick={() => regenAll(loc)} disabled={!!regen} className="btn btn-primary btn-sm" style={{ fontSize: 12, padding: "8px 16px" }}><RefreshCw size={14} /> {regen === "all" ? "Generating..." : "Regenerate All"}</button></div>
        <div className="df-grid">
          {TR_FIELDS.map(f => { const k = `${loc}:${f.key}`; const t = tr[k] || ""; const s = form[f.key] || ""; const isLong = f.key === "long_description"; return <div className="df-field" key={f.key} style={isLong ? { gridColumn: "1/-1" } : {}}><label style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-muted)", display: "flex", justifyContent: "space-between" }}><span>{f.label}</span><span style={{ fontWeight: 400, fontStyle: "italic" }}>EN: {s?.slice(0, 30) || "—"}</span></label>{isLong ? <textarea rows={3} value={t} onChange={e => setTr(prev => ({ ...prev, [k]: e.target.value }))} style={{ width: "100%", padding: "8px 10px", fontSize: 13, border: t ? "1px solid var(--color-border-light)" : "2px solid #FCD34D", borderRadius: "var(--radius-sm)", background: t ? "var(--color-bg-white)" : "#FFFBEB" }} placeholder={t ? "" : "—"} /> : <input value={t} onChange={e => setTr(prev => ({ ...prev, [k]: e.target.value }))} style={{ width: "100%", padding: "8px 10px", fontSize: 13, border: t ? "1px solid var(--color-border-light)" : "2px solid #FCD34D", borderRadius: "var(--radius-sm)", background: t ? "var(--color-bg-white)" : "#FFFBEB" }} placeholder={t ? "" : "—"} />}</div>; })}
        </div>
        <div style={{ marginTop: 20 }}><button onClick={() => saveAllTr(loc)} disabled={saving} className="btn btn-primary" style={{ fontSize: 13, padding: "10px 24px" }}><Save size={16} /> Save All Translations</button></div>
      </div>}
    </div>
  );
}
