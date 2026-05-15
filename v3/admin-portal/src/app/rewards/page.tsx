"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Plus, Edit2, Trash2, ChevronLeft, ChevronRight } from "lucide-react";

interface Reward {
  id: number; reward_name: string; reward_key: string; reward_type: string;
  short_description?: string; image_url?: string; points_cost: number;
  minimum_order_value?: number; is_active: boolean;
}

const PAGE_SIZE = 20;

export default function RewardsPage() {
  const router = useRouter();
  const [items, setItems] = useState<Reward[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchData = useCallback(async (p: number = 1) => {
    setLoading(true);
    try {
      const d = await api.getRaw<{ items: Reward[]; total: number; total_pages: number }>(
        `/admin/rewards?page=${p}&per_page=${PAGE_SIZE}`
      );
      setItems(d.items || []);
      setTotalPages(d.total_pages || 1);
      setPage(p);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(1); }, [fetchData]);

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this reward?")) return;
    try { await api.del(`/admin/rewards/${id}`); fetchData(page); } catch { /* ignore */ }
  };

  const typeLabel = (t: string) => {
    const map: Record<string, string> = { free_item: "Free Item", percentage_discount: "% Discount", fixed_discount: "Fixed Discount", free_delivery: "Free Delivery" };
    return <span className="badge badge-sm badge-blue">{map[t] || t}</span>;
  };

  return (
    <div style={{ padding: 32 }}>
      <div className="page-header">
        <div><h1 className="page-title">Rewards</h1><p className="page-subtitle">Loyalty point redemption catalog</p></div>
        <button onClick={() => router.push("/rewards/new")} className="btn btn-primary btn-sm"><Plus size={16} /> Add Reward</button>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="table-header-bar"><span className="text-sm font-semibold">{items.length} rewards</span></div>
      <div className="table-container"><table className="data-table">
        <thead><tr><th style={{ width: 44 }}></th><th>Name</th><th>Type</th><th>Points</th><th>Min Order</th><th style={{ width: 80 }}>Status</th><th style={{ width: 80 }}>Actions</th></tr></thead>
        <tbody>
          {loading ? <tr><td colSpan={7} className="data-table-empty">Loading...</td></tr>
            : items.map(item => (
              <tr key={item.id} className="clickable" onClick={() => router.push(`/rewards/${item.id}`)} style={{ cursor: "pointer" }}>
                <td>{item.image_url ? <img src={item.image_url} alt="" style={{ width: 32, height: 32, borderRadius: 6, objectFit: "cover" }} /> : <span style={{ fontSize: 16 }}>🎁</span>}</td>
                <td style={{ fontWeight: 600 }}>{item.reward_name}</td>
                <td>{typeLabel(item.reward_type)}</td>
                <td style={{ fontWeight: 600 }}>{item.points_cost.toLocaleString()} pts</td>
                <td>{item.minimum_order_value != null ? `RM ${item.minimum_order_value}` : "—"}</td>
                <td onClick={e => e.stopPropagation()}><span className={`badge badge-sm ${item.is_active ? "badge-green" : "badge-gray"}`}>{item.is_active ? "Active" : "Inactive"}</span></td>
                <td onClick={e => e.stopPropagation()}>
                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    <button onClick={() => router.push(`/rewards/${item.id}`)} className="btn btn-ghost btn-sm" style={{ color: "var(--color-info)" }}><Edit2 size={14} /></button>
                    <button onClick={() => handleDelete(item.id)} className="btn btn-ghost btn-sm" style={{ color: "var(--color-error)" }}><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
        </tbody>
      </table></div>
      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 8, alignItems: "center", marginTop: 16 }}>
          <button className="btn btn-sm btn-ghost" disabled={page <= 1} onClick={() => fetchData(page - 1)}><ChevronLeft size={14} /> Prev</button>
          <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>Page {page} of {totalPages}</span>
          <button className="btn btn-sm btn-ghost" disabled={page >= totalPages} onClick={() => fetchData(page + 1)}>Next <ChevronRight size={14} /></button>
        </div>
      )}
    </div>
  );
}
