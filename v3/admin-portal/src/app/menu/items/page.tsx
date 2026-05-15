"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Plus, Edit2, Trash2 } from "lucide-react";

export default function MenuItemsPage() {
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [catFilter, setCatFilter] = useState("");
  const [categories, setCategories] = useState<any[]>([]);

  useEffect(() => {
    api.getRaw<{ items: any[] }>("/admin/menu/items?per_page=100").then(d => setItems(d.items || [])).catch(()=>{}).finally(()=>setLoading(false));
    api.getRaw<{ items: any[] }>("/admin/menu/categories?per_page=50").then(d => setCategories(d.items || [])).catch(()=>{});
  }, []);

  const filtered = catFilter ? items.filter(i => i.category_id === Number(catFilter)) : items;

  return (
    <div style={{ padding: 32 }}>
      <div className="page-header">
        <div><h1 className="page-title">Menu Items</h1><p className="page-subtitle">{items.length} items</p></div>
        <button onClick={() => router.push("/menu/items/new")} className="btn btn-primary btn-sm"><Plus size={16} /> Add Item</button>
      </div>
      <div style={{ marginBottom: 16, display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Category:</span>
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)} style={{ padding: "4px 12px", fontSize: 13, borderRadius: "var(--radius-sm)" }}>
          <option value="">All ({items.length})</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.category_name}</option>)}
        </select>
      </div>
      <div className="table-container">
        <table className="data-table">
          <thead><tr><th>Name</th><th>Code</th><th>Price</th><th>Category</th><th>Tags</th><th>Add-ons</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={8} className="data-table-empty">Loading...</td></tr>
            : filtered.map(item => (
              <tr key={item.id}>
                <td><div style={{ fontWeight: 600 }}>{item.item_name}</div>{item.description && <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{item.description?.slice(0, 60)}</div>}</td>
                <td className="font-mono" style={{ fontSize: 12 }}>{item.item_code}</td>
                <td>RM {Number(item.base_price).toFixed(2)}</td>
                <td style={{ fontSize: 13 }}>{item.category?.category_name || "—"}</td>
                <td style={{ fontSize: 11 }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
                    {(item.allergens || []).map((a: any) => <span key={a.id} className="badge badge-sm badge-red" style={{ fontSize: 10 }}>{a.display_name}</span>)}
                    {(item.dietary_tags || []).map((t: any) => <span key={t.id || t.dietary_tag_id} className="badge badge-sm badge-green" style={{ fontSize: 10 }}>{t.icon} {t.display_name}</span>)}
                  </div>
                </td>
                <td style={{ fontSize: 12 }}>{(item.modifier_groups || []).length ? `${item.modifier_groups.length} groups` : "—"}</td>
                <td><span className={`badge badge-sm ${item.is_available ? "badge-green" : "badge-gray"}`}>{item.is_available ? "Active" : "Inactive"}</span></td>
                <td>
                  <button onClick={() => router.push(`/menu/items/${item.id}`)} className="btn btn-ghost btn-sm" style={{ color: "var(--color-info)", marginRight: 4 }}><Edit2 size={14} /></button>
                  <button onClick={async () => { if (confirm("Delete?")) { await api.del(`/admin/menu/items/${item.id}`); const d = await api.getRaw<{items:any[]}>("/admin/menu/items?per_page=100"); setItems(d.items||[]); } }} className="btn btn-ghost btn-sm" style={{ color: "var(--color-error)" }}><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
