"use client";

import { useEffect, useState, useCallback, useRef, Fragment } from "react";
import { api } from "@/lib/api";
import { usePersistedState } from "@/lib/usePersistedState";
import { formatLocalDateTime } from "@/lib/datetime";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { useCurrency } from "@/hooks/useCurrency";

interface PosSession {
  id: number;
  terminal_id: number;
  staff_id: number | null;
  status: string;
  opened_at: string;
  closed_at: string | null;
  opening_cash: number;
  closing_cash: number | null;
  expected_cash: number | null;
  discrepancy: number | null;
  discrepancy_notes: string | null;
  total_sales_cash: number;
  total_sales_card: number;
  total_sales_qr: number;
  order_count: number;
}
interface SessionPayment {
  id: number;
  order_id: number;
  order_number: string;
  provider: string;
  status: string;
  amount: number;
  captured_amount: number;
  refunded_amount: number;
  created_at: string;
}
interface SessionReport {
  window_start: string;
  window_end: string;
  order_count: number;
  sales_cash: number;
  sales_card: number;
  sales_qr: number;
  cash_refunds: number;
  opening_cash: number;
  expected_cash: number;
}
interface SessionDetail extends PosSession {
  report: SessionReport | null;
  payments: SessionPayment[];
}
interface Store { id: number; store_name: string; }
interface Terminal { id: number; store_id: number; name: string; }
interface StaffRow { id: number; display_name: string; }

export default function CashSessionsPage() {
  const { t } = useTranslation();
  const { format } = useCurrency();
  const [items, setItems] = useState<PosSession[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [staffMap, setStaffMap] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [storeId, setStoreId] = usePersistedState("list:cash.storeId", "");
  const [statusFilter, setStatusFilter] = useState("");
  const [closeId, setCloseId] = useState<number | null>(null);
  const [closeCash, setCloseCash] = useState("");
  const [closeNotes, setCloseNotes] = useState("");
  const [closing, setClosing] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    api.get<Store[]>("/admin/stores?per_page=50").then(d => { if (mountedRef.current) setStores(Array.isArray(d) ? d : []); }).catch(() => {});
    api.get<Terminal[]>("/admin/pos/terminals").then(d => { if (mountedRef.current) setTerminals(Array.isArray(d) ? d : []); }).catch(() => {});
    api.get<StaffRow[]>("/admin/staff?per_page=200").then(d => {
      if (!mountedRef.current) return;
      const rows = Array.isArray(d) ? d : [];
      setStaffMap(Object.fromEntries(rows.map(s => [s.id, s.display_name])));
    }).catch(() => {});
    return () => { mountedRef.current = false; };
  }, []);

  const fetch = useCallback(() => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (storeId) qs.set("store_id", storeId);
    if (statusFilter) qs.set("status", statusFilter);
    api.get<PosSession[]>(`/admin/pos/sessions?${qs}`).then(d => setItems(Array.isArray(d) ? d : [])).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, [storeId, statusFilter]);
  useEffect(() => { fetch(); }, [fetch]);

  const terminalFor = (id: number) => terminals.find(tm => tm.id === id);
  const storeFor = (terminalId: number) => stores.find(s => s.id === terminalFor(terminalId)?.store_id);

  const handleClose = async () => {
    if (closeId == null || closeCash === "") return;
    setClosing(true); setError("");
    try {
      await api.post(`/admin/pos/sessions/${closeId}/close`, { closing_cash: parseFloat(closeCash), ...(closeNotes ? { discrepancy_notes: closeNotes } : {}) });
      setCloseId(null); setCloseCash(""); setCloseNotes("");
      fetch();
    } catch (e: any) { setError(e.message); }
    finally { setClosing(false); }
  };

  const toggleDetail = async (id: number) => {
    if (detailId === id) { setDetailId(null); setDetail(null); return; }
    setDetailId(id); setDetail(null); setDetailLoading(true);
    try { setDetail(await api.get<SessionDetail>(`/admin/pos/sessions/${id}`)); }
    catch (e: any) { setError(e.message); setDetailId(null); }
    finally { setDetailLoading(false); }
  };

  const sb = (s: string) => {
    const m: Record<string, string> = { open: "badge-green", closed: "badge-gray", paused: "badge-yellow" };
    return <span className={`badge badge-sm ${m[s] || "badge-gray"}`}>{s}</span>;
  };
  const varianceCell = (s: PosSession) => {
    if (s.status === "open" || s.discrepancy == null) return "—";
    const v = s.discrepancy;
    const ok = Math.abs(v) < 0.005;
    return <span style={{ fontWeight: 700, color: ok ? "var(--color-success)" : "var(--color-error)" }}>{v >= 0 ? "+" : "−"}{format(Math.abs(v))}</span>;
  };

  return <div style={{ padding: 32 }}>
    <div className="page-header">
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <ArrowLeft size={18} style={{ cursor: "pointer" }} onClick={() => history.back()} />
        <h1 className="page-title">{t("cash_sessions.title")}</h1>
      </div>
      <p className="page-subtitle">{t("cash_sessions.subtitle")}</p>
    </div>
    {error && <div className="alert alert-error">{error}</div>}
    <div style={{ marginBottom: 12, display: "flex", gap: 12, alignItems: "center" }}>
      <select value={storeId} onChange={e => setStoreId(e.target.value)} style={{ padding: "6px 12px", fontSize: 13, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-light)" }}>
        <option value="">{t("admin.common.allStores")}</option>
        {stores.map(s => <option key={s.id} value={s.id}>{s.store_name}</option>)}
      </select>
      <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ padding: "6px 12px", fontSize: 13, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-light)" }}>
        <option value="">{t("cash_sessions.all_status")}</option>
        <option value="open">{t("cash_sessions.status_open")}</option>
        <option value="closed">{t("cash_sessions.status_closed")}</option>
      </select>
      <span style={{ fontSize: 12, opacity: 0.5 }}>{items.length}</span>
    </div>
    <div className="table-container"><table className="data-table">
      <thead><tr>
        <th>{t("cash_sessions.session")}</th><th>{t("cash_sessions.store")}</th><th>{t("cash_sessions.staff")}</th>
        <th>{t("cash_sessions.opened")}</th><th>{t("cash_sessions.status")}</th>
        <th style={{ textAlign: "right" }}>{t("cash_sessions.float")}</th>
        <th style={{ textAlign: "right" }}>{t("cash_sessions.cash_sales")}</th>
        <th style={{ textAlign: "right" }}>{t("cash_sessions.expected")}</th>
        <th style={{ textAlign: "right" }}>{t("cash_sessions.counted")}</th>
        <th style={{ textAlign: "right" }}>{t("cash_sessions.variance")}</th>
        <th style={{ textAlign: "right" }}>{t("cash_sessions.orders")}</th>
        <th></th>
      </tr></thead>
      <tbody>
        {loading ? <tr><td colSpan={12} className="data-table-empty">{t("cash_sessions.loading")}</td></tr>
          : items.length === 0 ? <tr><td colSpan={12} className="data-table-empty">{t("admin.common.noResults")}</td></tr>
          : items.map(s => <Fragment key={s.id}>
            <tr>
              <td style={{ fontWeight: 600 }}>#{s.id}</td>
              <td style={{ fontSize: 12 }}>{storeFor(s.terminal_id)?.store_name || "—"}<br /><span style={{ opacity: 0.5 }}>{terminalFor(s.terminal_id)?.name || `#${s.terminal_id}`}</span></td>
              <td style={{ fontSize: 12 }}>{s.staff_id ? staffMap[s.staff_id] || `#${s.staff_id}` : "—"}</td>
              <td style={{ fontSize: 12 }}>{formatLocalDateTime(s.opened_at)}</td>
              <td>{sb(s.status)}</td>
              <td style={{ textAlign: "right" }}>{format(s.opening_cash)}</td>
              <td style={{ textAlign: "right" }}>{s.status === "open" ? "—" : format(s.total_sales_cash)}</td>
              <td style={{ textAlign: "right" }}>{s.expected_cash != null ? format(s.expected_cash) : "—"}</td>
              <td style={{ textAlign: "right" }}>{s.closing_cash != null ? format(s.closing_cash) : "—"}</td>
              <td style={{ textAlign: "right" }}>{varianceCell(s)}</td>
              <td style={{ textAlign: "right" }}>{s.order_count}</td>
              <td style={{ textAlign: "right" }}>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => toggleDetail(s.id)}>{detailId === s.id ? t("cash_sessions.hide") : t("cash_sessions.view")}</button>
                {s.status === "open" && (closeId === s.id ? (
                  <span style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                    <input type="number" min={0} step="0.01" placeholder="0.00" value={closeCash} onChange={e => setCloseCash(e.target.value)} style={{ width: 80, padding: "4px 6px", fontSize: 12, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-light)" }} />
                    <input type="text" placeholder={t("cash_sessions.notes")} value={closeNotes} onChange={e => setCloseNotes(e.target.value)} style={{ width: 100, padding: "4px 6px", fontSize: 12, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-light)" }} />
                    <button type="button" className="btn btn-sm btn-primary" disabled={closing || closeCash === ""} onClick={handleClose}>{closing ? "…" : t("cash_sessions.confirm")}</button>
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => { setCloseId(null); setCloseCash(""); setCloseNotes(""); }}>×</button>
                  </span>
                ) : (
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => setCloseId(s.id)}>{t("cash_sessions.close_action")}</button>
                ))}
                {s.discrepancy_notes && <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>{s.discrepancy_notes}</div>}
              </td>
            </tr>
            {detailId === s.id && <tr>
              <td colSpan={12} style={{ background: "var(--color-bg-muted)", padding: 16 }}>
                {detailLoading ? "…" : detail && <>
                  <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center", marginBottom: 12, fontSize: 12 }}>
                    <span>{t("cash_sessions.float")}: <b>{format(detail.report ? detail.report.opening_cash : detail.opening_cash)}</b></span>
                    <span>{t("cash_sessions.cash_sales")}: <b>{format(detail.report ? detail.report.sales_cash : detail.total_sales_cash)}</b></span>
                    <span>{t("cash_sessions.sales_card")}: <b>{format(detail.report ? detail.report.sales_card : detail.total_sales_card)}</b></span>
                    <span>{t("cash_sessions.sales_qr")}: <b>{format(detail.report ? detail.report.sales_qr : detail.total_sales_qr)}</b></span>
                    {detail.report && <span>{t("cash_sessions.cash_refunds")}: <b>{format(detail.report.cash_refunds)}</b></span>}
                    <span>{t("cash_sessions.expected")}: <b>{format(detail.report ? detail.report.expected_cash : (detail.expected_cash ?? 0))}</b></span>
                    {detail.report && <span className="badge badge-sm badge-yellow">{t("cash_sessions.live_report")}</span>}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>{t("cash_sessions.payments_title")} ({detail.payments.length})</div>
                  {detail.payments.length === 0
                    ? <div style={{ fontSize: 12, opacity: 0.6 }}>{t("cash_sessions.no_payments")}</div>
                    : <table className="data-table" style={{ background: "var(--color-bg-surface, #fff)" }}>
                        <thead><tr>
                          <th>{t("cash_sessions.col_time")}</th>
                          <th>{t("cash_sessions.col_order")}</th>
                          <th>{t("cash_sessions.col_provider")}</th>
                          <th>{t("cash_sessions.status")}</th>
                          <th style={{ textAlign: "right" }}>{t("cash_sessions.col_captured")}</th>
                          <th style={{ textAlign: "right" }}>{t("cash_sessions.col_refunded")}</th>
                        </tr></thead>
                        <tbody>{detail.payments.map(p => <tr key={p.id}>
                          <td style={{ fontSize: 12 }}>{formatLocalDateTime(p.created_at)}</td>
                          <td style={{ fontSize: 12 }}>{p.order_number}</td>
                          <td style={{ fontSize: 12 }}>{p.provider}</td>
                          <td>{sb(p.status)}</td>
                          <td style={{ textAlign: "right" }}>{format(p.captured_amount)}</td>
                          <td style={{ textAlign: "right" }}>{p.refunded_amount > 0 ? format(p.refunded_amount) : "—"}</td>
                        </tr>)}</tbody>
                      </table>}
                </>}
              </td>
            </tr>}
          </Fragment>)}
      </tbody>
    </table></div>
  </div>;
}
