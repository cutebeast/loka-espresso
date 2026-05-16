"use client";
import { useEffect, useState, useCallback } from "react";
import { getStaffTimeEvents, verifyTimeEvent, type StaffTimeEvent } from "@/lib/api";
import { api } from "@/lib/api";

interface St { id: number; store_name: string; }

export default function StaffTimeEventsPage() {
  const [items, setItems] = useState<StaffTimeEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [stores, setStores] = useState<St[]>([]);
  const [storeId, setStoreId] = useState("");
  const [eventTypeFilter, setEventTypeFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");

  useEffect(() => { api.getRaw<any>("/admin/stores?per_page=50").then(d => { const l = d.items||[]; setStores(l); if (l.length>0) setStoreId(String(l[0].id)); }).catch(()=>{}); }, []);

  const fetchData = useCallback(() => { setLoading(true);
    const qs = new URLSearchParams({ per_page: "50" }); if (storeId) qs.set("store_id", storeId); if (eventTypeFilter) qs.set("event_type", eventTypeFilter); if (dateFilter) { qs.set("date_from", dateFilter); qs.set("date_to", dateFilter); }
    api.getRaw<any>(`/admin/staff/time-events?${qs.toString()}`).then(d => setItems(d.items||d||[])).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, [storeId, eventTypeFilter, dateFilter]);
  useEffect(() => {(async () => {
 fetchData(); 
})();}, [fetchData]);

  const handleVerify = async (id: number) => { try { await verifyTimeEvent(id); fetchData(); } catch {}; };

  const typeBadge = (t: string) => {
    const m: Record<string, string> = { clock_in: "badge-green", clock_out: "badge-red", start_break: "badge-yellow", end_break: "badge-blue" };
    return <span className={`badge badge-sm ${m[t] || "badge-gray"}`}>{t?.replace(/_/g, " ")}</span>;
  };

  return (
    <div style={{ padding: 32 }}>
      <div className="page-header"><div><h1 className="page-title">Staff Time Events</h1><p className="page-subtitle">{items.length} events</p></div></div>
      {error && <div className="alert alert-error">{error}</div>}

      <div style={{ marginBottom: 16, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
        <select value={storeId} onChange={e => setStoreId(e.target.value)} style={{ padding: "6px 12px", fontSize: 13, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-light)" }}>{stores.map(s => <option key={s.id} value={s.id}>{s.store_name}</option>)}</select>
        <select value={eventTypeFilter} onChange={e => setEventTypeFilter(e.target.value)} style={{ padding: "6px 12px", fontSize: 13, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-light)" }}><option value="">All Types</option><option value="clock_in">Clock In</option><option value="clock_out">Clock Out</option><option value="start_break">Start Break</option><option value="end_break">End Break</option></select>
        <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)} style={{ padding: "6px 10px", fontSize: 13, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-light)" }} />
      </div>

      <div className="table-header-bar"><span className="text-sm font-semibold">{items.length} events</span></div>
      <div className="table-container"><table className="data-table">
        <thead><tr><th>Staff</th><th>Event</th><th>Timestamp</th><th style={{ width: 80 }}>Status</th><th style={{ width: 80 }}>Actions</th></tr></thead>
        <tbody>
          {loading ? <tr><td colSpan={5} className="data-table-empty">Loading...</td></tr>
          : items.map(e => (
            <tr key={e.id}>
              <td>{e.staff_name || `#${e.staff_id}`}</td>
              <td>{typeBadge(e.event_type)}</td>
              <td style={{ fontSize: 12 }}>{e.event_timestamp ? new Date(e.event_timestamp).toLocaleString() : "—"}</td>
              <td><span className={`badge badge-sm ${e.verified_at ? "badge-green" : "badge-yellow"}`}>{e.verified_at ? "Verified" : "Pending"}</span></td>
              <td>{!e.verified_at && <button onClick={() => handleVerify(e.id)} className="btn btn-sm btn-primary" style={{ fontSize: 11 }}>Verify</button>}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </div>
  );
}
