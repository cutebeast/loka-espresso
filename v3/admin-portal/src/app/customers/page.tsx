"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Search, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";

interface CustomerSummary {
  id: number; display_name: string; phone_number: string; email_address: string | null;
  referral_code: string | null; order_count: number; lifetime_value: number;
  is_active: boolean; created_at: string; last_order_at: string | null;
}

export default function CustomersPage() {
  const [items, setItems] = useState<CustomerSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);

  const fetchData = useCallback(async () => { setError("");
    try {
      const qs = new URLSearchParams({ page: String(page), per_page: "20" });
      if (search) qs.set("search", search);
      const r = await api.getRaw<any>(`/admin/customers?${qs.toString()}`);
      setItems(r.items || []);
      setTotal(r.total || 0);
      setTotalPages(r.total_pages || 1);
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }, [page, search]);

  useEffect(() => {(async () => {
 fetchData(); 
})();}, [fetchData]);

  const formatDate = (s: string | null) => s ? new Date(s).toLocaleDateString() : "—";

  return (
    <div style={{ padding: 32 }}>
      <div className="page-header">
        <div><h1 className="page-title">Customers</h1><p className="page-subtitle">{total} customers</p></div>
      </div>
      {error && <div className="alert alert-error">{error}</div>}

      <div style={{ marginBottom: 16, maxWidth: 400 }}>
        <div style={{ position: "relative" }}>
          <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--color-text-muted)" }} />
          <input type="text" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by name, phone, or email..."
            style={{ width: "100%", padding: "8px 12px 8px 36px", fontSize: 13, border: "1px solid var(--color-border-light)", borderRadius: "var(--radius-sm)" }} />
        </div>
      </div>

      <div className="table-header-bar"><span className="text-sm font-semibold">{items.length} of {total} customers</span></div>
      <div className="table-container"><table className="data-table">
        <thead><tr><th>Customer</th><th>Phone</th><th>Email</th><th style={{ textAlign: "center" }}>Orders</th><th style={{ textAlign: "right" }}>LTV</th><th>Joined</th><th style={{ width: 80 }}>Status</th><th style={{ width: 70 }}>Actions</th></tr></thead>
        <tbody>
          {loading ? <tr><td colSpan={8} className="data-table-empty">Loading...</td></tr>
          : items.length === 0 ? <tr><td colSpan={8} className="data-table-empty">No customers found.</td></tr>
          : items.map(c => (
            <tr key={c.id} className="clickable" role="button" tabIndex={0} onKeyDown={(e)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();(() => window.open(`/customers/${c.id}`, "_self"))();}}} style={{ cursor: "pointer" }} onClick={() => window.open(`/customers/${c.id}`, "_self")}>
              <td style={{ fontWeight: 600 }}>{c.display_name || "—"}</td>
              <td className="font-mono" style={{ fontSize: 11 }}>{c.phone_number || "—"}</td>
              <td style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{c.email_address || "—"}</td>
              <td style={{ textAlign: "center" }}>{c.order_count}</td>
              <td style={{ textAlign: "right", fontWeight: 600 }}>RM {Number(c.lifetime_value).toFixed(2)}</td>
              <td style={{ fontSize: 12 }}>{formatDate(c.created_at)}</td>
              <td onClick={e => e.stopPropagation()}><span className={`badge badge-sm ${c.is_active ? "badge-green" : "badge-gray"}`}>{c.is_active ? "Active" : "Inactive"}</span></td>
              <td onClick={e => e.stopPropagation()}><Link href={`/customers/${c.id}`} className="btn btn-ghost btn-sm" style={{ color: "var(--color-info)" }}><ExternalLink size={12} /> View</Link></td>
            </tr>
          ))}
        </tbody>
      </table></div>

      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 8, alignItems: "center", marginTop: 16 }}>
          <button className="btn btn-sm btn-ghost" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft size={14} /> Prev</button>
          <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>Page {page} of {totalPages}</span>
          <button className="btn btn-sm btn-ghost" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next <ChevronRight size={14} /></button>
        </div>
      )}
    </div>
  );
}
