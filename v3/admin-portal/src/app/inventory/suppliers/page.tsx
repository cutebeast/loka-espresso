"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Plus, Edit2, Trash2 } from "lucide-react";

interface Supplier { id: number; supplier_name: string; contact_person?: string; phone_number?: string; is_active: boolean; }
interface Store { id: number; store_name: string; }

export default function InventorySuppliersPage() {
  const r = useRouter();
  const [items, setItems] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const fetchStores = async () => {
    try { const d = await api.getRaw<any>("/admin/stores?per_page=50"); const list = d.items || []; setStores(list); if (!storeId && list.length > 0) setStoreId(String(list[0].id)); }
    catch (e) { console.error(e); }
  };
  const fetchData = useCallback(async () => { if (!storeId) { setLoading(false); return; } setLoading(true);
    try { const d = await api.getRaw<any>(`/admin/inventory/suppliers?store_id=${storeId}`); setItems(Array.isArray(d) ? d : (d.items||[])); }
    catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }, [storeId]);
  useEffect(() => {(async () => {
 fetchStores(); 
})();}, []);
  useEffect(() => {(async () => {
 fetchData(); 
})();}, [fetchData]);

  const handleDelete = async (id: number) => { if (!confirm("Delete?")) return; try { await api.del(`/admin/inventory/suppliers/${id}`); setConfirmDelete(null); fetchData(); } catch (e) { console.error(e); }; };

  return (
    <div style={{ padding: 32 }}>
      <div className="page-header"><div><h1 className="page-title">Suppliers</h1><p className="page-subtitle">{items.length} suppliers</p></div><button onClick={() => r.push("/inventory/suppliers/new")} className="btn btn-primary btn-sm"><Plus size={16} /> Add Supplier</button></div>
      {error && <div className="alert alert-error">{error}</div>}
      <div style={{ marginBottom: 16 }}><select value={storeId} onChange={e => setStoreId(e.target.value)} style={{ padding: "6px 12px", fontSize: 13, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-light)" }}>{stores.map(s => <option key={s.id} value={s.id}>{s.store_name}</option>)}</select></div>
      <div className="table-header-bar"><span className="text-sm font-semibold">{items.length} suppliers</span></div>
      <div className="table-container"><table className="data-table">
        <thead><tr><th>Name</th><th>Contact</th><th>Phone</th><th style={{width:80}}>Status</th><th style={{width:80}}>Actions</th></tr></thead>
        <tbody>{loading ? <tr><td colSpan={5} className="data-table-empty">Loading...</td></tr>
          : items.map(s => (<tr key={s.id} className="clickable" role="button" tabIndex={0} onKeyDown={(e)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();(()=>r.push(`/inventory/suppliers/${s.id}`))();}}} onClick={()=>r.push(`/inventory/suppliers/${s.id}`)} style={{cursor:"pointer"}}>
            <td style={{fontWeight:600}}>{s.supplier_name}</td><td>{s.contact_person||"—"}</td><td style={{fontSize:12}}>{s.phone_number||"—"}</td>
            <td onClick={e=>e.stopPropagation()}><span className={`badge badge-sm ${s.is_active?"badge-green":"badge-gray"}`}>{s.is_active?"Active":"Inactive"}</span></td>
            <td onClick={e=>e.stopPropagation()}><button onClick={()=>r.push(`/inventory/suppliers/${s.id}`)} className="btn btn-ghost btn-sm" style={{color:"var(--color-info)"}}><Edit2 size={14}/></button>{confirmDelete===s.id?<><button onClick={()=>handleDelete(s.id)} className="btn btn-ghost btn-sm" style={{color:"var(--color-error)",fontWeight:600}}>✓</button><button onClick={()=>setConfirmDelete(null)} className="btn btn-ghost btn-sm">✕</button></>:<button onClick={()=>setConfirmDelete(s.id)} className="btn btn-ghost btn-sm" style={{color:"var(--color-error)"}}><Trash2 size={14}/></button>}</td>
          </tr>))}
        </tbody>
      </table></div>
    </div>
  );
}

