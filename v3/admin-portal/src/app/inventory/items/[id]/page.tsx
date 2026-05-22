"use client";
import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ArrowLeft, Save, RefreshCw, Upload } from "lucide-react";

const LOCALES = [{code:"en",label:"English",flag:"🇬🇧"},{code:"ms",label:"BM",flag:"🇲🇾"},{code:"zh",label:"中文",flag:"🇨🇳"},{code:"ta",label:"தமிழ்",flag:"🇮🇳"},{code:"tr",label:"TR",flag:"🇹🇷"}];
const TR_FIELDS = [{key:"item_name",label:"Item Name"},{key:"description",label:"Description"}];

export default function InventoryItemEditPage() {
  const p = useParams(); const router = useRouter(); const itemId = p.id as string;
  const [form,setForm]=useState<Record<string,any>>({});
  const [loading,setLoading]=useState(true);
  const [activeLocale,setActiveLocale] = useState("en");
  const [saving,setSaving] = useState(false);
  const [msg,setMsg] = useState("");
  const [regenerating,setRegenerating] = useState(false);
  const [translations,setTranslations] = useState<Record<string,string>>({});
  const [categories,setCategories] = useState<any[]>([]);
  const [suppliers,setSuppliers] = useState<any[]>([]);
  const [uploading,setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(()=>{load(); loadRefs();},[itemId]);

  const loadRefs = async () => {
    try{const d=await api.getRaw<any>("/admin/inventory/categories?store_id=1&per_page=50");setCategories(Array.isArray(d)?d:(d.items||[]));}catch{}
    try{const d=await api.getRaw<any>("/admin/inventory/suppliers?store_id=1");setSuppliers(Array.isArray(d)?d:(d.items||[]));}catch{}
  };

  const load = async () => {
    setLoading(true);
    try {
      const d = await api.getRaw<any>(`/admin/inventory/items/${itemId}`);
      setForm({
        item_name:d.item_name||"", item_code:d.item_code||"", description:d.description||"",
        category_id:d.category_id||"", supplier_id:d.supplier_id||"",
        unit_of_measure:d.unit_of_measure||"kg", current_stock:d.current_stock||0,
        reorder_level:d.reorder_level||0, unit_cost:d.unit_cost||0, is_active:d.is_active,
        image_url:d.image_url||"",
      });
      const x:Record<string,string>={};
      for(const lc of LOCALES){if(lc.code==="en")continue;try{const rt=await api.getRaw<any>(`/admin/translations?table_name=inventory_items&record_id=${itemId}&locale=${lc.code}&per_page=50`);if(rt?.items)for(const t of rt.items){const f=t.translation_key.split(".").pop()||"";x[`${lc.code}:${f}`]=t.translated_text||"";}}catch{}}
      setTranslations(x);
    }catch{}finally{setLoading(false);}
  };

  const save = async () => {
    setSaving(true);
    try {
      const pl:any={...form,category_id:Number(form.category_id)||null,supplier_id:Number(form.supplier_id)||null,current_stock:Number(form.current_stock),reorder_level:Number(form.reorder_level),unit_cost:Number(form.unit_cost)};
      await api.patch(`/admin/inventory/items/${itemId}`,pl);setMsg("Saved");setTimeout(()=>setMsg(""),2000);
    }catch{}finally{setSaving(false);}
  };

  const upsertTr = async(field:string,locale:string,src:string,text:string)=>{
    try{const rt=await api.getRaw<any>(`/admin/translations?table_name=inventory_items&record_id=${itemId}&column_name=${field}&locale=${locale}&per_page=1`);const ex=rt?.items?.[0];if(ex)await api.put(`/admin/translations/${ex.id}`,{translated_text:text});else await api.post("/admin/translations",{translation_key:`inventory_items.${itemId}.${field}`,locale,namespace:"inventory",translated_text:text,source_text:src,table_name:"inventory_items",record_id:Number(itemId),column_name:field});}catch{}
  };

  const regenerateAll = async () => {
    setRegenerating(true);let count=0;
    for(const f of TR_FIELDS){const src=(form[f.key]||"").trim();if(!src)continue;try{const r:any=await api.post("/admin/translations/translate",{text:src,target_locale:activeLocale,source_locale:"en"});if(r?.translated_text){setTranslations(p=>({...p,[`${activeLocale}:${f.key}`]:r.translated_text}));await upsertTr(f.key,activeLocale,src,r.translated_text);count++;}}catch{}}
    setMsg(`Regenerated ${count} ${activeLocale.toUpperCase()} translations`);setTimeout(()=>setMsg(""),2500);setRegenerating(false);
  };

  const saveAllTr = async () => {
    for(const f of TR_FIELDS){const text=translations[`${activeLocale}:${f.key}`]||"";if(text)await upsertTr(f.key,activeLocale,(form[f.key]||"").trim(),text);}
    setMsg("Translations saved");setTimeout(()=>setMsg(""),2000);
  };

  if(loading)return <div style={{padding:32}}>Loading...</div>;

  return (
    <div style={{padding:32}}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}><button onClick={()=>router.push("/inventory/items")} className="btn btn-ghost btn-sm"><ArrowLeft size={18}/></button><div><h1 className="page-title" style={{margin:0}}>{form.item_name||"Item"}</h1></div></div>
      {msg&&<div className="alert alert-success" style={{marginBottom:12}}>{msg}</div>}

      <div style={{display:"flex",gap:4,marginBottom:20,borderBottom:"2px solid var(--color-border-light)",paddingBottom:0}}>
        {LOCALES.map(lc=>(
          <button key={lc.code} onClick={()=>setActiveLocale(lc.code)}
            style={{padding:"10px 20px",fontSize:13,fontWeight:activeLocale===lc.code?700:400,border:"none",borderBottom:activeLocale===lc.code?"3px solid var(--color-primary)":"3px solid transparent",background:activeLocale===lc.code?"rgba(59,74,26,0.05)":"transparent",cursor:"pointer",color:activeLocale===lc.code?"var(--color-primary)":"var(--color-text-muted)",borderRadius:"4px 4px 0 0"}}>{lc.flag} {lc.label}</button>
        ))}
      </div>

      {activeLocale==="en"?(
        <div className="card" style={{padding:24,maxWidth:700}}>
          <div className="df-grid">
            <div className="df-field"><label className="df-label">Name *</label><input required className="w-full border rounded px-3 py-2 text-sm" value={form.item_name||""} onChange={e=>setForm({...form,item_name:e.target.value})}/></div>
            <div className="df-field"><label className="df-label">Code</label><input className="w-full border rounded px-3 py-2 text-sm" value={form.item_code||""} onChange={e=>setForm({...form,item_code:e.target.value})} placeholder="auto-generated"/></div>
            <div className="df-field" style={{gridColumn:"1/-1"}}><label className="df-label">Description</label><input className="w-full border rounded px-3 py-2 text-sm" value={form.description||""} onChange={e=>setForm({...form,description:e.target.value})}/></div>
            <div className="df-field"><label className="df-label">Unit</label><select className="w-full border rounded px-3 py-2 text-sm" value={form.unit_of_measure||"kg"} onChange={e=>setForm({...form,unit_of_measure:e.target.value})}><option value="kg">kg</option><option value="g">g</option><option value="L">L</option><option value="ml">ml</option><option value="pcs">pcs</option><option value="pack">pack</option></select></div>
            <div className="df-field"><label className="df-label">Category</label><select className="w-full border rounded px-3 py-2 text-sm" value={form.category_id||""} onChange={e=>setForm({...form,category_id:e.target.value})}><option value="">—</option>{categories.map((c:any)=><option key={c.id} value={c.id}>{c.category_name||c.name}</option>)}</select></div>
            <div className="df-field"><label className="df-label">Supplier</label><select className="w-full border rounded px-3 py-2 text-sm" value={form.supplier_id||""} onChange={e=>setForm({...form,supplier_id:e.target.value})}><option value="">—</option>{suppliers.map((s:any)=><option key={s.id} value={s.id}>{s.supplier_name}</option>)}</select></div>
            <div className="df-field"><label className="df-label">Current Stock</label><input type="number" className="w-full border rounded px-3 py-2 text-sm" value={form.current_stock} onChange={e=>setForm({...form,current_stock:e.target.value})}/></div>
            <div className="df-field"><label className="df-label">Reorder Level</label><input type="number" className="w-full border rounded px-3 py-2 text-sm" value={form.reorder_level} onChange={e=>setForm({...form,reorder_level:e.target.value})}/></div>
            <div className="df-field"><label className="df-label">Unit Cost (RM)</label><input type="number" step="0.01" className="w-full border rounded px-3 py-2 text-sm" value={form.unit_cost} onChange={e=>setForm({...form,unit_cost:e.target.value})}/></div>
            <div className="df-field" style={{gridColumn:"1/-1"}}><label className="df-label">Image</label><div style={{display:"flex",gap:12,alignItems:"center"}}><input ref={fileRef} type="file" accept="image/*" onChange={async()=>{const f=fileRef.current?.files?.[0];if(!f)return;setUploading(true);try{const fd=new FormData();fd.append("file",f);const j=await api.upload("/upload/image",fd);const url=j.url||j.filename||"";setForm({...form,image_url:url})}catch{}finally{setUploading(false)}}} style={{display:"none"}}/><button type="button" onClick={()=>fileRef.current?.click()} className="btn btn-sm btn-outline" disabled={uploading}><Upload size={14}/>{uploading?"Uploading...":"Upload Image"}</button>{form.image_url&&<span style={{fontSize:12,color:"var(--color-success)"}}>✓ {form.image_url.split("/").pop()}</span>}</div></div>
            <div className="df-field"><label style={{display:"flex",alignItems:"center",gap:8,fontSize:13}}><input type="checkbox" checked={!!form.is_active} onChange={e=>setForm({...form,is_active:e.target.checked})}/>Active</label></div>
          </div>
          <div className="df-actions" style={{marginTop:16}}><button type="button" onClick={()=>router.push("/inventory/items")} className="btn btn-ghost">Cancel</button><button onClick={save} disabled={saving} className="btn btn-primary"><Save size={16}/>{saving?"Saving...":"Save"}</button></div>
        </div>
      ):(
        <div className="card" style={{padding:24,maxWidth:600}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}><h3 style={{margin:0}}>{LOCALES.find(l=>l.code===activeLocale)?.flag} {LOCALES.find(l=>l.code===activeLocale)?.label} Translation</h3><button onClick={regenerateAll} disabled={regenerating} className="btn btn-primary btn-sm"><RefreshCw size={14}/>{regenerating?"...":"Regenerate"}</button></div>
          <div className="df-grid">{TR_FIELDS.map(f=>{const trKey=`${activeLocale}:${f.key}`;return(<div className="df-field" key={f.key}><label style={{fontSize:11,fontWeight:600,color:"var(--color-text-muted)"}}>{f.label}<span style={{fontWeight:400,fontStyle:"italic",marginLeft:8}}>EN:{(form[f.key]||"").slice(0,30)}</span></label><input value={translations[trKey]||""} onChange={e=>setTranslations(p=>({...p,[trKey]:e.target.value}))} style={{width:"100%",padding:"8px 10px",fontSize:13,border:translations[trKey]?"1px solid var(--color-border-light)":"2px solid #FCD34D",borderRadius:"var(--radius-sm)",background:translations[trKey]?"var(--color-bg-white)":"#FFFBEB"}} placeholder="—"/></div>);})}</div>
          <div style={{marginTop:20}}><button onClick={saveAllTr} className="btn btn-primary"><Save size={16}/>Save Translation</button></div>
        </div>
      )}
    </div>
  );
}
