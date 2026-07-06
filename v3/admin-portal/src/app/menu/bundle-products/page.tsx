"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { parseApiError } from "@/lib/errors";
import { Plus, Edit2, Trash2, Search } from "lucide-react";
import { useCurrency } from "@/hooks/useCurrency";

interface BundleProduct { id: number; title: string; bundle_type: string; bundle_price: number; image_url?: string | null; components_count?: number; components?: { menu_item_id: number }[]; groups?: { pick_count: number; group_label: string }[]; category_name?: string; is_active: boolean; pick_count?: number | null; }

export default function BundleProductsPage() {
  const router = useRouter();
  const { format } = useCurrency();
  const searchParams = useSearchParams();
  const [items, setItems] = useState<BundleProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [page, setPage] = useState(1);
  const perPage = 20;

  const fetchItems = () => {
    setLoading(true);
    api.get<any[]>("/admin/menu/bundle-products?per_page=500")
      .then(d => setItems(d || []))
      .catch((e: unknown) => setError(parseApiError(e, "Failed to load bundles")))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchItems(); }, []);
  useEffect(() => {
    if (searchParams.get("created")) {
      setSuccessMsg("Bundle created successfully");
      setTimeout(() => setSuccessMsg(""), 3000);
    }
  }, [searchParams]);

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this bundle product?")) return;
    try { await api.del(`/admin/menu/bundle-products/${id}`); fetchItems(); }
    catch (e: unknown) { setError(parseApiError(e, "Failed to delete bundle")); }
  };

  const filtered = items.filter(b => {
    const matchesSearch = !search || b.title.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || (statusFilter === "active" ? b.is_active : !b.is_active);
    return matchesSearch && matchesStatus;
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const currentPage = Math.min(page, totalPages);
  const paged = filtered.slice((currentPage - 1) * perPage, currentPage * perPage);

  return (
    <div style={{ padding: 32 }}>
      <div className="page-header">
        <div><h1 className="page-title">Bundle Products</h1><p className="page-subtitle">{items.length} combo deals</p></div>
        <button type="button" onClick={() => router.push("/menu/bundle-products/new")} className="btn btn-primary btn-sm"><Plus size={16} /> Add Bundle</button>
      </div>
      {successMsg && <div className="alert alert-success">{successMsg}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      {/* Search + Filter bar */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, padding: "8px 16px", background: "var(--color-bg-white)", border: "1px solid var(--color-border-light)", borderRadius: "var(--radius-md)" }}>
        <Search size={16} color="var(--color-text-muted)" />
        <input type="text" placeholder="Search bundles..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} style={{ flex: 1, border: "none", outline: "none", fontSize: 13, background: "transparent" }} />
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value as any); setPage(1); }} style={{ padding: "4px 12px", fontSize: 13, borderRadius: "var(--radius-sm)" }}>
          <option value="all">All ({items.length})</option>
          <option value="active">Active ({items.filter(b => b.is_active).length})</option>
          <option value="inactive">Inactive ({items.filter(b => !b.is_active).length})</option>
        </select>
      </div>

      <div className="table-header-bar"><span className="text-sm font-semibold">{filtered.length} bundles</span></div>
      <div className="table-container"><table className="data-table">
        <thead><tr><th style={{ width: 50 }}></th><th>Title</th><th>Type</th><th>Components</th><th style={{ textAlign: "right" }}>Price</th><th style={{ width: 80 }}>Status</th><th style={{ width: 80 }}>Actions</th></tr></thead>
        <tbody>
          {loading ? <tr><td colSpan={7} className="data-table-empty">Loading...</td></tr>
            : paged.length === 0 ? <tr><td colSpan={7} className="data-table-empty">No bundle products found. <button type="button" onClick={() => router.push("/menu/bundle-products/new")} style={{ background: "none", border: "none", color: "var(--color-primary)", cursor: "pointer", textDecoration: "underline", fontSize: "inherit" }}>Create one</button></td></tr>
            : paged.map(b => (
              <tr key={b.id} className="clickable" role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); router.push(`/menu/bundle-products/${b.id}`); } }} onClick={() => router.push(`/menu/bundle-products/${b.id}`)} style={{ cursor: "pointer" }}>
                <td onClick={e => e.stopPropagation()}>{b.image_url ? <img src={b.image_url} alt={b.title} style={{ width: 36, height: 36, borderRadius: 6, objectFit: "cover" }} loading="lazy" /> : <div style={{ width: 36, height: 36, borderRadius: 6, background: "var(--color-bg-muted)" }} />}</td>
                <td><div style={{ fontWeight: 600 }}>{b.title}</div></td>
                <td><span className="badge badge-sm badge-blue">{b.pick_count ? `Pick ${b.pick_count}` : (b.bundle_type || "combo")}</span></td>
                <td style={{ fontSize: 12 }}>{b.components_count ?? b.components?.length ?? "—"} items</td>
                <td style={{ textAlign: "right", fontWeight: 600 }}>{format(b.bundle_price)}</td>
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
      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 16, alignItems: "center" }}>
          <button className="btn btn-ghost btn-sm" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Prev</button>
          <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>Page {currentPage} of {totalPages}</span>
          <button className="btn btn-ghost btn-sm" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}>Next</button>
        </div>
      )}
    </div>
  );
}
