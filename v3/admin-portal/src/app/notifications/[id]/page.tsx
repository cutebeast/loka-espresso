"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ArrowLeft, Save, Send, RefreshCw } from "lucide-react";
import { useAudienceSegments } from "@/lib/useAudienceSegments";

const TYPES = ["general","order","reward","wallet","loyalty","promo","info","event"];
const LOCALES = [{code:"en",label:"English",flag:"🇬🇧"},{code:"ms",label:"BM",flag:"🇲🇾"},{code:"zh",label:"中文",flag:"🇨🇳"},{code:"ta",label:"தமிழ்",flag:"🇮🇳"},{code:"tr",label:"TR",flag:"🇹🇷"}];
const TR_FIELDS = [{key:"title",label:"Title"},{key:"body",label:"Body"}];

interface Template { id: number; name: string; title: string; body?: string; notification_type: string; audience_segment: string; }

export default function NotificationEditPage() {
  const p = useParams(); const r = useRouter(); const id = p.id as string;
  const [loading, setLoading] = useState(true);
  const [loc, setLoc] = useState("en");
  const [saving, setSaving] = useState(false);
  const [savingTr, setSavingTr] = useState(false);
  const [regen, setRegen] = useState(false);
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState<Record<string, any>>({});
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selTemplate, setSelTemplate] = useState("");
  const [tr, setTr] = useState<Record<string, string>>({});
  const { allSegments: AUDIENCES } = useAudienceSegments();

  useEffect(() => { load(); api.get<{items:Template[]}>("/admin/notifications/templates/list").then(d => setTemplates(Array.isArray(d)?d:(d.items||[]))).catch(()=>{}); }, [id]);

  const load = async () => { setLoading(true);
    try {
      const d = await api.getRaw<any>(`/admin/notifications/${id}`);
      setForm({ title:d.title||"", body:d.body||"", notification_type:d.notification_type||"general", audience_segment:d.audience_segment||"all_users", image_url:d.image_url||"", action_url:d.action_url||"", scheduled_at:d.scheduled_at?.slice(0,16)||"", status:d.status||"draft" });
      const x: Record<string,string>={};
      for(const lc of LOCALES){if(lc.code==="en")continue;try{const rt=await api.getRaw<any>(`/translations?table_name=notification_messages&record_id=${id}&locale=${lc.code}&per_page=50`);if(rt?.items)for(const t of rt.items){const f=t.translation_key.split(".").pop()||"";x[`${lc.code}:${f}`]=t.translated_text||"";}}catch{}}
      setTr(x);
    } catch {} finally { setLoading(false); }
  };

  const applyTemplate = () => {
    const t = templates.find(x => x.id === Number(selTemplate));
    if (t) setForm({ ...form, title: t.title, body: t.body || "", notification_type: t.notification_type, audience_segment: t.audience_segment });
  };

  const handleSave = async () => { setSaving(true);
    try { await api.put(`/admin/notifications/${id}`, form); setMsg("Saved"); setTimeout(()=>setMsg(""), 2000); } catch {} finally { setSaving(false); }
  };

  const handleSend = async () => { if (!confirm("Send now?")) return;
    try { await api.post(`/admin/notifications/${id}/send`, {}); setMsg("Sent!"); setTimeout(()=>setMsg(""), 2000); } catch {}
  };

  const upsertTr = async(field:string,locale:string,src:string,text:string)=>{
    try{const rt=await api.getRaw<any>(`/translations?table_name=notification_messages&record_id=${id}&column_name=${field}&locale=${locale}&per_page=1`);const ex=rt?.items?.[0];if(ex)await api.put(`/translations/${ex.id}`,{translated_text:text});else await api.post("/translations",{translation_key:`notification_messages.${id}.${field}`,locale,namespace:"notification",translated_text:text,source_text:src,table_name:"notification_messages",record_id:Number(id),column_name:field});}catch{}
  };

  const regenAll = async () => { setRegen(true); let c=0;
    for(const f of TR_FIELDS){const src=(form[f.key]||"").trim();if(!src)continue;try{const rt:any=await api.post("/translations/translate",{text:src,target_locale:loc,source_locale:"en"});if(rt?.translated_text){setTr(p=>({...p,[`${loc}:${f.key}`]:rt.translated_text}));await upsertTr(f.key,loc,src,rt.translated_text);c++;}}catch{}}
    setMsg(`Regenerated ${c} fields`);setTimeout(()=>setMsg(""),2500);setRegen(false);
  };

  const saveAllTr = async () => { setSavingTr(true);
    for(const f of TR_FIELDS){const t=tr[`${loc}:${f.key}`]||"";if(t)await upsertTr(f.key,loc,(form[f.key]||"").trim(),t);}
    setMsg("Translations saved");setTimeout(()=>setMsg(""),2000);setSavingTr(false);
  };

  if (loading) return <div style={{ padding: 32 }}>Loading...</div>;

  return (
    <div style={{ padding: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={()=>r.push("/notifications")} className="btn btn-ghost btn-sm"><ArrowLeft size={18}/></button>
        <div style={{ flex: 1 }}><h1 className="page-title" style={{ margin: 0 }}>{form.title || "Notification"}</h1></div>
        {(form.status === "draft" || form.status === "scheduled") && <button onClick={handleSend} className="btn btn-sm btn-primary"><Send size={14}/> Send Now</button>}
      </div>
      {msg && <div className="alert alert-success" style={{ marginBottom: 12 }}>{msg}</div>}

      {templates.length > 0 && (
        <div style={{ marginBottom: 16, padding: 12, background: "var(--color-bg-muted)", borderRadius: "var(--radius-sm)", display: "flex", alignItems: "center", gap: 8 }}>
          <label style={{ fontSize: 12, fontWeight: 600, whiteSpace:"nowrap" }}>Apply Template:</label>
          <select value={selTemplate} onChange={e => setSelTemplate(e.target.value)} style={{ flex: 1, padding: "6px 10px", fontSize: 12, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-light)" }}>
            <option value="">— Select a template —</option>
            {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          {selTemplate && <button type="button" onClick={applyTemplate} className="btn btn-sm btn-primary" style={{ fontSize: 11 }}>Apply</button>}
          <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Tip: create templates for reusable messages, use direct compose for one-off notifications</span>
        </div>
      )}

      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "2px solid var(--color-border-light)", paddingBottom: 0 }}>
        {LOCALES.map(lc => (
          <button key={lc.code} onClick={() => setLoc(lc.code)}
            style={{ padding: "10px 16px", fontSize: 12, fontWeight: loc === lc.code ? 700 : 400, border: "none", borderBottom: loc === lc.code ? "3px solid var(--color-primary)" : "3px solid transparent", background: loc === lc.code ? "rgba(59,74,26,0.05)" : "transparent", cursor: "pointer", color: loc === lc.code ? "var(--color-primary)" : "var(--color-text-muted)", borderRadius: "4px 4px 0 0" }}>
            {lc.flag} {lc.label}
          </button>
        ))}
      </div>

      {loc === "en" ? (
        <div className="card" style={{ padding: 24, maxWidth: 700 }}>
          <h3 style={{ marginBottom: 20 }}>English (Source Content)</h3>
          <div className="df-grid">
            <div className="df-field" style={{ gridColumn: "1/-1" }}><label className="df-label">Title *</label><input required value={form.title} onChange={e => setForm({...form, title: e.target.value})}/></div>
            <div className="df-field"><label className="df-label">Type</label><select value={form.notification_type} onChange={e => setForm({...form, notification_type: e.target.value})}>{TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
            <div className="df-field"><label className="df-label">Audience</label><select value={form.audience_segment} onChange={e => setForm({...form, audience_segment: e.target.value})}>{AUDIENCES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}</select></div>
            <div className="df-field" style={{ gridColumn: "1/-1" }}><label className="df-label">Body</label><textarea rows={4} value={form.body} onChange={e => setForm({...form, body: e.target.value})}/></div>
            <div className="df-field" style={{ gridColumn: "1/-1" }}><label className="df-label">Image URL</label><input value={form.image_url} onChange={e => setForm({...form, image_url: e.target.value})}/></div>
            <div className="df-field" style={{ gridColumn: "1/-1" }}><label className="df-label">Action URL</label><input value={form.action_url} onChange={e => setForm({...form, action_url: e.target.value})}/></div>
            <div className="df-field"><label className="df-label">Schedule</label><input type="datetime-local" value={form.scheduled_at} onChange={e => setForm({...form, scheduled_at: e.target.value})}/></div>
            <div className="df-field"><label className="df-label">Status</label><select value={form.status} onChange={e => setForm({...form, status: e.target.value})}><option value="draft">Draft</option><option value="scheduled">Scheduled</option></select></div>
          </div>
          <div className="df-actions" style={{ marginTop: 20 }}><button type="button" onClick={()=>r.push("/notifications")} className="btn btn-ghost">Cancel</button><button onClick={handleSave} disabled={saving} className="btn btn-primary"><Save size={16}/>{saving?"Saving...":"Save Changes"}</button></div>
        </div>
      ) : (
        <div className="card" style={{ padding: 24, maxWidth: 700 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <h3 style={{ margin: 0 }}>{LOCALES.find(l=>l.code===loc)?.flag} {LOCALES.find(l=>l.code===loc)?.label} Translation</h3>
            <button onClick={regenAll} disabled={regen} className="btn btn-primary btn-sm"><RefreshCw size={14}/>{regen?"...":"Regenerate All"}</button>
          </div>
          <div className="df-grid">
            {TR_FIELDS.map(f => { const k = `${loc}:${f.key}`; const isTA = f.key === "body";
              return <div className="df-field" key={f.key} style={isTA ? { gridColumn: "1/-1" } : {}}>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-muted)" }}>{f.label}<span style={{ fontWeight: 400, fontStyle: "italic", marginLeft: 8 }}>EN: {(form[f.key] || "").slice(0, 40)}</span></label>
                {isTA ? <textarea rows={5} value={tr[k]||""} onChange={e => setTr(p => ({...p, [k]: e.target.value}))} style={{ width: "100%", padding: "8px 10px", fontSize: 13, border: tr[k] ? "1px solid var(--color-border-light)" : "2px solid #FCD34D", borderRadius: "var(--radius-sm)", background: tr[k] ? "var(--color-bg-white)" : "#FFFBEB" }} />
                : <input value={tr[k]||""} onChange={e => setTr(p => ({...p, [k]: e.target.value}))} style={{ width: "100%", padding: "8px 10px", fontSize: 13, border: tr[k] ? "1px solid var(--color-border-light)" : "2px solid #FCD34D", borderRadius: "var(--radius-sm)", background: tr[k] ? "var(--color-bg-white)" : "#FFFBEB" }} />}
              </div>;
            })}
          </div>
          <div style={{ marginTop: 20 }}><button onClick={saveAllTr} disabled={savingTr} className="btn btn-primary"><Save size={16}/>Save Translations</button></div>
        </div>
      )}
    </div>
  );
}
