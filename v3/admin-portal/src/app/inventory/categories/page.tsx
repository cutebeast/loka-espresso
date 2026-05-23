"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Plus, Edit2, Trash2 } from "lucide-react";

interface Category { id: number; category_name: string; slug: string; description?: string; is_active: boolean; }
interface Store { id: number; store_name: string; }

export default function InventoryCategoriesPage() {
  const router = useRouter();
  const [items, setItems] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState("");

  useEffect(() => {
    api.getRaw<any>("/admin/stores?per_page=50").then(d => { const list = d.items || []; setStores(list); if (list.length > 0) setStoreId(String(list[0].id)); }).catch((e)=>{console.error('stores:',e)});
  }, []);

  useEffect(() => {(async () => {

      if (!storeId) return;
      setLoading(true);
      api.getRaw<{ items: Category[] }>(`/admin/inventory/categories?store_id=${storeId}`)
        .then(d => setItems(Array.isArray(d) ? d : (d.items || [])))
        .catch(e => setError(e.message))
        .finally(() => setLoading(false));
    
})();}, [storeId]);

  return (
    <div style={{ padding: 32 }}>
      <div className="page-header">
        <div><h1 className="page-title">Inventory Categories</h1><p className="page-subtitle">{items.length} categories</p></div>
        <button onClick={() => router.push("/inventory/categories/new")} className="btn btn-primary btn-sm"><Plus size={16} /> Add Category</button>
      </div>
      {error && <div className="alert alert-error">{error}</div>}

      <div style={{ marginBottom: 16 }}>
        <select value={storeId} onChange={e => setStoreId(e.target.value)} style={{ padding: "6px 12px", fontSize: 13, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-light)" }}>{stores.map(s => <option key={s.id} value={s.id}>{s.store_name}</option>)}</select>
      </div>

      <div className="table-container" style={{ marginTop: 16 }}>
        <table className="data-table">
          <thead><tr><th>Name</th><th>Slug</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={4} className="data-table-empty">Loading...</td></tr>
            : items.map(item => (
              <tr key={item.id}>
                <td><div style={{ fontWeight: 600 }}>{item.category_name}</div>{item.description && <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{item.description}</div>}</td>
                <td className="font-mono" style={{ fontSize: 12 }}>{item.slug}</td>
                <td><span className={`badge badge-sm ${item.is_active ? "badge-green" : "badge-gray"}`}>{item.is_active ? "Active" : "Inactive"}</span></td>
                <td>
                  <button onClick={() => router.push(`/inventory/categories/${item.id}`)} className="btn btn-ghost btn-sm" style={{ color: "var(--color-info)", marginRight: 4 }}><Edit2 size={14} /></button>
                  <button onClick={async () => { if (confirm("Delete?")) { await api.del(`/admin/inventory/categories/${item.id}`); setItems(items.filter(i => i.id !== item.id)); } }} className="btn btn-ghost btn-sm" style={{ color: "var(--color-error)" }}><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
