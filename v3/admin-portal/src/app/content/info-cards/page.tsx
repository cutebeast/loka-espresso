"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Plus, Edit2, Trash2 } from "lucide-react";

interface Card { id: number; title: string; slug: string; content_type: string; image_url?: string; position: number; is_active: boolean; }

export default function InfoCardsPage() {
  const router = useRouter();
  const [items, setItems] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetch = () => { setLoading(true); api.get<{items:Card[]}>("/admin/info-cards?per_page=100").then(d => setItems(Array.isArray(d)?d:(d.items||[]))).catch(e=>setError(e.message)).finally(()=>setLoading(false)); };
  useEffect(()=>{fetch();},[]);

  const handleDelete = async (id: number) => { if(!confirm("Delete?"))return; try{await api.del(`/admin/info-cards/${id}`);fetch();}catch{}; };

  return (
    <div style={{padding:32}}>
      <div className="page-header"><div><h1 className="page-title">Info Cards</h1><p className="page-subtitle">{items.length} cards</p></div><button onClick={()=>router.push("/content/info-cards/new")} className="btn btn-primary btn-sm"><Plus size={16}/> Add Card</button></div>
      {error&&<div className="alert alert-error">{error}</div>}
      <div className="table-header-bar"><span className="text-sm font-semibold">{items.length} cards</span></div>
      <div className="table-container"><table className="data-table">
        <thead><tr><th>Img</th><th>Title</th><th>Slug</th><th>Pos</th><th style={{width:80}}>Status</th><th style={{width:80}}>Actions</th></tr></thead>
        <tbody>
          {loading?<tr><td colSpan={6} className="data-table-empty">Loading...</td></tr>
          :items.map(item=>(
            <tr key={item.id} className="clickable" onClick={()=>router.push(`/content/info-cards/${item.id}`)} style={{cursor:"pointer"}}>
              <td>{item.image_url?<img src={item.image_url} alt="" style={{width:32,height:32,borderRadius:6,objectFit:"cover"}}/>:<span>—</span>}</td>
              <td style={{fontWeight:600}}>{item.title}</td>
              <td className="font-mono" style={{fontSize:11}}>{item.slug}</td>
              <td>{item.position}</td>
              <td onClick={e=>e.stopPropagation()}><span className={`badge badge-sm ${item.is_active?"badge-green":"badge-gray"}`}>{item.is_active?"Active":"Inactive"}</span></td>
              <td onClick={e=>e.stopPropagation()}>
                <div style={{display:"flex",gap:4,alignItems:"center"}}>
                  <button onClick={()=>router.push(`/content/info-cards/${item.id}`)} className="btn btn-ghost btn-sm" style={{color:"var(--color-info)"}}><Edit2 size={14}/></button>
                  <button onClick={()=>handleDelete(item.id)} className="btn btn-ghost btn-sm" style={{color:"var(--color-error)"}}><Trash2 size={14}/></button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </div>
  );
}
