"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ArrowLeft, Save, RefreshCw } from "lucide-react";

const LOCALES = [{ code: "en", label: "English", flag: "🇬🇧" },{ code: "ms", label: "BM", flag: "🇲🇾" },{ code: "zh", label: "中文", flag: "🇨🇳" },{ code: "ta", label: "தமிழ்", flag: "🇮🇳" },{ code: "tr", label: "TR", flag: "🇹🇷" }];
const TR_FIELDS = [{ key: "category_name", label: "Category Name" }, { key: "description", label: "Description" }];

export default function CategoryEditPage() {
  const params = useParams(); const router = useRouter();
  const catId = params.id as string;
  const [form, setForm] = useState<Record<string,any>>({});
  const [loading, setLoading] = useState(true);
  const [activeLocale, setActiveLocale] = useState<string>("en");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [regenerating, setRegenerating] = useState(false);
  const [translations, setTranslations] = useState<Record<string,string>>({});

  useEffect(() => { load(); }, [catId]);

  const load = async () => {
    setLoading(true);
    try {
      const d = await api.getRaw<any>(`/admin/menu/categories/${catId}`);
      setForm({ category_name: d.category_name || "", slug: d.slug || "", description: d.description || "", is_available: d.is_available });
      const tr: Record<string,string> = {};
      for (const loc of LOCALES) {
        if (loc.code === "en") continue;
        const r = await api.getRaw<{items:{translation_key:string;translated_text:string}[]}>(`/translations?table_name=menu_categories&record_id=${catId}&locale=${loc.code}&per_page=10`);
        if (r?.items) for (const t of r.items) { const f = t.translation_key.split(".").pop()||""; tr[`${loc.code}:${f}`] = t.translated_text||""; }
      }
      setTranslations(tr);
    } catch {}
    finally { setLoading(false); }
  };

  const save = async () => {
    setSaving(true);
    try { await api.patch(`/admin/menu/categories/${catId}`, form); setMsg("Saved"); setTimeout(()=>setMsg(""),2000); }
    catch {}
    finally { setSaving(false); }
  };

  const upsertTr = async (field: string, locale: string, src: string, text: string) => {
    const r = await api.getRaw<{items:{id:number}[]}>(`/translations?table_name=menu_categories&record_id=${catId}&column_name=${field}&locale=${locale}&per_page=1`);
    const ex = r?.items?.[0];
    if (ex) await api.put(`/translations/${ex.id}`, { translated_text: text });
    else await api.post("/translations", { translation_key: `menu_categories.${catId}.${field}`, locale, namespace: "menu", translated_text: text, source_text: src, table_name: "menu_categories", record_id: Number(catId), column_name: field });
  };

  const regenerateAll = async () => {
    setRegenerating(true);
    let count = 0;
    for (const f of TR_FIELDS) {
      const src = (form[f.key] || "").trim(); if (!src) continue;
      try {
        const r:any = await api.post("/translations/translate", { text: src, target_locale: activeLocale, source_locale: "en" });
        if (r?.translated_text) { setTranslations(p=>({...p,[`${activeLocale}:${f.key}`]:r.translated_text})); await upsertTr(f.key,activeLocale,src,r.translated_text); count++; }
      } catch {}
    }
    setMsg(`Regenerated ${count} ${activeLocale.toUpperCase()} translations`);
    setTimeout(()=>setMsg(""),2500);
    setRegenerating(false);
  };

  const saveAllTr = async () => {
    for (const f of TR_FIELDS) {
      const text = translations[`${activeLocale}:${f.key}`]||"";
      if (text) await upsertTr(f.key, activeLocale, (form[f.key]||"").trim(), text);
    }
    setMsg("Translations saved"); setTimeout(()=>setMsg(""),2000);
  };

  if (loading) return <div style={{padding:32}}>Loading...</div>;

  return (
    <div style={{padding:32}}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
        <button onClick={()=>router.push("/menu/categories")} className="btn btn-ghost btn-sm"><ArrowLeft size={18}/></button>
        <div><h1 className="page-title" style={{margin:0}}>{form.category_name||"Category"}</h1></div>
      </div>
      {msg && <div className="alert alert-success" style={{marginBottom:12}}>{msg}</div>}

      <div style={{display:"flex",gap:4,marginBottom:20,borderBottom:"2px solid var(--color-border-light)",paddingBottom:0}}>
        {LOCALES.map(loc=>(
          <button key={loc.code} onClick={()=>setActiveLocale(loc.code)}
            style={{padding:"10px 20px",fontSize:13,fontWeight:activeLocale===loc.code?700:400,border:"none",borderBottom:activeLocale===loc.code?"3px solid var(--color-primary)":"3px solid transparent",background:activeLocale===loc.code?"rgba(59,74,26,0.05)":"transparent",cursor:"pointer",color:activeLocale===loc.code?"var(--color-primary)":"var(--color-text-muted)",borderRadius:"4px 4px 0 0"}}>
            {loc.flag} {loc.label}
          </button>
        ))}
      </div>

      {activeLocale==="en" ? (
        <div className="card" style={{padding:24,maxWidth:500}}>
          <div className="df-grid">
            <div className="df-field"><label className="form-label">Name *</label><input className="w-full border rounded px-3 py-2 text-sm" value={form.category_name||""} onChange={e=>setForm({...form,category_name:e.target.value})}/></div>
            <div className="df-field"><label className="form-label">Slug</label><input className="w-full border rounded px-3 py-2 text-sm" value={form.slug||""} onChange={e=>setForm({...form,slug:e.target.value})}/></div>
            <div className="df-field" style={{gridColumn:"1/-1"}}><label className="form-label">Description</label><input className="w-full border rounded px-3 py-2 text-sm" value={form.description||""} onChange={e=>setForm({...form,description:e.target.value})}/></div>
            <div className="df-field"><label style={{display:"flex",alignItems:"center",gap:8,fontSize:13}}><input type="checkbox" checked={!!form.is_available} onChange={e=>setForm({...form,is_available:e.target.checked})}/>Active</label></div>
          </div>
          <div className="df-actions" style={{marginTop:16}}><button type="button" onClick={()=>router.push("/menu/categories")} className="btn btn-ghost">Cancel</button><button onClick={save} disabled={saving} className="btn btn-primary"><Save size={16}/>{saving?"Saving...":"Save"}</button></div>
        </div>
      ) : (
        <div className="card" style={{padding:24,maxWidth:600}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
            <h3 style={{margin:0}}>{LOCALES.find(l=>l.code===activeLocale)?.flag} {LOCALES.find(l=>l.code===activeLocale)?.label} Translation</h3>
            <button onClick={regenerateAll} disabled={regenerating} className="btn btn-primary btn-sm"><RefreshCw size={14}/>{regenerating?"...":"Regenerate"}</button>
          </div>
          <div className="df-grid">
            {TR_FIELDS.map(f=>{
              const trKey=`${activeLocale}:${f.key}`;
              return (
                <div className="df-field" key={f.key}>
                  <label style={{fontSize:11,fontWeight:600,color:"var(--color-text-muted)"}}>{f.label}<span style={{fontWeight:400,fontStyle:"italic",marginLeft:8}}>EN: {(form[f.key]||"").slice(0,30)}</span></label>
                  <input value={translations[trKey]||""} onChange={e=>setTranslations(p=>({...p,[trKey]:e.target.value}))} style={{width:"100%",padding:"8px 10px",fontSize:13,border:translations[trKey]?"1px solid var(--color-border-light)":"2px solid #FCD34D",borderRadius:"var(--radius-sm)",background:translations[trKey]?"var(--color-bg-white)":"#FFFBEB"}} placeholder="—"/>
                </div>
              );
            })}
          </div>
          <div style={{marginTop:20}}><button onClick={saveAllTr} className="btn btn-primary"><Save size={16}/>Save Translation</button></div>
        </div>
      )}
    </div>
  );
}
