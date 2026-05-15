"use client";
import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ArrowLeft, Save, RefreshCw, Upload } from "lucide-react";
import GalleryUpload from "@/components/GalleryUpload";

const LOCALES = [{code:"en",label:"English",flag:"🇬🇧"},{code:"ms",label:"BM",flag:"🇲🇾"},{code:"zh",label:"中文",flag:"🇨🇳"},{code:"ta",label:"தமிழ்",flag:"🇮🇳"},{code:"tr",label:"TR",flag:"🇹🇷"}];
const TR_FIELDS = [{key:"title",label:"Title"},{key:"short_description",label:"Short Description"},{key:"long_description",label:"Full Description"}];

export default function ProductEditPage() {
  const p = useParams(); const r = useRouter(); const id = p.id as string;
  const [loading,setLoading] = useState(true); const [loc,setLoc] = useState("en");
  const [saving,setSaving] = useState(false); const [savingTr,setSavingTr] = useState(false);
  const [msg,setMsg] = useState(""); const [regen,setRegen] = useState(false);
  const [uploading,setUploading] = useState(false); const [img,setImg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [form,setForm] = useState<Record<string,any>>({});
  const [tr,setTr] = useState<Record<string,string>>({});

  useEffect(()=>{load();},[id]);

  const load = async () => { setLoading(true);
    try{
      const d = await api.getRaw<any>(`/admin/product-cards/${id}`);
      setForm({title:d.title||"",short_description:d.short_description||"",long_description:d.long_description||"",image_url:d.image_url||"",image_gallery_urls:d.image_gallery_urls||[],gallery_video_url:d.gallery_video_url||"",price:d.price||0,position:d.position||0,is_active:d.is_active});
      setImg(d.image_url||"");
      const x:Record<string,string>={};
      for(const lc of LOCALES){if(lc.code==="en")continue;try{const rt=await api.getRaw<any>(`/translations?table_name=product_cards&record_id=${id}&locale=${lc.code}&per_page=50`);if(rt?.items)for(const t of rt.items){const f=t.translation_key.split(".").pop()||"";x[`${lc.code}:${f}`]=t.translated_text||"";}}catch{}}
      setTr(x);
    }catch{}finally{setLoading(false);}
  };

  const handleUpload = async () => { const f = fileRef.current?.files?.[0]; if(!f)return; setUploading(true);
    try{const fd=new FormData();fd.append("file",f);const j=await api.upload("/upload/image",fd);const url=j.url||j.filename||"";setForm({...form,image_url:url});setImg(url);}catch{}finally{setUploading(false)}; };

  const save = async () => { setSaving(true);
    try{const pl={...form,price:Number(form.price)||0};await api.patch(`/admin/product-cards/${id}`,pl);setMsg("Saved");setTimeout(()=>setMsg(""),2000);}catch{}finally{setSaving(false)}; };

  const upsertTr = async(field:string,locale:string,src:string,text:string)=>{
    try{const rt=await api.getRaw<any>(`/translations?table_name=product_cards&record_id=${id}&column_name=${field}&locale=${locale}&per_page=1`);const ex=rt?.items?.[0];if(ex)await api.put(`/translations/${ex.id}`,{translated_text:text});else await api.post("/translations",{translation_key:`product_cards.${id}.${field}`,locale,namespace:"content",translated_text:text,source_text:src,table_name:"product_cards",record_id:Number(id),column_name:field});}catch{}
  };

  const regenAll = async () => { setRegen(true); let c=0;
    for(const f of TR_FIELDS){const src=(form[f.key]||"").trim();if(!src)continue;try{const rt:any=await api.post("/translations/translate",{text:src,target_locale:loc,source_locale:"en"});if(rt?.translated_text){setTr(p=>({...p,[`${loc}:${f.key}`]:rt.translated_text}));await upsertTr(f.key,loc,src,rt.translated_text);c++;}}catch{}}
    setMsg(`Regenerated ${c}`);setTimeout(()=>setMsg(""),2500);setRegen(false);
  };

  const saveAllTr = async () => { setSavingTr(true);
    for(const f of TR_FIELDS){const t=tr[`${loc}:${f.key}`]||"";if(t)await upsertTr(f.key,loc,(form[f.key]||"").trim(),t);}
    setMsg("Translations saved");setTimeout(()=>setMsg(""),2000);setSavingTr(false);
  };

  if(loading)return <div style={{padding:32}}>Loading...</div>;

  return (
    <div style={{padding:32}}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}><button onClick={()=>r.push("/content/products")} className="btn btn-ghost btn-sm"><ArrowLeft size={18}/></button><div><h1 className="page-title" style={{margin:0}}>{form.title||"Product"}</h1></div></div>
      {msg&&<div className="alert alert-success" style={{marginBottom:12}}>{msg}</div>}
      <div style={{display:"flex",gap:4,marginBottom:20,borderBottom:"2px solid var(--color-border-light)",paddingBottom:0}}>{LOCALES.map(lc=>(<button key={lc.code} onClick={()=>setLoc(lc.code)} style={{padding:"10px 20px",fontSize:13,fontWeight:loc===lc.code?700:400,border:"none",borderBottom:loc===lc.code?"3px solid var(--color-primary)":"3px solid transparent",background:loc===lc.code?"rgba(59,74,26,0.05)":"transparent",cursor:"pointer",color:loc===lc.code?"var(--color-primary)":"var(--color-text-muted)",borderRadius:"4px 4px 0 0"}}>{lc.flag} {lc.label}</button>))}</div>
      {loc==="en"?(
        <div className="card" style={{padding:24,maxWidth:700}}>
          <h3 style={{marginBottom:20}}>English (Source Content)</h3>
          <div className="df-grid">
            <div className="df-field" style={{gridColumn:"1/-1"}}><label className="df-label">Title *</label><input required value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/></div>
            <div className="df-field"><label className="df-label">Price (RM)</label><input type="number" step="0.01" value={form.price} onChange={e=>setForm({...form,price:e.target.value})}/></div>
            <div className="df-field"><label className="df-label">Position</label><input type="number" value={form.position} onChange={e=>setForm({...form,position:Number(e.target.value)})}/></div>
            <div className="df-field" style={{gridColumn:"1/-1"}}><label className="df-label">Short Description</label><input value={form.short_description} onChange={e=>setForm({...form,short_description:e.target.value})}/></div>
            <div className="df-field" style={{gridColumn:"1/-1"}}><label className="df-label">Full Description</label><textarea rows={3} value={form.long_description} onChange={e=>setForm({...form,long_description:e.target.value})}/></div>
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
          <div className="df-actions" style={{marginTop:20}}><button type="button" onClick={()=>r.push("/content/products")} className="btn btn-ghost">Cancel</button><button onClick={save} disabled={saving} className="btn btn-primary"><Save size={16}/>{saving?"Saving...":"Save Changes"}</button></div>
        </div>
      ):(
        <div className="card" style={{padding:24,maxWidth:700}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}><h3 style={{margin:0}}>{LOCALES.find(l=>l.code===loc)?.flag} {LOCALES.find(l=>l.code===loc)?.label} Translation</h3><button onClick={regenAll} disabled={regen} className="btn btn-primary btn-sm"><RefreshCw size={14}/>{regen?"...":"Regenerate All"}</button></div>
          <div className="df-grid">{TR_FIELDS.map(f=>{const k=`${loc}:${f.key}`;const isLong=f.key==="long_description";return(<div className="df-field" key={f.key} style={isLong?{gridColumn:"1/-1"}:{}}><label style={{fontSize:11,fontWeight:600,color:"var(--color-text-muted)"}}>{f.label}<span style={{fontWeight:400,fontStyle:"italic",marginLeft:8}}>EN:{(form[f.key]||"").slice(0,40)}</span></label>{isLong?<textarea rows={3} value={tr[k]||""} onChange={e=>setTr(p=>({...p,[k]:e.target.value}))} style={{width:"100%",padding:"8px 10px",fontSize:13,border:tr[k]?"1px solid var(--color-border-light)":"2px solid #FCD34D",borderRadius:"var(--radius-sm)",background:tr[k]?"var(--color-bg-white)":"#FFFBEB"}}/>:<input value={tr[k]||""} onChange={e=>setTr(p=>({...p,[k]:e.target.value}))} style={{width:"100%",padding:"8px 10px",fontSize:13,border:tr[k]?"1px solid var(--color-border-light)":"2px solid #FCD34D",borderRadius:"var(--radius-sm)",background:tr[k]?"var(--color-bg-white)":"#FFFBEB"}}/>}</div>);})}</div>
          <div style={{marginTop:20}}><button onClick={saveAllTr} disabled={savingTr} className="btn btn-primary"><Save size={16}/>Save Translations</button></div>
        </div>
      )}
    </div>
  );
}
