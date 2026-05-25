"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { ChevronLeft, ChevronRight, Eye } from "lucide-react";

interface ReportEntry {
  id: number;
  equipment_id: number;
  equipment_name: string;
  equipment_type: string;
  store_id: number;
  maintenance_type: string;
  status: string;
  description: string;
  performed_by: string;
  image_urls: string[];
  created_at: string;
}

export default function EquipmentReportsPage() {
  const [items, setItems] = useState<ReportEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [storeFilter, setStoreFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [stores, setStores] = useState<any[]>([]);
  const [modalImages, setModalImages] = useState<string[] | null>(null);
  const perPage = 30;

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (storeFilter) params.set("store_id", storeFilter);
      if (typeFilter) params.set("maintenance_type", typeFilter);
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
      params.set("page", String(page));
      params.set("per_page", String(perPage));
      const d = await api.getRaw<any>(`/admin/equipment/reports?${params.toString()}`);
      setItems(d?.items || []);
      setTotal(d?.total || 0);
    } catch (e: any) { setError(e?.message || "Failed to load reports"); }
    finally { setLoading(false); }
  }, [storeFilter, typeFilter, dateFrom, dateTo, page]);

  useEffect(() => {
    api.getRaw<any>("/admin/stores?per_page=50").then(d => setStores(Array.isArray(d) ? d : (d.items || []))).catch(() => {});
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const typeLabel = (t: string) => t?.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const statusLabel = (s: string) => s?.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const formatDt = (s: string) => s ? new Date(s).toLocaleString("en-MY") : "—";

  return (
    <div style={{ padding: 32 }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Equipment Reports</h1>
          <p className="page-subtitle">{total} report entries</p>
        </div>
      </div>
      {error && <div className="alert alert-error">{error}</div>}

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <select value={storeFilter} onChange={e => { setStoreFilter(e.target.value); setPage(1); }} style={{ padding: "6px 12px", fontSize: 13, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-light)" }}>
          <option value="">All Stores</option>
          {stores.map((s: any) => <option key={s.id} value={s.id}>{s.store_name}</option>)}
        </select>
        <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1); }} style={{ padding: "6px 12px", fontSize: 13, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-light)" }}>
          <option value="">All Types</option>
          <option value="inspection">Inspection</option>
          <option value="corrective">Corrective</option>
          <option value="preventive">Preventive</option>
          <option value="repair">Repair</option>
          <option value="replacement">Replacement</option>
        </select>
        <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} style={{ padding: "6px 10px", fontSize: 13, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-light)" }} />
        <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }} style={{ padding: "6px 10px", fontSize: 13, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-light)" }} />
      </div>

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Equipment</th>
              <th>Store</th>
              <th>Type</th>
              <th>Status</th>
              <th>Reported By</th>
              <th>Description</th>
              <th>Photos</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="data-table-empty">Loading...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={8} className="data-table-empty">No reports found</td></tr>
            ) : items.map(r => (
              <tr key={r.id}>
                <td>
                  <div style={{ fontWeight: 600 }}>{r.equipment_name}</div>
                  <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{r.equipment_type}</div>
                </td>
                <td style={{ fontSize: 12 }}>Store #{r.store_id}</td>
                <td><span className={`badge badge-sm ${r.maintenance_type === "inspection" ? "badge-green" : r.maintenance_type === "corrective" ? "badge-amber" : "badge-blue"}`}>{typeLabel(r.maintenance_type)}</span></td>
                <td style={{ fontSize: 12 }}>{statusLabel(r.status)}</td>
                <td style={{ fontSize: 12 }}>{r.performed_by || "—"}</td>
                <td style={{ fontSize: 12, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.description}>{r.description}</td>
                <td>
                  {r.image_urls && r.image_urls.length > 0 ? (
                    <button type="button" onClick={() => setModalImages(r.image_urls)} className="btn btn-ghost btn-sm" style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11 }}>
                      <Eye size={12} /> {r.image_urls.length}
                    </button>
                  ) : <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>—</span>}
                </td>
                <td style={{ fontSize: 12 }}>{formatDt(r.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {total > perPage && (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12, marginTop: 16 }}>
          <button type="button" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="btn btn-ghost btn-sm" style={{ opacity: page <= 1 ? 0.4 : 1 }}><ChevronLeft size={14} /> Prev</button>
          <span style={{ fontSize: 13 }}>Page {page} of {totalPages} ({total} total)</span>
          <button type="button" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages} className="btn btn-ghost btn-sm" style={{ opacity: page >= totalPages ? 0.4 : 1 }}>Next <ChevronRight size={14} /></button>
        </div>
      )}

      {modalImages && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setModalImages(null)}>
          <div style={{ background: "var(--color-bg, #fff)", borderRadius: "var(--radius-md)", padding: 16, maxWidth: "90vw", maxHeight: "90vh", overflow: "auto" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
              {modalImages.map((url, i) => (
                <img key={i} src={url} alt="" style={{ maxWidth: "100%", borderRadius: "var(--radius-sm)" }} />
              ))}
            </div>
            <button type="button" onClick={() => setModalImages(null)} className="btn btn-ghost btn-sm" style={{ marginTop: 12, display: "block", marginLeft: "auto" }}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
