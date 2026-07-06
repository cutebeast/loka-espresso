"use client";
import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";

interface Res { id: number; customer_name?: string; customer_phone?: string; party_size: number; guest_count: number; reservation_date: string; reservation_time?: string; status: string; store_name?: string; }

export default function ReservationsPage() {
  const { t } = useTranslation();
  const [items, setItems] = useState<Res[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [date, setDate] = useState("");
  const [storeId, setStoreId] = useState("");
  const [stores, setStores] = useState<{id:number;store_name:string}[]>([]);

  useEffect(() => { api.get<any>("/admin/stores?per_page=50").then(d => setStores(Array.isArray(d)?d:(d.items||[]))).catch((e)=>{console.error('stores:',e)}); }, []);

  const fetch = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (date) { params.set("date_from", date); params.set("date_to", date); }
    if (storeId) params.set("store_id", storeId);
    api.get<{items:Res[]}>(`/admin/reservations?${params}`)
      .then(d => setItems(Array.isArray(d) ? d : (d.items || [])))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [status, date, storeId]);

  useEffect(() => { fetch(); }, [fetch]);

  const updateStatus = async (id: number, s: string) => { if (!confirm(`${s} this reservation?`)) return;
    try { await api.patch(`/admin/reservations/${id}/status`, { status: s }); fetch(); } catch (e) { console.error(e); }; };

  const sb = (s: string) => {
    const m: Record<string, string> = { requested: "badge-yellow", confirmed: "badge-blue", seated: "badge-green", completed: "badge-green", cancelled_by_guest: "badge-red", cancelled_by_merchant: "badge-red", no_show: "badge-gray" };
    return <span className={`badge badge-sm ${m[s] || "badge-gray"}`}>{s?.replace(/_/g, " ")}</span>;
  };

  return (
    <div style={{ padding: 32 }}>
      <div className="page-header"><div><h1 className="page-title">Reservations</h1><p className="page-subtitle">{items.length} reservations</p></div></div>
      {error && <div className="alert alert-error">{error}</div>}

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <select value={storeId} onChange={e => setStoreId(e.target.value)} style={{ padding: "6px 12px", fontSize: 13, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-light)" }}><option value="">{t("admin.common.allStores")}</option>{stores.map(s => <option key={s.id} value={s.id}>{s.store_name}</option>)}</select>
        <select value={status} onChange={e => setStatus(e.target.value)} style={{ padding: "6px 12px", fontSize: 13, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-light)" }}><option value="">All Status</option><option value="requested">Requested</option><option value="confirmed">Confirmed</option><option value="seated">Seated</option><option value="completed">Completed</option><option value="cancelled_by_guest">Cancelled by Guest</option><option value="cancelled_by_merchant">Cancelled by Merchant</option><option value="no_show">No Show</option></select>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ padding: "6px 10px", fontSize: 13, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-light)" }} />
      </div>

      <div className="table-header-bar"><span className="text-sm font-semibold">{items.length} reservations</span></div>
      <div className="table-container"><table className="data-table">
        <thead><tr><th>Customer</th><th>Guests</th><th>Date</th><th>Time</th><th>Store</th><th style={{ width: 90 }}>Status</th><th style={{ width: 160 }}>Actions</th></tr></thead>
        <tbody>
          {loading ? <tr><td colSpan={7} className="data-table-empty">Loading...</td></tr>
          : items.map(r => (<tr key={r.id}>
            <td><div style={{ fontWeight: 600 }}>{r.customer_name || "—"}</div>{r.customer_phone && <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{r.customer_phone}</div>}</td>
            <td>{r.party_size ?? r.guest_count ?? "—"}</td>
            <td style={{ fontSize: 12 }}>{r.reservation_date?.slice(0, 10)}</td>
            <td style={{ fontSize: 12 }}>{r.reservation_time || "—"}</td>
            <td>{r.store_name || "—"}</td>
            <td>{sb(r.status)}</td>
            <td>
              <div style={{ display: "flex", gap: 4 }}>
                {r.status === "requested" && <button type="button" onClick={() => updateStatus(r.id, "confirmed")} className="btn btn-sm btn-primary" style={{ fontSize: 11 }}>Confirm</button>}
                {r.status === "confirmed" && <button type="button" onClick={() => updateStatus(r.id, "seated")} className="btn btn-sm btn-primary" style={{ fontSize: 11 }}>Seat</button>}
                {r.status === "seated" && <button type="button" onClick={() => updateStatus(r.id, "completed")} className="btn btn-sm btn-primary" style={{ fontSize: 11 }}>Complete</button>}
                {(r.status === "requested" || r.status === "confirmed") && <button type="button" onClick={() => updateStatus(r.id, "cancelled_by_merchant")} className="btn btn-sm btn-ghost" style={{ fontSize: 11, color: "var(--color-error)" }}>Cancel</button>}
              </div>
            </td>
          </tr>))}
        </tbody>
      </table></div>
    </div>
  );
}