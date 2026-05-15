"use client";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ArrowLeft, Save, Upload } from "lucide-react";

export default function SplashScreenNewPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [img, setImg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({ screen_name:"", title:"", subtitle:"", image_url:"", cta_text:"", cta_url:"", show_frequency:"once_per_session", dismissible:true, active_from:"", active_until:"", is_active:true });

  const handleUpload = async () => { const f = fileRef.current?.files?.[0]; if(!f)return; setUploading(true);
    try{const fd=new FormData();fd.append("file",f);const j=await api.upload("/upload/image",fd);const url=j.url||j.filename||"";setForm({...form,image_url:url});setImg(url);}catch(e:any){setError(e.message)}finally{setUploading(false)}; };

  const handleSubmit = async (e:React.FormEvent) => { e.preventDefault(); setSaving(true);
    try{await api.post("/admin/content/splash-screens",form);router.push("/content/pwa-splash");}catch(e:any){setError(e.message)}finally{setSaving(false)}; };

  return (
    <div style={{padding:32}}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}><button onClick={()=>router.push("/content/pwa-splash")} className="btn btn-ghost btn-sm"><ArrowLeft size={18}/></button><div><h1 className="page-title" style={{margin:0}}>New PWA Splash</h1></div></div>
      {error&&<div className="alert alert-error" style={{marginBottom:16}}>{error}</div>}
      <div className="card" style={{padding:24,maxWidth:700}}>
        <form onSubmit={handleSubmit}><div className="df-grid">
          <div className="df-field" style={{gridColumn:"1/-1"}}><label className="df-label">Title *</label><input required value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/></div>
          <div className="df-field"><label className="df-label" style={{display:"flex",alignItems:"center",gap:8}}><input type="checkbox" checked={form.screen_name==="pre_login"} onChange={e=>setForm({...form,screen_name:e.target.checked?"pre_login":""})}/> Pre-Login Splash</label><div className="df-hint">Shows before login page on PWA</div></div>
          <div className="df-field" style={{gridColumn:"1/-1"}}><label className="df-label">Subtitle</label><input value={form.subtitle} onChange={e=>setForm({...form,subtitle:e.target.value})}/></div>
          <div className="df-field"><label className="df-label">Active From</label><input type="datetime-local" value={form.active_from} onChange={e=>setForm({...form,active_from:e.target.value})}/></div>
          <div className="df-field"><label className="df-label">Active Until</label><input type="datetime-local" value={form.active_until} onChange={e=>setForm({...form,active_until:e.target.value})}/></div>
          <div className="df-field"><label className="df-label">CTA Text</label><input value={form.cta_text} onChange={e=>setForm({...form,cta_text:e.target.value})} placeholder="Learn More"/></div>
          <div className="df-field"><label className="df-label">CTA URL</label><input value={form.cta_url} onChange={e=>setForm({...form,cta_url:e.target.value})} placeholder="https://..."/></div>
          <div className="df-field"><label className="df-label">Show Frequency</label><select value={form.show_frequency} onChange={e=>setForm({...form,show_frequency:e.target.value})}><option value="once_per_session">Once Per Session</option><option value="always">Always</option><option value="once_per_day">Once Per Day</option><option value="once">Once Only</option></select><div className="df-hint">How often this splash appears</div></div>
          <div className="df-field"><label className="df-label" style={{display:"flex",alignItems:"center",gap:8}}><input type="checkbox" checked={form.dismissible} onChange={e=>setForm({...form,dismissible:e.target.checked})}/> Dismissible</label><div className="df-hint">Can user dismiss this splash?</div></div>
          <div className="df-field" style={{gridColumn:"1/-1"}}><label className="df-label">Image</label><div style={{display:"flex",gap:12,alignItems:"center"}}><input ref={fileRef} type="file" accept="image/*" onChange={handleUpload} style={{display:"none"}}/><button type="button" onClick={()=>fileRef.current?.click()} className="btn btn-sm btn-outline" disabled={uploading}><Upload size={14}/>{uploading?"Uploading...":"Upload Image"}</button>{img&&<><img src={img} alt="" style={{width:48,height:48,borderRadius:6,objectFit:"cover"}}/><button type="button" onClick={()=>{setForm({...form,image_url:""});setImg("");}} className="btn btn-ghost btn-sm" style={{color:"var(--color-error)"}}>Clear</button></>}</div></div>
          <div className="df-field"><label className="df-label" style={{display:"flex",alignItems:"center",gap:8}}><input type="checkbox" checked={form.is_active} onChange={e=>setForm({...form,is_active:e.target.checked})}/> Active</label></div>
        </div><div className="df-actions" style={{marginTop:20}}><button type="button" onClick={()=>router.push("/content/pwa-splash")} className="btn btn-ghost">Cancel</button><button type="submit" className="btn btn-primary" disabled={saving}><Save size={16}/>{saving?"Creating...":"Create Splash"}</button></div></form>
      </div>
    </div>
  );
}
