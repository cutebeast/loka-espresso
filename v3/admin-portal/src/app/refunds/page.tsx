"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { api } from "@/lib/api";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { useCurrency } from "@/hooks/useCurrency";
interface Refund {
  id: number;
  payment_id: number;
  order_id: number;
  order_number?: string;
  store_id?: number;
  amount: number;
  reason: string;
  status: string;
  created_at: string;
}
interface Store {
  id: number;
  store_name: string;
}
export default function RefundsPage() {
  const {
    t
  } = useTranslation();
  const {
    format
  } = useCurrency();
  const [items, setItems] = useState<Refund[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState("");
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    api.get<Store[]>("/admin/stores?per_page=50").then(d => {
      if (mountedRef.current) setStores(Array.isArray(d) ? d : []);
    }).catch(e => {
      console.error('stores:', e);
    });
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const fetch = useCallback(() => {
    setLoading(true);
    const qs = new URLSearchParams({
      per_page: "100"
    });
    if (storeId) qs.set("store_id", storeId);
    api.get<any>(`/admin/refunds?${qs}`).then(d => setItems(Array.isArray(d) ? d : d.items || [])).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, [storeId]);
  useEffect(() => {
    fetch();
  }, [fetch]);
  const sb = (s: string) => {
    const m: Record<string, string> = {
      pending: "badge-yellow",
      completed: "badge-green",
      failed: "badge-red",
      cancelled: "badge-gray"
    };
    return <span className={`badge badge-sm ${m[s] || "badge-gray"}`}>{s}</span>;
  };
  return <div style={{
    padding: 32
  }}>
      <div className="page-header"><div style={{
        display: "flex",
        alignItems: "center",
        gap: 8
      }}><ArrowLeft size={18} style={{
          cursor: "pointer"
        }} /><h1 className="page-title">{t("refunds.refunds")}</h1></div><p className="page-subtitle">{items.length}{t("refunds.refunds_2")}</p></div>
      {error && <div className="alert alert-error">{error}</div>}
      <div style={{
      marginBottom: 12,
      display: "flex",
      gap: 12,
      alignItems: "center"
    }}>
        <select value={storeId} onChange={e => setStoreId(e.target.value)} style={{
        padding: "6px 12px",
        fontSize: 13,
        borderRadius: "var(--radius-sm)",
        border: "1px solid var(--color-border-light)"
      }}>
          <option value="">{t("admin.common.allStores")}</option>{stores.map(s => <option key={s.id} value={s.id}>{s.store_name}</option>)}
        </select>
        <span style={{
        fontSize: 12,
        opacity: 0.5
      }}>{items.length}{t("refunds.refunds_3")}</span>
      </div>
      <div className="table-container"><table className="data-table">
        <thead><tr><th>{t("refunds.order")}</th><th>{t("refunds.amount")}</th><th>{t("refunds.reason")}</th><th>{t("refunds.status")}</th><th>{t("refunds.date")}</th></tr></thead>
        <tbody>
          {loading ? <tr><td colSpan={5} className="data-table-empty">{t("refunds.loading")}</td></tr> : items.map(r => <tr key={r.id}>
              <td style={{
              fontWeight: 600
            }}>{r.order_number || `#${r.order_id}`}</td>
              <td style={{
              fontWeight: 600,
              color: "var(--color-error)"
            }}>{format(r.amount)}</td>
              <td style={{
              fontSize: 12
            }}>{r.reason || "—"}</td>
              <td>{sb(r.status)}</td>
              <td style={{
              fontSize: 12
            }}>{r.created_at?.slice(0, 10)}</td>
            </tr>)}
        </tbody>
      </table></div>
    </div>;
}