"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Plus, Edit2, Trash2 } from "lucide-react";

interface Category { id: number; category_name: string; slug: string; description?: string; is_available: boolean; }

export default function MenuCategoriesPage() {
  const router = useRouter();
  const [items, setItems] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchData = useCallback(async () => {
    try {
      const d = await api.getRaw<{ items: Category[] }>("/admin/menu/categories?per_page=50");
      setItems(Array.isArray(d) ? d : (d.items || []));
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { (async () => { await fetchData(); })(); }, []);

  return (
    <div style={{ padding: 32 }}>
      <div className="page-header">
        <div><h1 className="page-title">Menu Categories</h1><p className="page-subtitle">{items.length} categories</p></div>
        <button onClick={() => router.push("/menu/categories/new")} className="btn btn-primary btn-sm"><Plus size={16} /> Add Category</button>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="table-header-bar"><span style={{ fontSize: 13, fontWeight: 600 }}>Categories</span></div>
      <div className="table-container" style={{ marginTop: 0 }}>
        <table className="data-table">
          <thead><tr><th>Name</th><th>Slug</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={4} className="data-table-empty">Loading...</td></tr>
            : items.map(item => (
              <tr key={item.id}>
                <td><div style={{ fontWeight: 600 }}>{item.category_name}</div>{item.description && <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{item.description}</div>}</td>
                <td className="font-mono" style={{ fontSize: 12 }}>{item.slug}</td>
                <td><span className={`badge badge-sm ${item.is_available ? "badge-green" : "badge-gray"}`}>{item.is_available ? "Active" : "Inactive"}</span></td>
                <td>
                  <button onClick={() => router.push(`/menu/categories/${item.id}`)} className="btn btn-ghost btn-sm" style={{ color: "var(--color-info)", marginRight: 4 }}><Edit2 size={14} /></button>
                  <button onClick={async () => { if (confirm("Delete?")) { await api.del(`/admin/menu/categories/${item.id}`); fetchData(); } }} className="btn btn-ghost btn-sm" style={{ color: "var(--color-error)" }}><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
