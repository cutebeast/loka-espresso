"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Plus, Edit2, Trash2, ChevronLeft, ChevronRight } from "lucide-react";

interface Voucher {
  id: number; voucher_code: string; display_title: string; voucher_type: string;
  discount_value: number; global_use_count?: number; max_global_uses?: number;
  valid_from?: string; valid_until?: string; is_active: boolean;
}

const PAGE_SIZE = 20;

export default function VouchersPage() {
  const router = useRouter();
  const [items, setItems] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchData = useCallback(async (p: number = 1) => {
    return api.getRaw<{ items: Voucher[]; total: number; total_pages: number }>(
      `/admin/vouchers?page=${p}&per_page=${PAGE_SIZE}`
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchData(1)
      .then((d) => {
        if (cancelled) return;
        setItems(d.items || []);
        setTotalPages(d.total_pages || 1);
        setPage(1);
      })
      .catch((e: any) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [fetchData]);

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this voucher?")) return;
    try { await api.del(`/admin/vouchers/${id}`); const d = await fetchData(page); setItems(d.items || []); setTotalPages(d.total_pages || 1); } catch { /* ignore */ }
  };

  const discountLabel = (v: Voucher) => {
    if (v.voucher_type === "percentage_off") return `${(v.discount_value * 100).toFixed(0)}% off`;
    if (v.voucher_type === "free_item") return `Free (up to RM ${v.discount_value})`;
    return `RM ${v.discount_value} off`;
  };

  const typeBadge = (t: string) => {
    const m: Record<string, string> = { percentage_off: "badge-blue", fixed_amount_off: "badge-green", free_item: "badge-yellow" };
    return <span className={`badge badge-sm ${m[t] || "badge-blue"}`}>{t.replace(/_/g, " ")}</span>;
  };

  return (
    <div style={{ padding: 32 }}>
      <div className="page-header">
        <div><h1 className="page-title">Vouchers</h1><p className="page-subtitle">Discount vouchers claimed through promotions</p></div>
        <button onClick={() => router.push("/vouchers/new")} className="btn btn-primary btn-sm"><Plus size={16} /> Add Voucher</button>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="table-header-bar"><span className="text-sm font-semibold">{items.length} vouchers</span></div>
      <div className="table-container"><table className="data-table">
        <thead><tr><th>Code</th><th>Title</th><th>Type</th><th>Discount</th><th>Valid</th><th>Uses</th><th style={{ width: 80 }}>Status</th><th style={{ width: 80 }}>Actions</th></tr></thead>
        <tbody>
          {loading ? <tr><td colSpan={8} className="data-table-empty">Loading...</td></tr>
            : items.map(item => (
              <tr key={item.id} className="clickable" role="button" tabIndex={0} onKeyDown={(e)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();(() => router.push(`/vouchers/${item.id}`))();}}} onClick={() => router.push(`/vouchers/${item.id}`)} style={{ cursor: "pointer" }}>
                <td className="font-mono" style={{ fontSize: 12 }}>{item.voucher_code}</td>
                <td style={{ fontWeight: 600 }}>{item.display_title}</td>
                <td>{typeBadge(item.voucher_type)}</td>
                <td style={{ fontWeight: 600, color: "var(--color-success)" }}>{discountLabel(item)}</td>
                <td style={{ fontSize: 12 }}>{item.valid_from?.slice(0, 10) || "—"} → {item.valid_until?.slice(0, 10) || "—"}</td>
                <td style={{ fontSize: 12 }}>{item.global_use_count || 0}/{item.max_global_uses || "∞"}</td>
                <td onClick={e => e.stopPropagation()}><span className={`badge badge-sm ${item.is_active ? "badge-green" : "badge-gray"}`}>{item.is_active ? "Active" : "Inactive"}</span></td>
                <td onClick={e => e.stopPropagation()}>
                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    <button onClick={() => router.push(`/vouchers/${item.id}`)} className="btn btn-ghost btn-sm" style={{ color: "var(--color-info)" }}><Edit2 size={14} /></button>
                    <button onClick={() => handleDelete(item.id)} className="btn btn-ghost btn-sm" style={{ color: "var(--color-error)" }}><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
        </tbody>
      </table></div>
      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 8, alignItems: "center", marginTop: 16 }}>
          <button className="btn btn-sm btn-ghost" disabled={page <= 1} onClick={async () => { const d = await fetchData(page - 1); setItems(d.items || []); setTotalPages(d.total_pages || 1); setPage(page - 1); }}><ChevronLeft size={14} /> Prev</button>
          <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>Page {page} of {totalPages}</span>
          <button className="btn btn-sm btn-ghost" disabled={page >= totalPages} onClick={async () => { const d = await fetchData(page + 1); setItems(d.items || []); setTotalPages(d.total_pages || 1); setPage(page + 1); }}>Next <ChevronRight size={14} /></button>
        </div>
      )}
    </div>
  );
}
