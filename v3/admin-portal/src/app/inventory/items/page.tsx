"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Plus, Edit2, Trash2 } from "lucide-react";

interface InventoryItem { id: number; item_name: string; item_code: string; item_type?: string; description?: string; current_stock: number; unit_of_measure: string; reorder_level: number; category_name?: string; is_active: boolean; }
interface InvCategory { id: number; category_name: string; }
interface Store { id: number; store_name: string; }

export default function InventoryItemsPage() {
  const router = useRouter();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [categories, setCategories] = useState<InvCategory[]>([]);

  useEffect(() => {
    api.getRaw<any>("/admin/stores?per_page=50").then(d => { const l = d.items||[]; setStores(l); if (l.length>0) setStoreId(String(l[0].id)); }).catch((e: any) => setError(e.message || "Failed to load stores"));
  }, []);

  useEffect(() => {
    if (!storeId) return;
    api.get<{ items: InvCategory[] }>(`/admin/inventory/categories?store_id=${storeId}&per_page=50`).then(d => setCategories(d.items||(Array.isArray(d)?d:[]))).catch((e: any) => console.error("Failed to load categories:", e));
  }, [storeId]);

  const fetchData = useCallback(() => {
    if (!storeId) return;
    setLoading(true);
    const qs = new URLSearchParams({ store_id: String(storeId), per_page: "100" });
    if (catFilter) qs.set("category_id", catFilter);
    api.get<InventoryItem[]>(`/admin/inventory/items?${qs}`)
      .then(d => setItems(Array.isArray(d) ? d : []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [storeId, catFilter]);

  useEffect(() => {(async () => {
 fetchData(); 
})();}, [fetchData]);

  return (
    <div style={{ padding: 32 }}>
      <div className="page-header">
        <div><h1 className="page-title">Inventory Items</h1><p className="page-subtitle">{items.length} items</p></div>
        <button onClick={() => router.push("/inventory/items/new")} className="btn btn-primary btn-sm"><Plus size={16} /> Add Item</button>
      </div>
      {error && <div className="alert alert-error">{error}</div>}

      <div style={{ marginBottom: 16, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <select value={storeId} onChange={e => setStoreId(e.target.value)} style={{ padding: "6px 12px", fontSize: 13, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-light)" }}>{stores.map(s => <option key={s.id} value={s.id}>{s.store_name}</option>)}</select>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Category:</span>
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)} style={{ padding: "4px 12px", fontSize: 13, borderRadius: "var(--radius-sm)" }}>
          <option value="">All</option>{categories.map(c => <option key={c.id} value={c.id}>{c.category_name}</option>)}
        </select>
      </div>

      <div className="table-container" style={{ marginTop: 16 }}>
        <table className="data-table">
          <thead><tr><th>Name</th><th>Code</th><th>Type</th><th>Category</th><th style={{textAlign:"center"}}>Stock</th><th>Unit</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={8} className="data-table-empty">Loading...</td></tr>
              : items.map(item => (
              <tr key={item.id}>
                <td><div style={{fontWeight:600}}>{item.item_name}</div>{item.description&&<div style={{fontSize:12,color:"var(--color-text-muted)"}}>{item.description.slice(0,60)}</div>}</td>
                <td className="font-mono" style={{fontSize:12}}>{item.item_code}</td>
                <td><span className={`badge badge-sm ${item.item_type==="non_fnb"?"badge-purple":"badge-blue"}`}>{item.item_type==="non_fnb"?"Non-FnB":"FnB"}</span></td>
                <td>{item.category_name||"—"}</td>
                <td style={{textAlign:"center",fontWeight:600,color:item.current_stock<=(item.reorder_level||0)?"var(--color-error)":"var(--color-success)"}}>{item.current_stock}</td>
                <td style={{fontSize:12}}>{item.unit_of_measure}</td>
                <td><span className={`badge badge-sm ${item.is_active?"badge-green":"badge-gray"}`}>{item.is_active?"Active":"Inactive"}</span></td>
                <td>
                  <button onClick={()=>router.push(`/inventory/items/${item.id}`)} className="btn btn-ghost btn-sm" style={{color:"var(--color-info)",marginRight:4}}><Edit2 size={14}/></button>
                  <button onClick={async()=>{if(confirm("Delete?")){await api.del(`/admin/inventory/items/${item.id}`);fetchData();}}} className="btn btn-ghost btn-sm" style={{color:"var(--color-error)"}}><Trash2 size={14}/></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
