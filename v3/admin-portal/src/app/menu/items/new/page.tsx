"use client";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ArrowLeft, Save, Upload, Plus, Trash2 } from "lucide-react";

interface MenuCategory { id: number; category_name: string; }
interface Allergen { id: number; allergen_key: string; display_name: string; }
interface DietaryTag { id: number; tag_key: string; display_name: string; icon?: string; }
interface TaxCategory { id: number; category_name: string; rate: number; }
interface LoyaltyTier { id: number; display_name: string; }
interface Store { id: number; store_name: string; }

export default function NewItemPage() {
  const router = useRouter();
  const [form, setForm] = useState<Record<string,any>>({ item_name:"", item_code:"", base_price:"", description:"", long_description:"", category_id:"", tax_category_id:"", allergen_ids:[] as number[], dietary_tag_ids:[] as number[], is_available:true, is_featured:false, calories:"", prep_time_minutes:"10", minimum_tier_id:"", modifier_groups:[] as any[], recipes:[] as any[] });
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [allergens, setAllergens] = useState<Allergen[]>([]);
  const [dietaryTags, setDietaryTags] = useState<DietaryTag[]>([]);
  const [taxCategories, setTaxCategories] = useState<TaxCategory[]>([]);
  const [loyaltyTiers, setLoyaltyTiers] = useState<LoyaltyTier[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [inventoryItems, setInventoryItems] = useState<any[]>([]);
  const [recipeStoreId, setRecipeStoreId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.getRaw<any>("/admin/menu/categories?per_page=50").then(d => setCategories(Array.isArray(d)?d:(d.items||[]))).catch(()=>{});
    api.getRaw<any>("/admin/menu/allergens").then(d => setAllergens(Array.isArray(d)?d:(d.items||[]))).catch(()=>{});
    api.getRaw<any>("/admin/dietary-tags?per_page=50").then(d => setDietaryTags(Array.isArray(d)?d:(d.items||[]))).catch(()=>{});
    api.getRaw<any>("/admin/menu/tax-categories").then(d => setTaxCategories(Array.isArray(d)?d:(d.items||[]))).catch(()=>{});
    api.getRaw<any>("/admin/loyalty/tiers").then(d => setLoyaltyTiers(Array.isArray(d)?d:(d.items||[]))).catch(()=>{});
    api.getRaw<any>("/admin/stores?per_page=50").then(d => setStores(Array.isArray(d)?d:(d.items||[]))).catch(()=>{});
  }, []);

  const toggleTag = (type:"allergen"|"dietary", id:number) => {
    const key = type==="allergen"?"allergen_ids":"dietary_tag_ids";
    const arr = form[key] as number[];
    setForm({...form, [key]: arr.includes(id) ? arr.filter(x=>x!==id) : [...arr, id]});
  };

  const addGroup = () => setForm({...form, modifier_groups: [...form.modifier_groups, {group_name:"",selection_type:"single",min_selections:0,max_selections:1,is_required:false,options:[]}]});
  const updateGroup = (i:number, p:any) => { const g=[...form.modifier_groups]; g[i]={...g[i],...p}; setForm({...form,modifier_groups:g}); };
  const removeGroup = (i:number) => setForm({...form, modifier_groups: form.modifier_groups.filter((_:any,j:number)=>j!==i)});
  const addOpt = (gi:number) => { const g=[...form.modifier_groups]; g[gi].options.push({option_name:"",price_adjustment:0,is_default:false,is_available:true}); setForm({...form,modifier_groups:g}); };
  const updateOpt = (gi:number, oi:number, p:any) => { const g=[...form.modifier_groups]; g[gi].options[oi]={...g[gi].options[oi],...p}; setForm({...form,modifier_groups:g}); };
  const removeOpt = (gi:number, oi:number) => { const g=[...form.modifier_groups]; g[gi].options=g[gi].options.filter((_:any,j:number)=>j!==oi); setForm({...form,modifier_groups:g}); };

  const loadInventoryForStore = async (storeId:string) => {
    if(!storeId)return;
    try{const d=await api.getRaw<any>(`/admin/inventory/items?store_id=${storeId}&per_page=200`);setInventoryItems(Array.isArray(d)?d:(d.items||[]));}catch{setInventoryItems([]);}
  };

  const addRecipe = () => setForm({...form, recipes: [...(form.recipes||[]), {inventory_item_id:"",quantity_required:1,unit_of_measure:"unit",waste_factor:0.05,is_primary_component:false}]});
  const updateRecipe = (i:number, p:any) => { const r=[...(form.recipes||[])]; r[i]={...r[i],...p}; setForm({...form,recipes:r}); };
  const removeRecipe = (i:number) => setForm({...form, recipes: (form.recipes||[]).filter((_:any,j:number)=>j!==i)});

  const handleUpload = async () => {
    const f = fileRef.current?.files?.[0]; if(!f)return; setUploading(true);
    try { const fd=new FormData(); fd.append("file",f); const j=await api.upload("/upload/image",fd); setForm({...form,image_url:j.url||j.filename}); if(fileRef.current)fileRef.current.value=""; } catch{} finally {setUploading(false);}
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    try {
      if(!form.item_code) form.item_code = "ITM-"+Date.now().toString(36).toUpperCase().slice(-6);
      const p:any = {...form};
      p.base_price = Number(p.base_price) || 0;
      p.category_id = Number(p.category_id) || null;
      p.tax_category_id = Number(p.tax_category_id) || null;
      p.calories = p.calories ? Number(p.calories) : null;
      p.prep_time_minutes = Number(p.prep_time_minutes) || 10;
      p.minimum_tier_id = p.minimum_tier_id ? Number(p.minimum_tier_id) : null;
      const r:any = await api.post("/admin/menu/items", p);
      const id = r?.data?.id || r?.id;
      if(id) router.push(`/menu/items/${id}`);
    } catch{} finally { setSaving(false); }
  };

  const Chip = ({label,icon,active,onClick}:{label:string;icon?:string;active:boolean;onClick:()=>void}) => (
    <button type="button" onClick={onClick} style={{display:"inline-flex",alignItems:"center",gap:4,padding:"3px 10px",borderRadius:"var(--radius-full)",fontSize:12,fontWeight:500,cursor:"pointer",border:active?"2px solid var(--color-primary)":"1px solid var(--color-border-light)",background:active?"rgba(59,74,26,0.08)":"var(--color-bg-white)",color:active?"var(--color-primary)":"var(--color-text-muted)"}}>{icon&&<span>{icon}</span>}{label}</button>
  );

  return (
    <div style={{padding:32}}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}><button onClick={()=>router.push("/menu/items")} className="btn btn-ghost btn-sm"><ArrowLeft size={18}/></button><h1 className="page-title" style={{margin:0}}>New Menu Item</h1></div>
      <form onSubmit={handleSubmit}>
        <div className="card" style={{padding:24,maxWidth:700}}>
          <div className="df-grid">
            <div className="df-field"><label className="form-label">Name *</label><input required className="w-full border rounded px-3 py-2 text-sm" value={form.item_name} onChange={e=>setForm({...form,item_name:e.target.value})}/></div>
            <div className="df-field"><label className="form-label">Code</label><input className="w-full border rounded px-3 py-2 text-sm" value={form.item_code} onChange={e=>setForm({...form,item_code:e.target.value})} placeholder="auto-generated"/></div>
            <div className="df-field"><label className="form-label">Price *</label><input required type="number" step="0.01" min="0" className="w-full border rounded px-3 py-2 text-sm" value={form.base_price != null ? Number(form.base_price).toFixed(2) : ""} onChange={e=>setForm({...form,base_price:e.target.value})}/></div>
            <div className="df-field">
              <label className="form-label">Category</label>
              <select className="w-full border rounded px-3 py-2 text-sm" value={form.category_id} onChange={e=>setForm({...form,category_id:e.target.value})}><option value="">— Select —</option>{categories.map(c=><option key={c.id} value={c.id}>{c.category_name}</option>)}</select>
            </div>
            <div className="df-field">
              <label className="form-label">Tax Category</label>
              <select className="w-full border rounded px-3 py-2 text-sm" value={form.tax_category_id} onChange={e=>setForm({...form,tax_category_id:e.target.value})}><option value="">— None —</option>{taxCategories.map(t=><option key={t.id} value={t.id}>{t.category_name} ({(t.rate*100).toFixed(0)}%)</option>)}</select>
            </div>
            <div className="df-field" style={{gridColumn:"1/-1"}}><label className="form-label">Description</label><input className="w-full border rounded px-3 py-2 text-sm" value={form.description||""} onChange={e=>setForm({...form,description:e.target.value})}/></div>
            <div className="df-field" style={{gridColumn:"1/-1"}}><label className="form-label">Long Description</label><textarea rows={3} className="w-full border rounded px-3 py-2 text-sm" value={form.long_description||""} onChange={e=>setForm({...form,long_description:e.target.value})}/></div>

            <div className="df-field" style={{gridColumn:"1/-1"}}>
              <label className="form-label">Image</label>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <input ref={fileRef} type="file" accept="image/*" onChange={handleUpload} style={{display:"none"}}/>
                <button type="button" onClick={()=>fileRef.current?.click()} className="btn btn-sm btn-outline" disabled={uploading}><Upload size={14}/> {uploading?"Uploading...":"Upload Image"}</button>
                {form.image_url&&<span style={{fontSize:12,color:"var(--color-success)"}}>✓ {form.image_url.split("/").pop()}</span>}
              </div>
            </div>

            <div className="df-field" style={{gridColumn:"1/-1"}}><label className="form-label">Allergens</label><div style={{display:"flex",flexWrap:"wrap",gap:6}}>{allergens.map(a=><Chip key={a.id} label={a.display_name} active={form.allergen_ids.includes(a.id)} onClick={()=>toggleTag("allergen",a.id)}/>)}</div></div>
            <div className="df-field" style={{gridColumn:"1/-1"}}><label className="form-label">Dietary Tags</label><div style={{display:"flex",flexWrap:"wrap",gap:6}}>{dietaryTags.map(t=><Chip key={t.id} label={t.display_name} icon={t.icon} active={form.dietary_tag_ids.includes(t.id)} onClick={()=>toggleTag("dietary",t.id)}/>)}</div></div>

            <div className="df-field"><label className="form-label">Calories</label><input type="number" min="0" className="w-full border rounded px-3 py-2 text-sm" value={form.calories} onChange={e=>setForm({...form,calories:e.target.value})} placeholder="e.g. 250"/></div>
            <div className="df-field"><label className="form-label">Prep Time (min)</label><input type="number" min="1" className="w-full border rounded px-3 py-2 text-sm" value={form.prep_time_minutes} onChange={e=>setForm({...form,prep_time_minutes:e.target.value})}/></div>
            <div className="df-field">
              <label className="form-label">Minimum Tier</label>
              <select className="w-full border rounded px-3 py-2 text-sm" value={form.minimum_tier_id} onChange={e=>setForm({...form,minimum_tier_id:e.target.value})}>
                <option value="">— No Restriction —</option>
                {loyaltyTiers.map(t => <option key={t.id} value={t.id}>{t.display_name}</option>)}
              </select>
            </div>
            <div className="df-field"><label style={{display:"flex",alignItems:"center",gap:8,fontSize:13}}><input type="checkbox" checked={form.is_available} onChange={e=>setForm({...form,is_available:e.target.checked})}/>Available</label></div>
            <div className="df-field"><label style={{display:"flex",alignItems:"center",gap:8,fontSize:13}}><input type="checkbox" checked={form.is_featured} onChange={e=>setForm({...form,is_featured:e.target.checked})}/>Featured</label></div>

            <div className="df-field" style={{gridColumn:"1/-1"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}><label className="form-label" style={{margin:0}}>Add-ons / Modifiers</label><button type="button" onClick={addGroup} className="btn btn-sm btn-outline"><Plus size={14}/>Add</button></div>
              {form.modifier_groups.map((g:any,gi:number)=>(
                <div key={gi} style={{background:"var(--color-bg-muted)",borderRadius:"var(--radius-md)",padding:12,marginBottom:12,border:"1px solid var(--color-border-light)"}}>
                  <div style={{display:"flex",gap:8,marginBottom:8}}><input placeholder="Group name" value={g.group_name} onChange={e=>updateGroup(gi,{group_name:e.target.value})} style={{flex:1}}/><select value={g.selection_type} onChange={e=>updateGroup(gi,{selection_type:e.target.value})} style={{width:100}}><option value="single">Single</option><option value="multiple">Multiple</option></select><label style={{fontSize:12,display:"flex",alignItems:"center",gap:4}}><input type="checkbox" checked={g.is_required} onChange={e=>updateGroup(gi,{is_required:e.target.checked})}/>Req</label><button type="button" onClick={()=>removeGroup(gi)} className="btn btn-icon btn-ghost" style={{color:"var(--color-error)"}}><Trash2 size={14}/></button></div>
                  {g.options.map((o:any,oi:number)=>(<div key={oi} style={{display:"flex",gap:6,marginBottom:4,paddingLeft:8}}><input placeholder="Option" value={o.option_name} onChange={e=>updateOpt(gi,oi,{option_name:e.target.value})} style={{flex:1}}/><span style={{fontSize:12,color:"var(--color-text-muted)"}}>+RM</span><input type="number" step="0.5" value={o.price_adjustment} onChange={e=>updateOpt(gi,oi,{price_adjustment:Number(e.target.value)})} style={{width:70}}/><button type="button" onClick={()=>removeOpt(gi,oi)} className="btn btn-ghost btn-sm" style={{color:"var(--color-error)"}}>✕</button></div>))}
                  <button type="button" onClick={()=>addOpt(gi)} className="btn btn-ghost btn-sm" style={{fontSize:12,paddingLeft:8}}>+ Add Option</button>
                </div>
              ))}
            </div>

            {/* Recipe / Inventory Bridge */}
            <div className="df-field" style={{gridColumn:"1/-1"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                <label className="form-label" style={{margin:0}}>Recipe / Inventory Components</label>
                <button type="button" onClick={addRecipe} className="btn btn-sm btn-outline"><Plus size={14}/>Add Component</button>
              </div>
              <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:12}}>
                <select className="w-full border rounded px-3 py-2 text-sm" style={{maxWidth:220}} value={recipeStoreId} onChange={e=>{setRecipeStoreId(e.target.value);loadInventoryForStore(e.target.value);}}>
                  <option value="">— Select Store —</option>
                  {stores.map((s:any)=><option key={s.id} value={s.id}>{s.store_name}</option>)}
                </select>
                <span style={{fontSize:11,color:"var(--color-text-muted)"}}>Pick a store to load its inventory</span>
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
          <div className="df-actions"><button type="button" onClick={()=>router.push("/menu/items")} className="btn btn-ghost">Cancel</button><button type="submit" disabled={saving} className="btn btn-primary"><Save size={16}/>{saving?"Creating...":"Create Item"}</button></div>
        </div>
      </form>
    </div>
  );
}
