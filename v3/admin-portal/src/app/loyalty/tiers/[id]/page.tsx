"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ArrowLeft, Save, RefreshCw } from "lucide-react";

const L = [{code:"en",label:"English",flag:"🇬🇧"},{code:"ms",label:"BM",flag:"🇲🇾"},{code:"zh",label:"中文",flag:"🇨🇳"},{code:"ta",label:"தமிழ்",flag:"🇮🇳"},{code:"tr",label:"TR",flag:"🇹🇷"}];
const F = [{key:"display_name",label:"Tier Name"}];

export default function TierEditPage() {
  const p = useParams(); const r = useRouter(); const id = p.id as string;
  const [form,setForm]=useState<Record<string,any>>({});
  const [loading,setLoading]=useState(true);
  const [loc,setLoc]=useState("en");
  const [saving,setSaving]=useState(false);
  const [msg,setMsg]=useState("");
  const [regen,setRegen]=useState(false);
  const [tr,setTr]=useState<Record<string,string>>({});

  useEffect(()=>{load();},[id]);

  const load = async () => {
    setLoading(true);
    try {
      const d = await api.getRaw<any>(`/admin/loyalty/tiers/${id}`);
      setForm({display_name:d.display_name||"",tier_key:d.tier_key||"",color_hex:d.color_hex||"#FFD700",min_lifetime_points:d.min_lifetime_points,points_multiplier:d.points_multiplier,sort_order:d.sort_order,is_active:d.is_active});
      const x:Record<string,string>={};
      for(const lc of L){if(lc.code==="en")continue;try{const rt=await api.getRaw<any>(`/translations?table_name=loyalty_tiers&record_id=${id}&locale=${lc.code}&per_page=10`);if(rt?.items)for(const t of rt.items){const fk=t.translation_key.split(".").pop()||"";x[`${lc.code}:${fk}`]=t.translated_text||"";}}catch{}}
      setTr(x);
    } catch {} finally { setLoading(false); }
  };

  const save = async () => { setSaving(true); try { const pl:any={...form};pl.min_lifetime_points=Number(pl.min_lifetime_points);pl.points_multiplier=Number(pl.points_multiplier);pl.sort_order=Number(pl.sort_order);await api.put(`/admin/loyalty/tiers/${id}`,pl);setMsg("Saved");setTimeout(()=>setMsg(""),2000); } catch {} finally { setSaving(false); } };

  const upsert = async(field:string,locale:string,src:string,text:string)=>{const rt=await api.getRaw<any>(`/translations?table_name=loyalty_tiers&record_id=${id}&column_name=${field}&locale=${locale}&per_page=1`);const ex=rt?.items?.[0];if(ex)await api.put(`/translations/${ex.id}`,{translated_text:text});else await api.post("/translations",{translation_key:`loyalty_tiers.${id}.${field}`,locale,namespace:"loyalty",translated_text:text,source_text:src,table_name:"loyalty_tiers",record_id:Number(id),column_name:field});};

  const regenAll = async () => { setRegen(true); let c=0; for(const f of F){const src=(form[f.key]||"").trim();if(!src)continue;try{const rt:any=await api.post("/translations/translate",{text:src,target_locale:loc,source_locale:"en"});if(rt?.translated_text){setTr(p=>({...p,[`${loc}:${f.key}`]:rt.translated_text}));await upsert(f.key,loc,src,rt.translated_text);c++;}}catch{}}setMsg(`Regenerated ${c}`);setTimeout(()=>setMsg(""),2500);setRegen(false); };

  const saveAll = async () => { for(const f of F){const t=tr[`${loc}:${f.key}`]||"";if(t)await upsert(f.key,loc,(form[f.key]||"").trim(),t);}setMsg("Saved");setTimeout(()=>setMsg(""),2000); };

  if(loading)return <div style={{padding:32}}>Loading...</div>;

  return (
    <div style={{padding:32}}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}><button onClick={()=>r.push("/loyalty/tiers")} className="btn btn-ghost btn-sm"><ArrowLeft size={18}/></button><div><h1 className="page-title" style={{margin:0}}>{form.display_name||"Tier"}</h1></div></div>
      {msg&&<div className="alert alert-success" style={{marginBottom:12}}>{msg}</div>}
      <div style={{display:"flex",gap:4,marginBottom:20,borderBottom:"2px solid var(--color-border-light)",paddingBottom:0}}>{L.map(lc=>(<button key={lc.code} onClick={()=>setLoc(lc.code)} style={{padding:"10px 20px",fontSize:13,fontWeight:loc===lc.code?700:400,border:"none",borderBottom:loc===lc.code?"3px solid var(--color-primary)":"3px solid transparent",background:loc===lc.code?"rgba(59,74,26,0.05)":"transparent",cursor:"pointer",color:loc===lc.code?"var(--color-primary)":"var(--color-text-muted)",borderRadius:"4px 4px 0 0"}}>{lc.flag} {lc.label}</button>))}</div>
      {loc==="en"?(
        <div className="card" style={{padding:24,maxWidth:500}}>
          <div className="df-grid">
            <div className="df-field"><label className="form-label">Display Name *</label><input className="w-full border rounded px-3 py-2 text-sm" value={form.display_name||""} onChange={e=>setForm({...form,display_name:e.target.value})}/></div>
            <div className="df-field"><label className="form-label">Key</label><input className="w-full border rounded px-3 py-2 text-sm" value={form.tier_key||""} onChange={e=>setForm({...form,tier_key:e.target.value})}/></div>
            <div className="df-field"><label className="form-label">Min Points</label><input type="number" className="w-full border rounded px-3 py-2 text-sm" value={form.min_lifetime_points??""} onChange={e=>setForm({...form,min_lifetime_points:e.target.value})}/></div>
            <div className="df-field"><label className="form-label">Multiplier</label><input type="number" step="0.1" className="w-full border rounded px-3 py-2 text-sm" value={form.points_multiplier??""} onChange={e=>setForm({...form,points_multiplier:e.target.value})}/></div>
            <div className="df-field"><label className="form-label">Sort Order</label><input type="number" className="w-full border rounded px-3 py-2 text-sm" value={form.sort_order??""} onChange={e=>setForm({...form,sort_order:e.target.value})}/></div>
            <div className="df-field"><label className="form-label">Color</label><div style={{display:"flex",alignItems:"center",gap:8}}><input type="color" value={form.color_hex||"#FFD700"} onChange={e=>setForm({...form,color_hex:e.target.value})} style={{width:40,height:36,border:"none",cursor:"pointer"}}/><input className="border rounded px-3 py-2 text-sm" style={{flex:1}} value={form.color_hex||""} onChange={e=>setForm({...form,color_hex:e.target.value})}/></div></div>
            <div className="df-field"><label style={{display:"flex",alignItems:"center",gap:8,fontSize:13}}><input type="checkbox" checked={!!form.is_active} onChange={e=>setForm({...form,is_active:e.target.checked})}/>Active</label></div>
          </div>
          <div className="df-actions" style={{marginTop:16}}><button type="button" onClick={()=>r.push("/loyalty/tiers")} className="btn btn-ghost">Cancel</button><button onClick={save} disabled={saving} className="btn btn-primary"><Save size={16}/>{saving?"Saving...":"Save"}</button></div>
        </div>
      ):(
        <div className="card" style={{padding:24,maxWidth:600}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}><h3 style={{margin:0}}>{L.find(l=>l.code===loc)?.flag} {L.find(l=>l.code===loc)?.label} Translation</h3><button onClick={regenAll} disabled={regen} className="btn btn-primary btn-sm"><RefreshCw size={14}/>{regen?"...":"Regenerate"}</button></div>
          <div className="df-grid">{F.map(f=>{const k=`${loc}:${f.key}`;return<div className="df-field" key={f.key}><label style={{fontSize:11,fontWeight:600,color:"var(--color-text-muted)"}}>{f.label}<span style={{fontWeight:400,fontStyle:"italic",marginLeft:8}}>EN: {(form[f.key]||"").slice(0,30)}</span></label><input value={tr[k]||""} onChange={e=>setTr(p=>({...p,[k]:e.target.value}))} style={{width:"100%",padding:"8px 10px",fontSize:13,border:tr[k]?"1px solid var(--color-border-light)":"2px solid #FCD34D",borderRadius:"var(--radius-sm)",background:tr[k]?"var(--color-bg-white)":"#FFFBEB"}} placeholder="—"/></div>;})}</div>
          <div style={{marginTop:20}}><button onClick={saveAll} className="btn btn-primary"><Save size={16}/>Save Translations</button></div>
        </div>
      )}
    </div>
  );
}
