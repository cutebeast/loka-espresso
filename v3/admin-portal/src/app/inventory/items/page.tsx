"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Plus, Edit2, Trash2 } from "lucide-react";

interface InventoryItem { id: number; item_name: string; item_code: string; item_type?: string; description?: string; unit_of_measure: string; category_name?: string; is_active: boolean; }
interface InvCategory { id: number; category_name: string; }

export default function InventoryItemsPage() {
  const router = useRouter();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [categories, setCategories] = useState<InvCategory[]>([]);

  useEffect(() => {
    api.getRaw<any>("/admin/inventory/categories?per_page=50").then(d => setCategories(d.items || (Array.isArray(d) ? d : []))).catch((e: any) => console.error("Failed to load categories:", e));
  }, []);

  const fetchData = useCallback(() => {
    setLoading(true);
    const qs = new URLSearchParams({ per_page: "100" });
    if (catFilter) qs.set("category_id", catFilter);
    api.get<InventoryItem[]>(`/admin/inventory/items?${qs}`)
      .then(d => setItems(Array.isArray(d) ? d : []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [catFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div style={{ padding: 32 }}>
      <div className="page-header">
        <div><h1 className="page-title">Inventory Items</h1><p className="page-subtitle">{items.length} items</p></div>
        <button onClick={() => router.push("/inventory/items/new")} className="btn btn-primary btn-sm"><Plus size={16} /> Add Item</button>
      </div>
      {error && <div className="alert alert-error">{error}</div>}

      <div className="table-header-bar" style={{ marginBottom: 0, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}><span style={{ fontSize: 13, fontWeight: 600 }}>Items</span></div>
      <div style={{ marginBottom: 16, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "8px 16px", background: "var(--color-bg-white)", border: "1px solid var(--color-border-light)", borderTop: "none" }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Category:</span>
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)} style={{ padding: "4px 12px", fontSize: 13, borderRadius: "var(--radius-sm)" }}>
          <option value="">All</option>{categories.map(c => <option key={c.id} value={c.id}>{c.category_name}</option>)}
        </select>
      </div>

      <div className="table-container" style={{ marginTop: 0 }}>
        <table className="data-table">
          <thead><tr><th>Name</th><th>Code</th><th>Type</th><th>Category</th><th>Unit</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={7} className="data-table-empty">Loading...</td></tr>
              : items.map(item => (
              <tr key={item.id}>
                <td><div style={{fontWeight:600}}>{item.item_name}</div>{item.description&&<div style={{fontSize:12,color:"var(--color-text-muted)"}}>{item.description.slice(0,60)}</div>}</td>
                <td className="font-mono" style={{fontSize:12}}>{item.item_code}</td>
                <td><span className={`badge badge-sm ${item.item_type==="non_fnb"?"badge-purple":"badge-blue"}`}>{item.item_type==="non_fnb"?"Non-FnB":"FnB"}</span></td>
                <td>{item.category_name||"—"}</td>
                <td style={{fontSize:12}}>{item.unit_of_measure}</td>
                <td><span className={`badge badge-sm ${item.is_active?"badge-green":"badge-gray"}`}>{item.is_active?"Active":"Inactive"}</span></td>
                <td>
                  <button onClick={()=>router.push(`/inventory/items/${item.id}`)} className="btn btn-ghost btn-sm" style={{color:"var(--color-info)",marginRight:4}}><Edit2 size={14}/></button>
                  <button onClick={async()=>{if(confirm("Delete?")){try{await api.del(`/admin/inventory/items/${item.id}`);fetchData();}catch(e){console.error(e);}}}} className="btn btn-ghost btn-sm" style={{color:"var(--color-error)"}}><Trash2 size={14}/></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
