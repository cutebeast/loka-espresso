"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ArrowLeft, Save, RefreshCw, Upload } from "lucide-react";
import GalleryUpload from "@/components/GalleryUpload";

const LOCALES = [{code:"en",label:"English",flag:"🇬🇧"},{code:"ms",label:"BM",flag:"🇲🇾"},{code:"zh",label:"中文",flag:"🇨🇳"},{code:"ta",label:"தமிழ்",flag:"🇮🇳"},{code:"tr",label:"TR",flag:"🇹🇷"}];
const TR_FIELDS = [{key:"title",label:"Title"},{key:"subtitle",label:"Subtitle"}];

export default function SplashScreenEditPage() {
  const p = useParams(); const r = useRouter(); const id = p.id as string;
  const [loading,setLoading] = useState(true); const [loc,setLoc] = useState("en");
  const [saving,setSaving] = useState(false); const [savingTr,setSavingTr] = useState(false);
  const [msg,setMsg] = useState(""); const [regen,setRegen] = useState(false);
  const [uploading,setUploading] = useState(false); const [img,setImg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [form,setForm] = useState<Record<string,any>>({});
  const [tr,setTr] = useState<Record<string,string>>({});

  const load = useCallback(async () => {
    try{
      const d = await api.getRaw<any>(`/admin/content/splash-screens/${id}`);
      setForm({screen_name:d.screen_name||"",title:d.title||"",subtitle:d.subtitle||"",image_url:d.image_url||"",image_gallery_urls:d.image_gallery_urls||[],gallery_video_url:d.gallery_video_url||"",cta_text:d.cta_text||"",cta_url:d.cta_url||"",show_frequency:d.show_frequency||"once_per_session",dismissible:d.dismissible!==false,duration_ms:d.duration_ms||"",active_from:d.active_from?.slice(0,16)||"",active_until:d.active_until?.slice(0,16)||"",is_active:d.is_active});
      setImg(d.image_url||"");
      const x:Record<string,string>={};
      for(const lc of LOCALES){if(lc.code==="en")continue;try{const rt=await api.getRaw<any>(`/admin/translations?table_name=splash_screens&record_id=${id}&locale=${lc.code}&per_page=50`);if(rt?.items)for(const t of rt.items){const f=t.translation_key.split(".").pop()||"";x[`${lc.code}:${f}`]=t.translated_text||"";}}catch (e) { console.error(e); }}
      setTr(x);
    }catch (e) { console.error(e); }finally{setLoading(false);}
  }, [id]);

  useEffect(()=>{(async () => {
load();
})();},[load]);

  const handleUpload = async () => { const f = fileRef.current?.files?.[0]; if(!f)return; setUploading(true);
    try{const fd=new FormData();fd.append("file",f);const j=await api.upload("/upload/image",fd);const url=j.url||j.filename||"";setForm({...form,image_url:url});setImg(url);}catch (e) { console.error(e); }finally{setUploading(false)}; };

  const save = async () => { setSaving(true);
    try{await api.patch(`/admin/content/splash-screens/${id}`,{...form,duration_ms:form.duration_ms?Number(form.duration_ms):undefined});setMsg("Saved");setTimeout(()=>setMsg(""),2000);}catch (e) { console.error(e); }finally{setSaving(false)}; };

  const upsertTr = async(field:string,locale:string,src:string,text:string)=>{
    try{const rt=await api.getRaw<any>(`/admin/translations?table_name=splash_screens&record_id=${id}&column_name=${field}&locale=${locale}&per_page=1`);const ex=rt?.items?.[0];if(ex)await api.put(`/admin/translations/${ex.id}`,{translated_text:text});else await api.post("/admin/translations",{translation_key:`splash_screens.${id}.${field}`,locale,namespace:"content",translated_text:text,source_text:src,table_name:"splash_screens",record_id:Number(id),column_name:field});}catch (e) { console.error(e); }
  };

  const regenAll = async () => { setRegen(true); let c=0;
    for(const f of TR_FIELDS){const src=(form[f.key]||"").trim();if(!src)continue;try{const rt:any=await api.post("/admin/translations/translate",{text:src,target_locale:loc,source_locale:"en"});if(rt?.translated_text){setTr(p=>({...p,[`${loc}:${f.key}`]:rt.translated_text}));await upsertTr(f.key,loc,src,rt.translated_text);c++;}}catch (e) { console.error(e); }}
    setMsg(`Regenerated ${c}`);setTimeout(()=>setMsg(""),2500);setRegen(false);
  };

  const saveAllTr = async () => { setSavingTr(true);
    for(const f of TR_FIELDS){const t=tr[`${loc}:${f.key}`]||"";if(t)await upsertTr(f.key,loc,(form[f.key]||"").trim(),t);}
    setMsg("Translations saved");setTimeout(()=>setMsg(""),2000);setSavingTr(false);
  };

  if(loading)return <div style={{padding:32}}>Loading...</div>;

  return (
    <div style={{padding:32}}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}><button onClick={()=>r.push("/content/pwa-splash")} className="btn btn-ghost btn-sm"><ArrowLeft size={18}/></button><div><h1 className="page-title" style={{margin:0}}>{form.title||"PWA Splash"}</h1></div></div>
      {msg&&<div className="alert alert-success" style={{marginBottom:12}}>{msg}</div>}
      <div style={{display:"flex",gap:4,marginBottom:20,borderBottom:"2px solid var(--color-border-light)",paddingBottom:0}}>{LOCALES.map(lc=>(<button key={lc.code} onClick={()=>setLoc(lc.code)} style={{padding:"10px 20px",fontSize:13,fontWeight:loc===lc.code?700:400,border:"none",borderBottom:loc===lc.code?"3px solid var(--color-primary)":"3px solid transparent",background:loc===lc.code?"rgba(59,74,26,0.05)":"transparent",cursor:"pointer",color:loc===lc.code?"var(--color-primary)":"var(--color-text-muted)",borderRadius:"4px 4px 0 0"}}>{lc.flag} {lc.label}</button>))}</div>
      {loc==="en"?(
        <div className="card" style={{padding:24,maxWidth:700}}>
          <h3 style={{marginBottom:20}}>English (Source Content)</h3>
          <div className="df-grid">
            <div className="df-field" style={{gridColumn:"1/-1"}}><label className="df-label">Title *</label><input required value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/></div>
            <div className="df-field"><label className="df-label" style={{display:"flex",alignItems:"center",gap:8}}><input type="checkbox" checked={form.screen_name==="pre_login"} onChange={e=>setForm({...form,screen_name:e.target.checked?"pre_login":""})}/> Pre-Login Splash</label><div className="df-hint">Shows before login page on PWA</div></div>
            <div className="df-field" style={{gridColumn:"1/-1"}}><label className="df-label">Subtitle</label><input value={form.subtitle} onChange={e=>setForm({...form,subtitle:e.target.value})}/></div>
            <div className="df-field"><label className="df-label">Active From</label><input type="datetime-local" value={form.active_from} onChange={e=>setForm({...form,active_from:e.target.value})}/></div>
            <div className="df-field"><label className="df-label">Active Until</label><input type="datetime-local" value={form.active_until} onChange={e=>setForm({...form,active_until:e.target.value})}/></div>
            <div className="df-field"><label className="df-label">CTA Text</label><input value={form.cta_text} onChange={e=>setForm({...form,cta_text:e.target.value})}/></div>
            <div className="df-field"><label className="df-label">CTA URL</label><input value={form.cta_url} onChange={e=>setForm({...form,cta_url:e.target.value})}/></div>
            <div className="df-field"><label className="df-label">Show Frequency</label><select value={form.show_frequency} onChange={e=>setForm({...form,show_frequency:e.target.value})}><option value="once_per_session">Once Per Session</option><option value="always">Always</option><option value="once_per_day">Once Per Day</option><option value="once">Once Only</option></select></div>
            <div className="df-field"><label className="df-label">Duration (ms)</label><input type="number" value={form.duration_ms} onChange={e=>setForm({...form,duration_ms:e.target.value})} placeholder="3000" min={500} step={100}/><div className="df-hint">How long to show the splash (default: 3000ms)</div></div>
            <div className="df-field"><label className="df-label" style={{display:"flex",alignItems:"center",gap:8}}><input type="checkbox" checked={form.dismissible} onChange={e=>setForm({...form,dismissible:e.target.checked})}/> Dismissible</label></div>
            <div className="df-field" style={{gridColumn:"1/-1"}}><label className="df-label">Image</label><div style={{display:"flex",gap:12,alignItems:"center"}}><input ref={fileRef} type="file" accept="image/*" onChange={handleUpload} style={{display:"none"}}/><button type="button" onClick={()=>fileRef.current?.click()} className="btn btn-sm btn-outline" disabled={uploading}><Upload size={14}/>{uploading?"Uploading...":"Upload Image"}</button>{img&&<><img src={img} alt="" style={{width:48,height:48,borderRadius:6,objectFit:"cover"}}/><button type="button" onClick={()=>{setForm({...form,image_url:""});setImg("");}} className="btn btn-ghost btn-sm" style={{color:"var(--color-error)"}}>Clear</button></>}</div></div>
            <GalleryUpload
              imageUrls={form.image_gallery_urls||[]}
              videoUrl={form.gallery_video_url||""}
              onImagesChange={urls => setForm({...form, image_gallery_urls: urls})}
              onVideoChange={url => setForm({...form, gallery_video_url: url})}
              disabled={uploading}
            />
            <div className="df-field"><label className="df-label" style={{display:"flex",alignItems:"center",gap:8}}><input type="checkbox" checked={form.is_active} onChange={e=>setForm({...form,is_active:e.target.checked})}/> Active</label></div>
          </div>
          <div className="df-actions" style={{marginTop:20}}><button type="button" onClick={()=>r.push("/content/pwa-splash")} className="btn btn-ghost">Cancel</button><button onClick={save} disabled={saving} className="btn btn-primary"><Save size={16}/>{saving?"Saving...":"Save Changes"}</button></div>
        </div>
      ):(
        <div className="card" style={{padding:24,maxWidth:700}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}><h3 style={{margin:0}}>{LOCALES.find(l=>l.code===loc)?.flag} {LOCALES.find(l=>l.code===loc)?.label} Translation</h3><button onClick={regenAll} disabled={regen} className="btn btn-primary btn-sm" aria-label="Refresh"><RefreshCw size={14}/>{regen?"...":"Regenerate All"}</button></div>
          <div className="df-grid">{TR_FIELDS.map(f=>{const k=`${loc}:${f.key}`;return(<div className="df-field" key={f.key}><label style={{fontSize:11,fontWeight:600,color:"var(--color-text-muted)"}}>{f.label}<span style={{fontWeight:400,fontStyle:"italic",marginLeft:8}}>EN:{(form[f.key]||"").slice(0,40)}</span></label><input value={tr[k]||""} onChange={e=>setTr(p=>({...p,[k]:e.target.value}))} style={{width:"100%",padding:"8px 10px",fontSize:13,border:tr[k]?"1px solid var(--color-border-light)":"2px solid #FCD34D",borderRadius:"var(--radius-sm)",background:tr[k]?"var(--color-bg-white)":"#FFFBEB"}}/></div>);})}</div>
          <div style={{marginTop:20}}><button onClick={saveAllTr} disabled={savingTr} className="btn btn-primary"><Save size={16}/>Save Translations</button></div>
        </div>
      )}
    </div>
  );
}
