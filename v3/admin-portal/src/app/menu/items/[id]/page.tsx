"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ArrowLeft, Save, RefreshCw, Upload, Plus, Trash2 } from "lucide-react";

const LOCALES = [{code:"en",label:"English",flag:"🇬🇧"},{code:"ms",label:"BM",flag:"🇲🇾"},{code:"zh",label:"中文",flag:"🇨🇳"},{code:"ta",label:"தமிழ்",flag:"🇮🇳"},{code:"tr",label:"TR",flag:"🇹🇷"}];
const TR_FIELDS = [{key:"item_name",label:"Item Name"},{key:"description",label:"Description"},{key:"long_description",label:"Long Description"}];

export default function ItemEditPage() {
  const p = useParams(); const r = useRouter(); const id = p.id as string;
  const [form,setForm]=useState<Record<string,any>>({});
  const [loading,setLoading]=useState(true);
  const [loc,setLoc] = useState("en");
  const [saving,setSaving] = useState(false);
  const [msg,setMsg] = useState("");
  const [regen,setRegen] = useState(false);
  const [tr,setTr] = useState<Record<string,string>>({});
  const [modTr, setModTr] = useState<{groups: {id:number;name:string;options:{id:number;name:string}[]}[]}>({groups:[]});
  const [savingTr,setSavingTr] = useState(false);
  const [categories,setCategories] = useState<any[]>([]);
  const [allergens,setAllergens] = useState<any[]>([]);
  const [dietaryTags,setDietaryTags] = useState<any[]>([]);
  const [taxCategories,setTaxCategories] = useState<any[]>([]);
  const [loyaltyTiers,setLoyaltyTiers] = useState<any[]>([]);
  const [inventoryItems,setInventoryItems] = useState<any[]>([]);
  const [uploading,setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadRefs = useCallback(async () => {
    const raw = (d:any) => Array.isArray(d)?d:(d?.items||[]);
    try{const d=await api.getRaw<any>("/admin/menu/categories?per_page=50");setCategories(raw(d));}catch (e) { console.error(e); }
    try{const d=await api.getRaw<any>("/admin/menu/allergens");setAllergens(raw(d));}catch (e) { console.error(e); }
    try{const d=await api.getRaw<any>("/admin/dietary-tags?per_page=50");setDietaryTags(raw(d));}catch (e) { console.error(e); }
    try{const d=await api.getRaw<any>("/admin/menu/tax-categories");setTaxCategories(raw(d));}catch (e) { console.error(e); }
    try{const d=await api.getRaw<any>("/admin/loyalty/tiers");setLoyaltyTiers(raw(d));}catch (e) { console.error(e); }
  }, []);

  const loadItem = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api.getRaw<any>(`/admin/menu/items/${id}`);
      setForm({
        item_name:d.item_name||"", item_code:d.item_code||"", base_price:d.base_price,
        description:d.description||"", long_description:d.long_description||"",
        category_id:d.category_id||"", tax_category_id:d.tax_category_id||"",
        allergen_ids:(d.allergens||[]).map((a:any)=>a.id),
        dietary_tag_ids:(d.dietary_tags||[]).map((t:any)=>t.id||t.dietary_tag_id),
        is_available:d.is_available, is_featured:d.is_featured,
        calories:d.calories??"", prep_time_minutes:d.prep_time_minutes??10,
        minimum_tier_id:d.minimum_tier_id??"",
        modifier_groups:d.modifier_groups||[], image_url:d.image_url||"",
        recipes:d.recipes||[],
      });
      // Load translations
      const x:Record<string,string>={};
      const itemResults = await Promise.all(
        LOCALES.filter(lc => lc.code !== "en").map(async (lc) => {
          try {
            const rt = await api.getRaw<any>(`/admin/translations?table_name=menu_items&record_id=${id}&locale=${lc.code}&per_page=50`);
            return { lc: lc.code, rt };
          } catch (e) { console.error(e); return { lc: lc.code, rt: null }; }
        })
      );
      for (const { lc, rt } of itemResults) {
        if (rt?.items) for (const t of rt.items) {
          const f = t.translation_key.split(".").pop() || "";
          x[`${lc}:${f}`] = t.translated_text || "";
        }
      }
      const mg = (d.modifier_groups||[]).map((g:any)=>({id:g.id,name:g.group_name,options:(g.options||[]).map((o:any)=>({id:o.id,name:o.option_name}))}));
      setModTr({groups:mg});
      setTr(x);
      // Load modifier translations for each locale (parallel)
      const modResults = await Promise.all(
        LOCALES.filter(lc => lc.code !== "en").map(async (lc) => {
          try {
            const grt = await api.getRaw<any>(`/admin/translations?table_name=menu_modifier_groups&locale=${lc.code}&per_page=100`);
            const ort = await api.getRaw<any>(`/admin/translations?table_name=menu_modifier_options&locale=${lc.code}&per_page=100`);
            return { lc: lc.code, grt, ort };
          } catch (e) { console.error(e); return { lc: lc.code, grt: null, ort: null }; }
        })
      );
      for (const { lc, grt, ort } of modResults) {
        if (grt?.items) for (const t of grt.items) {
          x[`${lc}:mod:group_${t.record_id}`] = t.translated_text || "";
        }
        if (ort?.items) for (const t of ort.items) {
          x[`${lc}:mod:opt_${t.record_id}`] = t.translated_text || "";
        }
      }
      setTr({ ...x });
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, [id]);

  useEffect(()=>{loadItem(); loadRefs(); loadInventoryForStore();},[id, loadItem, loadRefs]);

  const toggleTag = (type:"allergen"|"dietary", aid:number) => {
    const key = type==="allergen"?"allergen_ids":"dietary_tag_ids";
    const arr = form[key] as number[];
    setForm({...form, [key]: arr.includes(aid) ? arr.filter(x=>x!==aid) : [...arr, aid]});
  };

  const addGroup = () => setForm({...form, modifier_groups: [...(form.modifier_groups||[]), {group_name:"",selection_type:"single",min_selections:0,max_selections:1,is_required:false,options:[]}]});
  const updateGroup = (i:number, p:any) => { const g=[...(form.modifier_groups||[])]; g[i]={...g[i],...p}; setForm({...form,modifier_groups:g}); };
  const removeGroup = (i:number) => setForm({...form, modifier_groups: (form.modifier_groups||[]).filter((_:any,j:number)=>j!==i)});
  const addOpt = (gi:number) => { const g=[...(form.modifier_groups||[])]; g[gi].options.push({option_name:"",price_adjustment:0,is_default:false,is_available:true}); setForm({...form,modifier_groups:g}); };
  const updateOpt = (gi:number, oi:number, p:any) => { const g=[...(form.modifier_groups||[])]; g[gi].options[oi]={...g[gi].options[oi],...p}; setForm({...form,modifier_groups:g}); };
  const removeOpt = (gi:number, oi:number) => { const g=[...(form.modifier_groups||[])]; g[gi].options=g[gi].options.filter((_:any,j:number)=>j!==oi); setForm({...form,modifier_groups:g}); };

  const loadInventoryForStore = useCallback(async () => {
    try{const d=await api.getRaw<any>("/admin/inventory/items?per_page=500");setInventoryItems(Array.isArray(d)?d:(d.items||[]));}catch(e){console.error(e);setInventoryItems([]);}
  }, []);

  const addRecipe = () => setForm({...form, recipes: [...(form.recipes||[]), {inventory_item_id:"",quantity_required:1,unit_of_measure:"unit",waste_factor:0.05,is_primary_component:false}]});
  const updateRecipe = (i:number, p:any) => { const r=[...(form.recipes||[])]; r[i]={...r[i],...p}; setForm({...form,recipes:r}); };
  const removeRecipe = (i:number) => setForm({...form, recipes: (form.recipes||[]).filter((_:any,j:number)=>j!==i)});

  const save = async () => {
    setSaving(true);
    try {
      const pl:any = {...form};
      pl.base_price = Number(pl.base_price) || 0;
      pl.category_id = Number(pl.category_id) || null;
      pl.tax_category_id = Number(pl.tax_category_id) || null;
      pl.calories = pl.calories ? Number(pl.calories) : null;
      pl.prep_time_minutes = Number(pl.prep_time_minutes) ?? 10;
      pl.minimum_tier_id = pl.minimum_tier_id ? Number(pl.minimum_tier_id) : null;
      await api.patch(`/admin/menu/items/${id}`, pl);
      setMsg("Saved"); setTimeout(()=>setMsg(""),2000);
    } catch (e) { console.error(e); } finally { setSaving(false); }
  };

  const upsertTr = async(field:string,locale:string,src:string,text:string)=>{
    try{const rt=await api.getRaw<any>(`/admin/translations?table_name=menu_items&record_id=${id}&column_name=${field}&locale=${locale}&per_page=1`);const ex=rt?.items?.[0];if(ex)await api.put(`/admin/translations/${ex.id}`,{translated_text:text});else await api.post("/admin/translations",{translation_key:`menu_items.${id}.${field}`,locale,namespace:"menu",translated_text:text,source_text:src,table_name:"menu_items",record_id:Number(id),column_name:field});}catch (e) { console.error(e); }
  };

  const regenAll = async () => {
    setRegen(true); let c=0;
    for(const f of TR_FIELDS){const src=(form[f.key]||"").trim();if(!src)continue;try{const rt:any=await api.post("/admin/translations/translate",{text:src,target_locale:loc,source_locale:"en"});if(rt?.translated_text){setTr(p=>({...p,[`${loc}:${f.key}`]:rt.translated_text}));await upsertTr(f.key,loc,src,rt.translated_text);c++;}}catch (e) { console.error(e); }}
    setMsg(`Regenerated ${c}`);setTimeout(()=>setMsg(""),2500);setRegen(false);
  };

  const saveAllTr = async () => {setSavingTr(true);for(const f of TR_FIELDS){const t=tr[`${loc}:${f.key}`]||"";if(t)await upsertTr(f.key,loc,(form[f.key]||"").trim(),t);}setMsg("Translations saved");setTimeout(()=>setMsg(""),2000);setSavingTr(false);};

  const handleUpload = async () => {const f=fileRef.current?.files?.[0];if(!f)return;setUploading(true);try{const fd=new FormData();fd.append("file",f);const j=await api.upload("/upload/image",fd);setForm({...form,image_url:j.url||j.filename});if(fileRef.current)fileRef.current.value="";}catch(e){console.error(e);}finally{setUploading(false);}};

  const Chip = ({label,icon,active,onClick}:{label:string;icon?:string;active:boolean;onClick:()=>void}) => (
    <button type="button" onClick={onClick} style={{display:"inline-flex",alignItems:"center",gap:4,padding:"3px 10px",borderRadius:"var(--radius-full)",fontSize:12,fontWeight:500,cursor:"pointer",border:active?"2px solid var(--color-primary)":"1px solid var(--color-border-light)",background:active?"rgba(59,74,26,0.08)":"var(--color-bg-white)",color:active?"var(--color-primary)":"var(--color-text-muted)"}}>{icon&&<span>{icon}</span>}{label}</button>
  );

  if(loading)return <div style={{padding:32}}>Loading...</div>;

  return (
    <div style={{padding:32}}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}><button onClick={()=>r.push("/menu/items")} className="btn btn-ghost btn-sm"><ArrowLeft size={18}/></button><div><h1 className="page-title" style={{margin:0}}>{form.item_name||"Item"}</h1></div></div>
      {msg&&<div className="alert alert-success" style={{marginBottom:12}}>{msg}</div>}
      <div style={{display:"flex",gap:4,marginBottom:20,borderBottom:"2px solid var(--color-border-light)",paddingBottom:0}}>{LOCALES.map(lc=>(<button key={lc.code} onClick={()=>setLoc(lc.code)} style={{padding:"10px 20px",fontSize:13,fontWeight:loc===lc.code?700:400,border:"none",borderBottom:loc===lc.code?"3px solid var(--color-primary)":"3px solid transparent",background:loc===lc.code?"rgba(59,74,26,0.05)":"transparent",cursor:"pointer",color:loc===lc.code?"var(--color-primary)":"var(--color-text-muted)",borderRadius:"4px 4px 0 0"}}>{lc.flag} {lc.label}</button>))}</div>

      {loc==="en"?(
        <div className="card" style={{padding:24,maxWidth:700}}>
          <div className="df-grid">
            <div className="df-field"><label className="form-label">Name *</label><input className="w-full border rounded px-3 py-2 text-sm" value={form.item_name||""} onChange={e=>setForm({...form,item_name:e.target.value})}/></div>
            <div className="df-field"><label className="form-label">Code</label><input className="w-full border rounded px-3 py-2 text-sm" value={form.item_code||""} onChange={e=>setForm({...form,item_code:e.target.value})}/></div>
            <div className="df-field"><label className="form-label">Price *</label><input type="number" step="0.01" className="w-full border rounded px-3 py-2 text-sm" value={form.base_price != null ? Number(form.base_price).toFixed(2) : ""} onChange={e=>setForm({...form,base_price:e.target.value})}/></div>
            <div className="df-field"><label className="form-label">Category</label><select className="w-full border rounded px-3 py-2 text-sm" value={form.category_id||""} onChange={e=>setForm({...form,category_id:e.target.value})}><option value="">—</option>{categories.map((c:any)=><option key={c.id} value={c.id}>{c.category_name}</option>)}</select></div>
            <div className="df-field"><label className="form-label">Tax</label><select className="w-full border rounded px-3 py-2 text-sm" value={form.tax_category_id||""} onChange={e=>setForm({...form,tax_category_id:e.target.value})}><option value="">—</option>{taxCategories.map((t:any)=><option key={t.id} value={t.id}>{t.category_name} ({(t.rate*100).toFixed(0)}%)</option>)}</select></div>
            <div className="df-field" style={{gridColumn:"1/-1"}}><label className="form-label">Description</label><input className="w-full border rounded px-3 py-2 text-sm" value={form.description||""} onChange={e=>setForm({...form,description:e.target.value})}/></div>
            <div className="df-field" style={{gridColumn:"1/-1"}}><label className="form-label">Long Description</label><textarea rows={3} className="w-full border rounded px-3 py-2 text-sm" value={form.long_description||""} onChange={e=>setForm({...form,long_description:e.target.value})}/></div>
            <div className="df-field" style={{gridColumn:"1/-1"}}><label className="form-label">Image</label><div style={{display:"flex",gap:8,alignItems:"center"}}><input ref={fileRef} type="file" accept="image/*" onChange={handleUpload} style={{display:"none"}}/><button type="button" onClick={()=>fileRef.current?.click()} className="btn btn-sm btn-outline" disabled={uploading}><Upload size={14}/>{uploading?"Uploading...":"Upload Image"}</button>{form.image_url&&<span style={{fontSize:12,color:"var(--color-success)"}}>✓ {form.image_url.split("/").pop()}</span>}</div></div>
            <div className="df-field" style={{gridColumn:"1/-1"}}><label className="form-label">Allergens</label><div style={{display:"flex",flexWrap:"wrap",gap:6}}>{allergens.map((a:any)=><Chip key={a.id} label={a.display_name} active={form.allergen_ids?.includes(a.id)} onClick={()=>toggleTag("allergen",a.id)}/>)}</div></div>
            <div className="df-field" style={{gridColumn:"1/-1"}}><label className="form-label">Dietary Tags</label><div style={{display:"flex",flexWrap:"wrap",gap:6}}>{dietaryTags.map((t:any)=><Chip key={t.id} label={t.display_name} icon={t.icon} active={form.dietary_tag_ids?.includes(t.id)} onClick={()=>toggleTag("dietary",t.id)}/>)}</div></div>
            <div className="df-field"><label className="form-label">Calories</label><input type="number" min="0" className="w-full border rounded px-3 py-2 text-sm" value={form.calories??""} onChange={e=>setForm({...form,calories:e.target.value})} placeholder="e.g. 250"/></div>
            <div className="df-field"><label className="form-label">Prep Time (min)</label><input type="number" min="1" className="w-full border rounded px-3 py-2 text-sm" value={form.prep_time_minutes??""} onChange={e=>setForm({...form,prep_time_minutes:e.target.value})}/></div>
            <div className="df-field">
              <label className="form-label">Minimum Tier</label>
              <select className="w-full border rounded px-3 py-2 text-sm" value={form.minimum_tier_id??""} onChange={e=>setForm({...form,minimum_tier_id:e.target.value})}>
                <option value="">— No Restriction —</option>
                {loyaltyTiers.map((t:any) => <option key={t.id} value={t.id}>{t.display_name}</option>)}
              </select>
            </div>
            <div className="df-field"><label style={{display:"flex",alignItems:"center",gap:8,fontSize:13}}><input type="checkbox" checked={!!form.is_available} onChange={e=>setForm({...form,is_available:e.target.checked})}/>Available</label></div>
            <div className="df-field"><label style={{display:"flex",alignItems:"center",gap:8,fontSize:13}}><input type="checkbox" checked={!!form.is_featured} onChange={e=>setForm({...form,is_featured:e.target.checked})}/>Featured</label></div>
            <div className="df-field" style={{gridColumn:"1/-1"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}><label className="form-label" style={{margin:0}}>Add-ons / Modifiers</label><button type="button" onClick={addGroup} className="btn btn-sm btn-outline"><Plus size={14}/>Add</button></div>
              {(form.modifier_groups||[]).map((g:any,gi:number)=>(<div key={gi} style={{background:"var(--color-bg-muted)",borderRadius:"var(--radius-md)",padding:12,marginBottom:12,border:"1px solid var(--color-border-light)"}}><div style={{display:"flex",gap:8,marginBottom:8}}><input placeholder="Group name" value={g.group_name} onChange={e=>updateGroup(gi,{group_name:e.target.value})} style={{flex:1}}/><select value={g.selection_type} onChange={e=>updateGroup(gi,{selection_type:e.target.value})} style={{width:100}}><option value="single">Single</option><option value="multiple">Multiple</option></select><label style={{fontSize:12,display:"flex",alignItems:"center",gap:4}}><input type="checkbox" checked={g.is_required} onChange={e=>updateGroup(gi,{is_required:e.target.checked})}/>Req</label><button type="button" onClick={()=>removeGroup(gi)} className="btn btn-icon btn-ghost" style={{color:"var(--color-error)"}}><Trash2 size={14}/></button></div>{g.options.map((o:any,oi:number)=>(<div key={oi} style={{display:"flex",gap:6,marginBottom:4,paddingLeft:8}}><input placeholder="Option" value={o.option_name} onChange={e=>updateOpt(gi,oi,{option_name:e.target.value})} style={{flex:1}}/><span style={{fontSize:12,color:"var(--color-text-muted)"}}>+RM</span><input type="number" step="0.5" value={o.price_adjustment} onChange={e=>updateOpt(gi,oi,{price_adjustment:Number(e.target.value)})} style={{width:70}}/><button type="button" onClick={()=>removeOpt(gi,oi)} className="btn btn-ghost btn-sm" style={{color:"var(--color-error)"}}>✕</button></div>))}<button type="button" onClick={()=>addOpt(gi)} className="btn btn-ghost btn-sm" style={{fontSize:12,paddingLeft:8}}>+ Add Option</button></div>))}</div>
            {/* Recipe / Inventory Bridge */}
            <div className="df-field" style={{gridColumn:"1/-1"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                <label className="form-label" style={{margin:0}}>Recipe / Inventory Components</label>
                <button type="button" onClick={addRecipe} className="btn btn-sm btn-outline"><Plus size={14}/>Add Component</button>
              </div>
              <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:12}}>
                <button type="button" onClick={() => loadInventoryForStore()} className="btn btn-sm btn-ghost" style={{fontSize:11}}>Load Inventory Items</button>
                <span style={{fontSize:11,color:"var(--color-text-muted)"}}>{inventoryItems.length} items loaded — recipe formula is global (not per-store)</span>
              </div>
              {(form.recipes||[]).map((rc:any,ri:number)=>(
                <div key={ri} style={{background:"var(--color-bg-muted)",borderRadius:"var(--radius-md)",padding:12,marginBottom:10,border:"1px solid var(--color-border-light)"}}>
                  <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                    <select className="border rounded px-2 py-1 text-sm" style={{flex:1,minWidth:180}} value={rc.inventory_item_id||""} onChange={e=>updateRecipe(ri,{inventory_item_id:Number(e.target.value)})}>
                      <option value="">— Inventory Item —</option>
                      {inventoryItems.map((inv:any)=><option key={inv.id} value={inv.id}>{inv.item_name} ({inv.unit_of_measure})</option>)}
                    </select>
                    <input type="number" step="0.01" placeholder="Qty" className="border rounded px-2 py-1 text-sm" style={{width:70}} value={rc.quantity_required} onChange={e=>updateRecipe(ri,{quantity_required:Number(e.target.value)})} />
                    <input placeholder="UOM" className="border rounded px-2 py-1 text-sm" style={{width:80}} value={rc.unit_of_measure||""} onChange={e=>updateRecipe(ri,{unit_of_measure:e.target.value})} />
                    <input type="number" step="0.01" min="0" max="1" placeholder="Waste" className="border rounded px-2 py-1 text-sm" style={{width:70}} value={rc.waste_factor} onChange={e=>updateRecipe(ri,{waste_factor:Number(e.target.value)})} />
                    <label style={{fontSize:12,display:"flex",alignItems:"center",gap:4}}><input type="checkbox" checked={rc.is_primary_component} onChange={e=>updateRecipe(ri,{is_primary_component:e.target.checked})}/>Primary</label>
                    <button type="button" onClick={()=>removeRecipe(ri)} className="btn btn-icon btn-ghost" style={{color:"var(--color-error)"}}><Trash2 size={14}/></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="df-actions" style={{marginTop:16}}><button type="button" onClick={()=>r.push("/menu/items")} className="btn btn-ghost">Cancel</button><button onClick={save} disabled={saving} className="btn btn-primary"><Save size={16}/>{saving?"Saving...":"Save Changes"}</button></div>
        </div>
      ):(
        <div className="card" style={{padding:24,maxWidth:700}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}><h3 style={{margin:0}}>{LOCALES.find(l=>l.code===loc)?.flag} {LOCALES.find(l=>l.code===loc)?.label} Translation</h3><button onClick={regenAll} disabled={regen} className="btn btn-primary btn-sm" aria-label="Refresh"><RefreshCw size={14}/>{regen?"...":"Regenerate All"}</button></div>
          <div className="df-grid">{TR_FIELDS.map(f=>{const k=`${loc}:${f.key}`;const w=f.key==="long_description"?({gridColumn:"1/-1"}):{};return(<div className="df-field" key={f.key} style={w}><label style={{fontSize:11,fontWeight:600,color:"var(--color-text-muted)"}}>{f.label}<span style={{fontWeight:400,fontStyle:"italic",marginLeft:8}}>EN:{(form[f.key]||"").slice(0,40)}</span></label>{f.key==="long_description"?<textarea rows={3} value={tr[k]||""} onChange={e=>setTr(p=>({...p,[k]:e.target.value}))} style={{width:"100%",padding:"8px 10px",fontSize:13,border:tr[k]?"1px solid var(--color-border-light)":"2px solid #FCD34D",borderRadius:"var(--radius-sm)",background:tr[k]?"var(--color-bg-white)":"#FFFBEB"}}/>:<input value={tr[k]||""} onChange={e=>setTr(p=>({...p,[k]:e.target.value}))} style={{width:"100%",padding:"8px 10px",fontSize:13,border:tr[k]?"1px solid var(--color-border-light)":"2px solid #FCD34D",borderRadius:"var(--radius-sm)",background:tr[k]?"var(--color-bg-white)":"#FFFBEB"}}/>}</div>);})}</div>
          {/* Modifier Groups */}
          {modTr.groups.length > 0 && (<div style={{marginTop:16}}><h4 style={{fontSize:11,fontWeight:700,textTransform:"uppercase",color:"var(--color-text-muted)",borderBottom:"1px solid var(--color-border-light)",paddingBottom:4,marginBottom:10}}>Add-ons / Modifiers</h4>{modTr.groups.map((g:any)=>(<div key={g.id} style={{marginBottom:10,padding:8,background:"var(--color-bg-muted)",borderRadius:"var(--radius-sm)"}}><div className="df-grid"><div className="df-field"><label style={{fontSize:10,fontWeight:600,color:"var(--color-text-muted)"}}>Group: {g.name}</label><input value={tr[`${loc}:mod:group_${g.id}`]||""} onChange={e=>setTr(p=>({...p,[`${loc}:mod:group_${g.id}`]:e.target.value}))} style={{width:"100%",padding:"6px 8px",fontSize:12,border:"1px solid var(--color-border-light)",borderRadius:"var(--radius-sm)"}}/></div></div>{g.options.map((o:any)=>(<div className="df-grid" key={o.id} style={{marginTop:4}}><div className="df-field"><label style={{fontSize:10,color:"var(--color-text-muted)"}}>Option: {o.name}</label><input value={tr[`${loc}:mod:opt_${o.id}`]||""} onChange={e=>setTr(p=>({...p,[`${loc}:mod:opt_${o.id}`]:e.target.value}))} style={{width:"100%",padding:"6px 8px",fontSize:12,border:"1px solid var(--color-border-light)",borderRadius:"var(--radius-sm)"}}/></div></div>))}</div>))}</div>)}
          <div style={{marginTop:20}}><button onClick={saveAllTr} disabled={savingTr} className="btn btn-primary"><Save size={16}/>Save Translations</button></div>
        </div>
      )}
    </div>
  );
}
