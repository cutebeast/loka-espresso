"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ArrowLeft, Save } from "lucide-react";

export default function SystemPageNewPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ page_key:"", title:"", body_text:"", is_active:true });

  const handleSubmit = async (e:React.FormEvent) => { e.preventDefault(); setSaving(true);
    try{await api.post("/admin/system-pages",form);router.push("/content/system");}catch(e:any){setError(e.message)}finally{setSaving(false)}; };

  return (
    <div style={{padding:32}}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}><button onClick={()=>router.push("/content/system")} className="btn btn-ghost btn-sm"><ArrowLeft size={18}/></button><div><h1 className="page-title" style={{margin:0}}>New System Page</h1></div></div>
      {error&&<div className="alert alert-error" style={{marginBottom:16}}>{error}</div>}
      <div className="card" style={{padding:24,maxWidth:700}}>
        <form onSubmit={handleSubmit}><div className="df-grid">
          <div className="df-field"><label className="df-label">Key *</label><input required value={form.page_key} onChange={e=>setForm({...form,page_key:e.target.value})} placeholder="e.g. terms, privacy"/></div>
          <div className="df-field"><label className="df-label">Title *</label><input required value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/></div>
          <div className="df-field" style={{gridColumn:"1/-1"}}><label className="df-label">Body</label><textarea rows={8} value={form.body_text} onChange={e=>setForm({...form,body_text:e.target.value})} placeholder="HTML or markdown content..."/></div>
          <div className="df-field"><label className="df-label" style={{display:"flex",alignItems:"center",gap:8}}><input type="checkbox" checked={form.is_active} onChange={e=>setForm({...form,is_active:e.target.checked})}/> Active</label></div>
        </div><div className="df-actions" style={{marginTop:20}}><button type="button" onClick={()=>router.push("/content/system")} className="btn btn-ghost">Cancel</button><button type="submit" className="btn btn-primary" disabled={saving}><Save size={16}/>{saving?"Creating...":"Create Page"}</button></div></form>
      </div>
    </div>
  );
}
