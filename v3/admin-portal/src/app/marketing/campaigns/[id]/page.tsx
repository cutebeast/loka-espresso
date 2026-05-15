"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, sendCampaign } from "@/lib/api";
import { ArrowLeft, Save, RefreshCw } from "lucide-react";
import { useAudienceSegments } from "@/lib/useAudienceSegments";

type LocaleTab = "en" | "ms" | "zh" | "ta" | "tr";
const LOCALES: { code: LocaleTab; label: string; flag: string }[] = [{ code: "en", label: "English", flag: "🇬🇧" }, { code: "ms", label: "BM", flag: "🇲🇾" }, { code: "zh", label: "中文", flag: "🇨🇳" }, { code: "ta", label: "தமிழ்", flag: "🇮🇳" }, { code: "tr", label: "TR", flag: "🇹🇷" }];
const TR_FIELDS = [{ key: "campaign_name", label: "Campaign Name" }, { key: "body_content", label: "Content" }];

export default function CampaignEditPage() {
  const p = useParams(); const r = useRouter(); const id = p.id as string;
  const [loading, setLoading] = useState(true);
  const { allSegments } = useAudienceSegments();
  const [saving, setSaving] = useState(false);
  const [loc, setLoc] = useState<LocaleTab>("en");
  const [regen, setRegen] = useState("");
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState<Record<string, any>>({});
  const [tr, setTr] = useState<Record<string, string>>({});

  useEffect(() => { load(); }, [id]);

  const load = async () => {
    setLoading(true);
    try {
      const d = await api.getRaw<any>(`/admin/marketing/campaigns/${id}`);
      setForm({ campaign_name: d.campaign_name || "", campaign_key: d.campaign_key || "", campaign_type: d.campaign_type || "promotional", channel: d.channel || "push_notification", status: d.status || "draft", audience_segment: d.audience_segment || "", body_content: d.body_content || "", scheduled_at: d.scheduled_at?.slice(0, 16) || "" });
      const x: Record<string, string> = {};
      for (const lc of LOCALES) { if (lc.code === "en") continue;
        try { const rt = await api.getRaw<any>(`/translations?table_name=marketing_campaigns&record_id=${id}&locale=${lc.code}&per_page=50`); if (rt?.items) for (const t of rt.items) { const f = t.translation_key.split(".").pop() || ""; x[`${lc.code}:${f}`] = t.translated_text || ""; } } catch {}
      }
      setTr(x);
    } catch {} finally { setLoading(false); }
  };

  const handleSave = async () => { setSaving(true); try {       await api.put(`/admin/marketing/campaigns/${id}`, form); setMsg("Saved"); setTimeout(() => setMsg(""), 2000); } catch {} finally { setSaving(false); } };

  const handleSend = async () => { if (!confirm("Send this campaign now?")) return; try { await sendCampaign(Number(id)); setMsg("Campaign sent!"); setTimeout(() => setMsg(""), 2000); } catch {} };

  const upsertTr = async (field: string, locale: string, src: string, text: string) => {
    const all = await api.getRaw<any>(`/translations?table_name=marketing_campaigns&record_id=${id}&column_name=${field}&locale=${locale}&per_page=1`);
    if (all?.items?.[0]) { await api.put(`/translations/${all.items[0].id}`, { translated_text: text }); }
    else { await api.post("/translations", { translation_key: `marketing_campaigns.${id}.${field}`, locale, namespace: "campaign", translated_text: text, source_text: src, table_name: "marketing_campaigns", record_id: Number(id), column_name: field }); }
  };

  const regenAll = async (locale: string) => { setRegen("all"); const results: { field: string; text: string }[] = [];
    for (const f of TR_FIELDS) { const src = (form[f.key] || "").trim(); if (!src) continue; try { const r: any = await api.post("/translations/translate", { text: src, target_locale: locale, source_locale: "en" }); if (r?.translated_text) { results.push({ field: f.key, text: r.translated_text }); setTr(prev => ({ ...prev, [`${locale}:${f.key}`]: r.translated_text })); } } catch {} }
    for (const r of results) { await upsertTr(r.field, locale, (form[r.field] || "").trim(), r.text); }
    setMsg(results.length > 0 ? `Regenerated ${results.length} ${locale.toUpperCase()} translations & saved` : "No translatable content"); setTimeout(() => setMsg(""), 2500); setRegen("");
  };

  const saveAllTr = async (locale: string) => { setSaving(true); for (const f of TR_FIELDS) { const key = `${locale}:${f.key}`; const text = tr[key] || ""; if (text.trim()) await upsertTr(f.key, locale, form[f.key] || "", text); } setMsg(`All ${locale.toUpperCase()} translations saved`); setTimeout(() => setMsg(""), 2000); setSaving(false); };

  if (loading) return <div style={{ padding: 32 }}><p>Loading...</p></div>;

  return (
    <div style={{ padding: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}><button onClick={() => r.push("/marketing/campaigns")} className="btn btn-ghost btn-sm"><ArrowLeft size={18} /></button><div><h1 className="page-title" style={{ margin: 0 }}>{form.campaign_name || "Campaign"}</h1><p className="page-subtitle" style={{ marginTop: 2 }}>Edit campaign & translations</p></div><div style={{ marginLeft: "auto" }}>{(form.status === "draft" || form.status === "scheduled") && <button onClick={handleSend} className="btn btn-sm btn-primary">Send Campaign</button>}</div></div>
      {msg && <div className="alert alert-success" style={{ marginBottom: 12 }}>{msg}</div>}

      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "2px solid var(--color-border-light)", paddingBottom: 0 }}>{LOCALES.map(l => <button key={l.code} onClick={() => setLoc(l.code)} style={{ padding: "10px 20px", fontSize: 13, fontWeight: loc === l.code ? 700 : 400, border: "none", borderBottom: loc === l.code ? "3px solid var(--color-primary)" : "3px solid transparent", background: loc === l.code ? "rgba(59,74,26,0.05)" : "transparent", cursor: "pointer", color: loc === l.code ? "var(--color-primary)" : "var(--color-text-muted)", borderRadius: "4px 4px 0 0" }}>{l.flag} {l.label}</button>)}</div>

      {loc === "en" && <div className="card" style={{ padding: 24, maxWidth: 700 }}>
        <h3 style={{ marginBottom: 20 }}>English (Source Content)</h3>
        <div className="df-grid">
          <div className="df-field" style={{ gridColumn: "1/-1" }}><label className="df-label">Campaign Name *</label><input required value={form.campaign_name} onChange={e => setForm({ ...form, campaign_name: e.target.value })} /></div>
          <div className="df-field"><label className="df-label">Channel</label><select value={form.channel} onChange={e => setForm({ ...form, channel: e.target.value })}><option value="push_notification">Push</option><option value="email">Email</option><option value="sms">SMS</option><option value="whatsapp">WhatsApp</option><option value="in_app">In-App</option></select></div>
          <div className="df-field"><label className="df-label">Status</label><select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}><option value="draft">Draft</option><option value="scheduled">Scheduled</option><option value="active">Active</option><option value="paused">Paused</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></div>
          <div className="df-field"><label className="df-label">Type</label><select value={form.campaign_type} onChange={e => setForm({ ...form, campaign_type: e.target.value })}><option value="promotional">Promotional</option><option value="transactional">Transactional</option><option value="announcement">Announcement</option><option value="retention">Retention</option></select></div>
          <div className="df-field"><label className="df-label">Scheduled At</label><input type="datetime-local" value={form.scheduled_at} onChange={e => setForm({ ...form, scheduled_at: e.target.value })} /></div>
          <div className="df-field" style={{ gridColumn: "1/-1" }}><label className="df-label">Audience Segment</label><select value={form.audience_segment} onChange={e => setForm({ ...form, audience_segment: e.target.value })}><option value="">Select...</option>{allSegments.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</select><div className="df-hint">Target audience for campaign delivery</div></div>
          <div className="df-field" style={{ gridColumn: "1/-1" }}><label className="df-label">Content</label><textarea rows={5} value={form.body_content} onChange={e => setForm({ ...form, body_content: e.target.value })} /></div>
        </div>
        <div className="df-actions" style={{ marginTop: 20 }}><button type="button" onClick={() => r.push("/marketing/campaigns")} className="btn btn-ghost">Cancel</button><button onClick={handleSave} disabled={saving} className="btn btn-primary"><Save size={16} /> {saving ? "Saving..." : "Save Changes"}</button></div>
      </div>}

      {loc !== "en" && <div className="card" style={{ padding: 24, maxWidth: 720 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}><h3 style={{ margin: 0, fontSize: 16 }}>{LOCALES.find(l => l.code === loc)?.flag} {LOCALES.find(l => l.code === loc)?.label} Translation</h3><button onClick={() => regenAll(loc)} disabled={!!regen} className="btn btn-primary btn-sm" style={{ fontSize: 12, padding: "8px 16px" }}><RefreshCw size={14} /> {regen === "all" ? "Generating..." : "Regenerate All"}</button></div>
        <div className="df-grid">{TR_FIELDS.map(f => { const k = `${loc}:${f.key}`; const t = tr[k] || ""; const s = form[f.key] || ""; const isTextarea = f.key === "body_content"; return <div className="df-field" key={f.key} style={isTextarea ? { gridColumn: "1/-1" } : {}}><label style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-muted)", display: "flex", justifyContent: "space-between" }}><span>{f.label}</span><span style={{ fontWeight: 400, fontStyle: "italic" }}>EN: {s?.slice(0, 30) || "—"}</span></label>{isTextarea ? <textarea rows={5} value={t} onChange={e => setTr(prev => ({ ...prev, [k]: e.target.value }))} style={{ width: "100%", padding: "8px 10px", fontSize: 13, border: t ? "1px solid var(--color-border-light)" : "2px solid #FCD34D", borderRadius: "var(--radius-sm)", background: t ? "var(--color-bg-white)" : "#FFFBEB" }} placeholder={t ? "" : "—"} /> : <input value={t} onChange={e => setTr(prev => ({ ...prev, [k]: e.target.value }))} style={{ width: "100%", padding: "8px 10px", fontSize: 13, border: t ? "1px solid var(--color-border-light)" : "2px solid #FCD34D", borderRadius: "var(--radius-sm)", background: t ? "var(--color-bg-white)" : "#FFFBEB" }} placeholder={t ? "" : "—"} />}</div>; })}</div>
        <div style={{ marginTop: 20 }}><button onClick={() => saveAllTr(loc)} disabled={saving} className="btn btn-primary" style={{ fontSize: 13, padding: "10px 24px" }}><Save size={16} /> Save All Translations</button></div>
      </div>}
    </div>
  );
}
