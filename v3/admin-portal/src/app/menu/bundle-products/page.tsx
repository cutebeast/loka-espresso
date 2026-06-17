"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Plus, Edit2, Trash2 } from "lucide-react";

interface BundleProduct { id: number; title: string; bundle_type: string; bundle_price: number; components_count?: number; category_name?: string; is_active: boolean; }

export default function BundleProductsPage() {
  const router = useRouter();
  const [items, setItems] = useState<BundleProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchItems = () => {
    setLoading(true);
    api.get<any[]>("/admin/menu/bundle-products?per_page=100")
      .then(d => setItems(d || []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchItems(); }, []);

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this bundle product?")) return;
    try { await api.del(`/admin/menu/bundle-products/${id}`); fetchItems(); } catch (e) { console.error(e); }
  };

  return (
    <div style={{ padding: 32 }}>
      <div className="page-header">
        <div><h1 className="page-title">Bundle Products</h1><p className="page-subtitle">{items.length} combo deals</p></div>
        <button type="button" onClick={() => router.push("/menu/bundle-products/new")} className="btn btn-primary btn-sm"><Plus size={16} /> Add Bundle</button>
      </div>
      {error && <div className="alert alert-error">{error}</div>}

      <div className="table-header-bar"><span className="text-sm font-semibold">{items.length} bundles</span></div>
      <div className="table-container"><table className="data-table">
        <thead><tr><th>Title</th><th>Type</th><th>Components</th><th style={{ textAlign: "right" }}>Price</th><th style={{ width: 80 }}>Status</th><th style={{ width: 80 }}>Actions</th></tr></thead>
        <tbody>
          {loading ? <tr><td colSpan={6} className="data-table-empty">Loading...</td></tr>
            : items.map(b => (
              <tr key={b.id} className="clickable" role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); router.push(`/menu/bundle-products/${b.id}`); } }} onClick={() => router.push(`/menu/bundle-products/${b.id}`)} style={{ cursor: "pointer" }}>
                <td><div style={{ fontWeight: 600 }}>{b.title}</div></td>
                <td><span className="badge badge-sm badge-blue">{b.bundle_type || "combo"}</span></td>
                <td style={{ fontSize: 12 }}>{b.components_count ?? (b as any).components?.length ?? "—"} items</td>
                <td style={{ textAlign: "right", fontWeight: 600 }}>RM {Number(b.bundle_price || 0).toFixed(2)}</td>
                <td onClick={e => e.stopPropagation()}><span className={`badge badge-sm ${b.is_active ? "badge-green" : "badge-gray"}`}>{b.is_active ? "Active" : "Inactive"}</span></td>
                <td onClick={e => e.stopPropagation()}>
                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    <button type="button" onClick={() => router.push(`/menu/bundle-products/${b.id}`)} className="btn btn-ghost btn-sm" style={{ color: "var(--color-info)" }} aria-label="Edit"><Edit2 size={14} /></button>
                    <button type="button" onClick={() => handleDelete(b.id)} className="btn btn-ghost btn-sm" style={{ color: "var(--color-error)" }} aria-label="Delete"><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
        </tbody>
      </table></div>
    </div>
  );
}
