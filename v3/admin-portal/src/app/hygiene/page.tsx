"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { CheckCircle, XCircle, AlertTriangle, Eye } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

interface HygieneEntry {
  id: number;
  store_id: number;
  report_type: string;
  description: string | null;
  status: string;
  image_urls: any;
  submitted_by: string;
  verified_by: string | null;
  verified_at: string | null;
  verified_notes: string | null;
  created_at: string;
}

export default function HygienePage() {
  const { t } = useTranslation();
  const [items, setItems] = useState<HygieneEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [stores, setStores] = useState<any[]>([]);
  const [reportType, setReportType] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [storeFilter, setStoreFilter] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [modalImages, setModalImages] = useState<{ images: string[]; label: string } | null>(null);
  const [verifying, setVerifying] = useState<number | null>(null);
  const [verifyNotes, setVerifyNotes] = useState("");
  const perPage = 20;

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  const fetchData = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams();
      if (storeFilter) params.set("store_id", storeFilter);
      if (reportType) params.set("report_type", reportType);
      if (statusFilter) params.set("status", statusFilter);
      params.set("page", String(page));
      params.set("per_page", String(perPage));
      const d = await api.getRaw<any>(`/admin/hygiene/reports?${params.toString()}`);
      setItems(d?.items || []);
      setTotal(d?.total || 0);
    } catch (e: any) { setError(e?.message || "Failed to load reports"); }
    finally { setLoading(false); }
  }, [storeFilter, reportType, statusFilter, page]);

  useEffect(() => {
    api.getRaw<any>("/admin/stores?per_page=50").then(d => setStores(Array.isArray(d) ? d : (d.items || []))).catch((e: unknown) => console.error("hygiene stores load:", e));
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleVerify = async (id: number) => {
    try {
      await api.patch(`/admin/hygiene/reports/${id}`, { status: "verified", verified_notes: verifyNotes || null });
      setVerifying(null); setVerifyNotes(""); fetchData();
    } catch (e: any) { setError(e?.message || "Failed to verify"); }
  };

  const handleFlag = async (id: number) => {
    try {
      await api.patch(`/admin/hygiene/reports/${id}`, { status: "flagged", verified_notes: verifyNotes || null });
      setVerifying(null); setVerifyNotes(""); fetchData();
    } catch (e: any) { setError(e?.message || "Failed to flag"); }
  };

  const getImageList = (urls: any): string[] => {
    if (!urls) return [];
    if (Array.isArray(urls)) return urls;
    if (typeof urls === "object") {
      const flat: string[] = [];
      for (const key of Object.keys(urls)) {
        if (Array.isArray(urls[key])) flat.push(...urls[key]);
      }
      return flat;
    }
    return [];
  };

  const statusBadge = (status: string) => {
    const map: Record<string, string> = { pending: "badge-yellow", verified: "badge-green", flagged: "badge-red" };
    return map[status] || "badge-gray";
  };

  return (
    <div style={{ padding: 32 }}>
      <div className="page-header">
        <div><h1 className="page-title">Hygiene Reports</h1><p className="page-subtitle">{total} reports — Grease Trap &amp; Garbage Disposal</p></div>
      </div>
      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <select value={storeFilter} onChange={e => { setStoreFilter(e.target.value); setPage(1); }} style={{ padding: "6px 12px", fontSize: 13, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-light)" }}>
          <option value="">{t("admin.common.allStores")}</option>
          {stores.map(s => <option key={s.id} value={s.id}>{s.store_name}</option>)}
        </select>
        <select value={reportType} onChange={e => { setReportType(e.target.value); setPage(1); }} style={{ padding: "6px 12px", fontSize: 13, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-light)" }}>
          <option value="">All Types</option>
          <option value="grease_trap">Grease Trap</option>
          <option value="garbage_disposal">Garbage Disposal</option>
        </select>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} style={{ padding: "6px 12px", fontSize: 13, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-light)" }}>
          <option value="">All Status</option>
          <option value="pending">Pending</option>
          <option value="verified">Verified</option>
          <option value="flagged">Flagged</option>
        </select>
      </div>

      <div className="table-container">
        <table className="data-table">
          <thead><tr>
            <th>ID</th><th>Type</th><th>Store</th><th>Submitted By</th><th>Description</th><th style={{ width: 80 }}>Images</th><th style={{ width: 90 }}>Status</th><th>Date</th><th style={{ width: 140 }}>Actions</th>
          </tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={9} className="data-table-empty">Loading...</td></tr>
            : items.length === 0 ? <tr><td colSpan={9} className="data-table-empty">No hygiene reports found.</td></tr>
            : items.map(item => {
              const imgList = getImageList(item.image_urls);
              const storeName = stores.find(s => s.id === item.store_id)?.store_name || `Store #${item.store_id}`;
              return (
                <tr key={item.id}>
                  <td style={{ fontWeight: 600, fontSize: 13 }}>#{item.id}</td>
                  <td style={{ textTransform: "capitalize" }}>
                    {item.report_type === "grease_trap" ? <span style={{ color: "var(--color-warning, #f0ad4e)", fontWeight: 600 }}>Grease Trap</span> : <span style={{ color: "var(--color-info, #5bc0de)", fontWeight: 600 }}>Garbage</span>}
                  </td>
                  <td>{storeName}</td>
                  <td style={{ fontSize: 13 }}>{item.submitted_by}</td>
                  <td style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.description || "—"}</td>
                  <td>
                    {imgList.length > 0 ? (
                      <button onClick={() => setModalImages({ images: imgList, label: `${item.report_type} #${item.id}` })} className="btn btn-ghost btn-sm" style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
                        <Eye size={14} /> {imgList.length}
                      </button>
                    ) : "—"}
                  </td>
                  <td><span className={`badge badge-sm ${statusBadge(item.status)}`}>{item.status}</span></td>
                  <td style={{ fontSize: 12 }}>{new Date(item.created_at).toLocaleDateString()}</td>
                  <td>
                    {verifying === item.id ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <input placeholder="Notes (optional)" value={verifyNotes} onChange={e => setVerifyNotes(e.target.value)} style={{ fontSize: 11, padding: "4px 6px", width: 120 }} />
                        <div style={{ display: "flex", gap: 4 }}>
                          <button onClick={() => handleVerify(item.id)} className="btn btn-sm btn-success" style={{ fontSize: 11, padding: "2px 8px" }}>Verify</button>
                          <button onClick={() => handleFlag(item.id)} className="btn btn-sm btn-danger" style={{ fontSize: 11, padding: "2px 8px" }}>Flag</button>
                          <button onClick={() => setVerifying(null)} className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}>Cancel</button>
                        </div>
                      </div>
                    ) : item.status === "pending" ? (
                      <button onClick={() => setVerifying(item.id)} className="btn btn-outline btn-sm" style={{ fontSize: 12 }}>Review</button>
                    ) : (
                      <div style={{ fontSize: 11 }}>
                        {item.status === "verified" && <span style={{ color: "var(--color-success)", display: "flex", alignItems: "center", gap: 2 }}><CheckCircle size={12} /> Verified</span>}
                        {item.status === "flagged" && <span style={{ color: "var(--color-error)", display: "flex", alignItems: "center", gap: 2 }}><AlertTriangle size={12} /> Flagged</span>}
                        {item.verified_by && <div style={{ color: "var(--color-text-muted)", marginTop: 2 }}>by {item.verified_by}</div>}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 16 }}>
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="btn btn-outline btn-sm">Prev</button>
          <span style={{ fontSize: 13, padding: "4px 8px", display: "flex", alignItems: "center" }}>Page {page} of {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="btn btn-outline btn-sm">Next</button>
        </div>
      )}

      {modalImages && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setModalImages(null)}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 24, maxWidth: 700, maxHeight: "80vh", overflow: "auto" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>Images — {modalImages.label}</h3>
              <button onClick={() => setModalImages(null)} className="btn btn-ghost btn-sm" style={{ fontSize: 18 }}><XCircle size={20} /></button>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {modalImages.images.map((url, i) => (
                <img key={i} src={url} alt="" style={{ width: 150, height: 150, objectFit: "cover", borderRadius: 8, border: "1px solid var(--color-border-light)" }} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}