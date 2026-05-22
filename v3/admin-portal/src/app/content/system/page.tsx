"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Plus, Edit2, Trash2 } from "lucide-react";

interface Page { id: number; page_key: string; title: string; is_active: boolean; }

export default function SystemPagesPage() {
  const router = useRouter();
  const [items, setItems] = useState<Page[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const fetch = useCallback(() => { setLoading(true); api.get<{items:Page[]}>("/admin/system-pages?per_page=100").then(d => setItems(Array.isArray(d)?d:(d.items||[]))).catch(e=>setError(e.message)).finally(()=>setLoading(false)); }, []);
  useEffect(()=>{(async () => {
fetch();
})();},[fetch]);
  const handleDelete = async (id: number) => { if(!confirm("Delete?"))return; try{await api.del(`/admin/system-pages/${id}`);fetch();}catch (e) { console.error(e); }; };
  return (
    <div style={{padding:32}}>
      <div className="page-header"><div><h1 className="page-title">System Pages</h1><p className="page-subtitle">{items.length} pages</p></div><button onClick={()=>router.push("/content/system/new")} className="btn btn-primary btn-sm"><Plus size={16}/> Add Page</button></div>
      {error&&<div className="alert alert-error">{error}</div>}
      <div className="table-header-bar"><span className="text-sm font-semibold">{items.length} pages</span></div>
      <div className="table-container"><table className="data-table"><thead><tr><th>Key</th><th>Title</th><th style={{width:80}}>Status</th><th style={{width:80}}>Actions</th></tr></thead><tbody>
        {loading?<tr><td colSpan={4} className="data-table-empty">Loading...</td></tr>
        :items.map(item=>(<tr key={item.id} className="clickable" role="button" tabIndex={0} onKeyDown={(e)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();(()=>router.push(`/content/system/${item.id}`))();}}} onClick={()=>router.push(`/content/system/${item.id}`)} style={{cursor:"pointer"}}>
          <td className="font-mono" style={{fontSize:11}}>{item.page_key}</td>
          <td style={{fontWeight:600}}>{item.title}</td>
          <td onClick={e=>e.stopPropagation()}><span className={`badge badge-sm ${item.is_active?"badge-green":"badge-gray"}`}>{item.is_active?"Active":"Inactive"}</span></td>
          <td onClick={e=>e.stopPropagation()}><div style={{display:"flex",gap:4,alignItems:"center"}}><button onClick={()=>router.push(`/content/system/${item.id}`)} className="btn btn-ghost btn-sm" style={{color:"var(--color-info)"}}><Edit2 size={14}/></button><button onClick={()=>handleDelete(item.id)} className="btn btn-ghost btn-sm" style={{color:"var(--color-error)"}}><Trash2 size={14}/></button></div></td>
        </tr>))}
      </tbody></table></div>
    </div>
  );
}
