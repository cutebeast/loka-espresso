"use client";

import { useEffect, useState, useCallback } from "react";
import { getTipAllocations, type TipAllocation } from "@/lib/api";
import { api } from "@/lib/api";

interface Store { id: number; store_name: string; }

export default function StaffTipsPage() {
  const [items, setItems] = useState<TipAllocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [storeId, setStoreId] = useState("");
  const [stores, setStores] = useState<Store[]>([]);

  useEffect(() => {
    api.get<Store[]>("/admin/stores?per_page=50").then(d => setStores(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  const fetchData = useCallback(async () => {
    return getTipAllocations({ store_id: storeId ? Number(storeId) : undefined });
  }, [storeId]);

  useEffect(() => {
    let cancelled = false;
    fetchData()
      .then((d) => { if (!cancelled) setItems(d); })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [fetchData]);

  return (
    <div style={{ padding: 32 }}>
      <div className="page-header"><div><h1 className="page-title">Tip Allocations</h1><p className="page-subtitle">{items.length} tips</p></div></div>
      {error && <div className="alert alert-error">{error}</div>}
      <div style={{ marginBottom: 12 }}>
        <select value={storeId} onChange={e => setStoreId(e.target.value)} style={{ padding: "6px 12px", fontSize: 13, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-light)" }}>
          <option value="">All Stores</option>{stores.map(s => <option key={s.id} value={s.id}>{s.store_name}</option>)}
        </select>
      </div>
      <div className="page-header"><div><h1 className="page-title">Tip Allocations</h1><p className="page-subtitle">{items.length} allocations</p></div></div>
      {error && <div className="alert alert-error">{error}</div>}

      <div className="table-header-bar"><span className="text-sm font-semibold">{items.length} allocations</span></div>
      <div className="table-container"><table className="data-table">
        <thead><tr><th>Order</th><th>Store</th><th style={{ textAlign: "right" }}>Total Tip</th><th>Method</th><th>Distributed By</th><th>Date</th></tr></thead>
        <tbody>
          {loading ? <tr><td colSpan={6} className="data-table-empty">Loading...</td></tr>
          : items.length === 0 ? <tr><td colSpan={6} className="data-table-empty">No tip allocations found.</td></tr>
          : items.map(t => (<tr key={t.id}>
            <td className="font-mono" style={{ fontSize: 11 }}>#{t.order_id}</td>
            <td>{t.store_name || `Store #${t.store_id}`}</td>
            <td style={{ textAlign: "right", fontWeight: 600 }}>RM {Number(t.total_tip || 0).toFixed(2)}</td>
            <td style={{ textTransform: "capitalize", fontSize: 12 }}>{t.payment_method || "—"}</td>
            <td>{t.distributed_by_name || "—"}</td>
            <td style={{ fontSize: 12 }}>{t.created_at ? new Date(t.created_at).toLocaleDateString() : "—"}</td>
          </tr>))}
        </tbody>
      </table></div>
    </div>
  );
}
