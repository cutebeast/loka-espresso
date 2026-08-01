"use client";

import { useEffect, useState, useCallback, useRef, Fragment } from "react";
import { api } from "@/lib/api";
import { formatLocalDateTime } from "@/lib/datetime";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

interface EinvoiceDoc {
  id: number;
  order_id: number;
  order_number: string | null;
  payment_id: number;
  store_id: number;
  document_type: string;
  code_number: string;
  status: string;
  myinvois_uuid: string | null;
  submission_uid: string | null;
  validation_link: string | null;
  error_message: string | null;
  submitted_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  ubl_document?: Record<string, unknown> | null;
}
interface Store { id: number; store_name: string; }

const STATUSES = ["pending", "submitted", "validated", "rejected", "failed", "cancelled"];
const RETRIABLE = ["failed", "rejected", "pending"];
const STATUS_BADGE: Record<string, string> = {
  validated: "badge-green",
  submitted: "badge-yellow",
  pending: "badge-yellow",
  rejected: "badge-red",
  failed: "badge-red",
  cancelled: "badge-gray",
};

export default function EinvoicePage() {
  const { t } = useTranslation();
  const [items, setItems] = useState<EinvoiceDoc[]>([]);
  const [total, setTotal] = useState(0);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [storeId, setStoreId] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [orderIdFilter, setOrderIdFilter] = useState("");
  const [detailId, setDetailId] = useState<number | null>(null);
  const [detail, setDetail] = useState<EinvoiceDoc | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [retryingId, setRetryingId] = useState<number | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    api.get<Store[]>("/admin/stores?per_page=50").then(d => { if (mountedRef.current) setStores(Array.isArray(d) ? d : []); }).catch(() => {});
    return () => { mountedRef.current = false; };
  }, []);

  const fetch = useCallback(() => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (storeId) qs.set("store_id", storeId);
    if (statusFilter) qs.set("status", statusFilter);
    if (orderIdFilter.trim() && /^\d+$/.test(orderIdFilter.trim())) qs.set("order_id", orderIdFilter.trim());
    qs.set("per_page", "50");
    api.getPaginated<EinvoiceDoc>(`/admin/einvoice/documents?${qs}`).then(d => {
      setItems(d.items);
      setTotal(d.total);
    }).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, [storeId, statusFilter, orderIdFilter]);
  useEffect(() => { fetch(); }, [fetch]);

  const storeFor = (id: number) => stores.find(s => s.id === id);

  const toggleDetail = async (id: number) => {
    if (detailId === id) { setDetailId(null); setDetail(null); return; }
    setDetailId(id); setDetail(null); setDetailLoading(true);
    try { setDetail(await api.get<EinvoiceDoc>(`/admin/einvoice/documents/${id}`)); }
    catch (e: any) { setError(e.message); setDetailId(null); }
    finally { setDetailLoading(false); }
  };

  const handleRetry = async (id: number) => {
    setRetryingId(id); setError("");
    try {
      await api.post(`/admin/einvoice/documents/${id}/retry`);
      if (detailId === id) setDetail(await api.get<EinvoiceDoc>(`/admin/einvoice/documents/${id}`));
      fetch();
    } catch (e: any) { setError(e.message); }
    finally { setRetryingId(null); }
  };

  const sb = (s: string) => <span className={`badge badge-sm ${STATUS_BADGE[s] || "badge-gray"}`}>{t(`einvoice.status_${s}`)}</span>;
  const typeLabel = (dt: string) => dt === "04" ? t("einvoice.type_refund") : t("einvoice.type_invoice");
  const truncUuid = (u: string | null) => u == null ? "—" : u.length > 18 ? `${u.slice(0, 18)}…` : u;

  return <div style={{ padding: 32 }}>
    <div className="page-header">
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <ArrowLeft size={18} style={{ cursor: "pointer" }} onClick={() => history.back()} />
        <h1 className="page-title">{t("einvoice.title")}</h1>
      </div>
      <p className="page-subtitle">{t("einvoice.subtitle")}</p>
    </div>
    {error && <div className="alert alert-error">{error}</div>}
    <div style={{ marginBottom: 12, display: "flex", gap: 12, alignItems: "center" }}>
      <select value={storeId} onChange={e => setStoreId(e.target.value)} style={{ padding: "6px 12px", fontSize: 13, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-light)" }}>
        <option value="">{t("admin.common.allStores")}</option>
        {stores.map(s => <option key={s.id} value={s.id}>{s.store_name}</option>)}
      </select>
      <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ padding: "6px 12px", fontSize: 13, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-light)" }}>
        <option value="">{t("einvoice.all_status")}</option>
        {STATUSES.map(s => <option key={s} value={s}>{t(`einvoice.status_${s}`)}</option>)}
      </select>
      <input type="text" inputMode="numeric" placeholder={t("einvoice.order_id_placeholder")} value={orderIdFilter} onChange={e => setOrderIdFilter(e.target.value)} style={{ width: 110, padding: "6px 12px", fontSize: 13, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-light)" }} />
      <span style={{ fontSize: 12, opacity: 0.5 }}>{total}</span>
    </div>
    <div className="table-container"><table className="data-table">
      <thead><tr>
        <th>ID</th>
        <th>{t("einvoice.col_order")}</th>
        <th>{t("einvoice.col_store")}</th>
        <th>{t("einvoice.col_type")}</th>
        <th>{t("einvoice.col_code")}</th>
        <th>{t("einvoice.col_status")}</th>
        <th>{t("einvoice.col_uuid")}</th>
        <th>{t("einvoice.col_submitted")}</th>
        <th></th>
      </tr></thead>
      <tbody>
        {loading ? <tr><td colSpan={9} className="data-table-empty">{t("cash_sessions.loading")}</td></tr>
          : items.length === 0 ? <tr><td colSpan={9} className="data-table-empty">{t("einvoice.no_results")}</td></tr>
          : items.map(d => <Fragment key={d.id}>
            <tr>
              <td style={{ fontWeight: 600 }}>#{d.id}</td>
              <td style={{ fontSize: 12 }}>{d.order_number || `#${d.order_id}`}</td>
              <td style={{ fontSize: 12 }}>{storeFor(d.store_id)?.store_name || "—"}</td>
              <td style={{ fontSize: 12 }}>{typeLabel(d.document_type)}</td>
              <td style={{ fontSize: 12, fontFamily: "monospace" }}>{d.code_number}</td>
              <td>{sb(d.status)}</td>
              <td style={{ fontSize: 11, fontFamily: "monospace" }} title={d.myinvois_uuid || undefined}>{truncUuid(d.myinvois_uuid)}</td>
              <td style={{ fontSize: 12 }}>{formatLocalDateTime(d.submitted_at)}</td>
              <td style={{ textAlign: "right" }}>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => toggleDetail(d.id)}>{detailId === d.id ? t("einvoice.hide") : t("einvoice.view")}</button>
                {RETRIABLE.includes(d.status) && (
                  <button type="button" className="btn btn-sm btn-outline" disabled={retryingId === d.id} onClick={() => handleRetry(d.id)}>{retryingId === d.id ? "…" : t("einvoice.retry")}</button>
                )}
              </td>
            </tr>
            {detailId === d.id && <tr>
              <td colSpan={9} style={{ background: "var(--color-bg-muted)", padding: 16 }}>
                {detailLoading ? "…" : detail && <>
                  <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center", marginBottom: 12, fontSize: 12 }}>
                    <span>{t("einvoice.col_code")}: <b style={{ fontFamily: "monospace" }}>{detail.code_number}</b></span>
                    <span>{t("einvoice.col_uuid")}: <b style={{ fontFamily: "monospace" }}>{detail.myinvois_uuid || "—"}</b></span>
                    {detail.validation_link && <span>{t("einvoice.validation_link")}: <a href={detail.validation_link} target="_blank" rel="noopener noreferrer" style={{ color: "var(--color-primary)", wordBreak: "break-all" }}>{detail.validation_link}</a></span>}
                  </div>
                  {detail.error_message && <div className="alert alert-error" style={{ marginBottom: 12 }}>{t("einvoice.error")}: {detail.error_message}</div>}
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>{t("einvoice.ubl_document")}</div>
                  <pre style={{ fontSize: 11, maxHeight: 360, overflow: "auto", background: "var(--color-bg-surface, #fff)", border: "1px solid var(--color-border-light)", borderRadius: "var(--radius-sm)", padding: 12, margin: 0 }}>{JSON.stringify(detail.ubl_document, null, 2)}</pre>
                </>}
              </td>
            </tr>}
          </Fragment>)}
      </tbody>
    </table></div>
  </div>;
}
