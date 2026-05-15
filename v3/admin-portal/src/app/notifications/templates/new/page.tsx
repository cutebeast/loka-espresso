"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ArrowLeft, Save } from "lucide-react";
import { useAudienceSegments } from "@/lib/useAudienceSegments";

const TYPES = ["general","order","reward","wallet","loyalty","promo","info","event"];

export default function TemplateNewPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const { allSegments: AUDIENCES } = useAudienceSegments();
  const [form, setForm] = useState({ name:"", title:"", body:"", notification_type:"general", audience_segment:"all_users" });

  const handleSubmit = async (e: React.FormEvent) => { e.preventDefault(); setSaving(true);
    try { await api.post("/admin/notifications/templates", form); router.push("/notifications/templates"); } catch (err: any) { setError(err.message); } finally { setSaving(false); }
  };

  return (
    <div style={{ padding: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}><button onClick={()=>router.push("/notifications/templates")} className="btn btn-ghost btn-sm"><ArrowLeft size={18}/></button><div><h1 className="page-title" style={{ margin: 0 }}>New Template</h1></div></div>
      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}
      <div className="card" style={{ padding: 24, maxWidth: 700 }}>
        <form onSubmit={handleSubmit}><div className="df-grid">
          <div className="df-field" style={{ gridColumn: "1/-1" }}><label className="df-label">Template Name *</label><input required value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="e.g. Welcome Message"/></div>
          <div className="df-field" style={{ gridColumn: "1/-1" }}><label className="df-label">Title *</label><input required value={form.title} onChange={e => setForm({...form, title: e.target.value})}/></div>
          <div className="df-field"><label className="df-label">Type</label><select value={form.notification_type} onChange={e => setForm({...form, notification_type: e.target.value})}>{TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
          <div className="df-field"><label className="df-label">Audience</label><select value={form.audience_segment} onChange={e => setForm({...form, audience_segment: e.target.value})}>{AUDIENCES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}</select></div>
          <div className="df-field" style={{ gridColumn: "1/-1" }}><label className="df-label">Body</label><textarea rows={4} value={form.body} onChange={e => setForm({...form, body: e.target.value})}/></div>
        </div><div className="df-actions" style={{ marginTop: 20 }}><button type="button" onClick={()=>router.push("/notifications/templates")} className="btn btn-ghost">Cancel</button><button type="submit" className="btn btn-primary" disabled={saving}><Save size={16}/>{saving?"Creating...":"Create Template"}</button></div></form>
      </div>
    </div>
  );
}
