"use client";

import { useTranslation } from "@/lib/i18n";
import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { useCurrency } from "@/hooks/useCurrency";
interface Store {
  id: number;
  store_name: string;
}
export default function InventoryMovementsPage() {
  const {
    t
  } = useTranslation();
  const {
    format
  } = useCurrency();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState("");
  const [movementType, setMovementType] = useState("");
  const [negativeOnly, setNegativeOnly] = useState(false);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const perPage = 100;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const fetchStores = async () => {
    try {
      const d = await api.getRaw<any>("/admin/stores?per_page=50");
      setStores(d.items || []);
      if (!storeId && d.items?.length) setStoreId(String(d.items[0].id));
    } catch (e: any) {console.error(e); setError(e.message || t("admin.errors.loadFailed")); }
  };
  const fetchData = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (movementType) params.set("movement_type", movementType);
      if (negativeOnly) params.set("negative_only", "true");
      if (fromDate) params.set("date_from", fromDate);
      if (toDate) params.set("date_to", toDate);
      if (storeId) params.set("store_id", storeId);
      params.set("page", String(page));
      params.set("per_page", String(perPage));
      const d = await api.getRaw<any>(`/admin/inventory/movements?${params}`);
      const list = d.items || d || [];
      setItems(Array.isArray(list) ? list : []);
      setTotal(d?.total || 0);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [movementType, fromDate, toDate, storeId, page, negativeOnly]);
  useEffect(() => {
    (async () => {
      await fetchStores();
    })();
  }, []);
  useEffect(() => {
    (async () => {
      await fetchData();
    })();
  }, [fetchData]);
  const typeBadge = (t: string) => {
    const m: Record<string, string> = {
      in: "badge-green",
      out: "badge-red",
      adjustment: "badge-blue",
      waste: "badge-orange"
    };
    return <span className={`badge badge-sm ${m[t] || "badge-gray"}`}>{t}</span>;
  };
  return <div style={{
    padding: 32
  }}>
      <div className="page-header"><div><h1 className="page-title">{t("inventory_movements.inventory_movements")}</h1><p className="page-subtitle">{items.length} {" "}{t("inventory_movements.movements")}</p></div></div>
      {error && <div className="alert alert-error">{error}</div>}

      <div style={{
      display: "flex",
      gap: 8,
      marginBottom: 16,
      flexWrap: "wrap",
      alignItems: "end"
    }}>
        <div><label style={{
          fontSize: 11,
          color: "var(--color-text-muted)",
          display: "block",
          marginBottom: 4
        }}>{t("inventory_movements.store")}</label>
          <select value={storeId} onChange={e => {
          setStoreId(e.target.value);
          setPage(1);
        }} style={{
          padding: "6px 12px",
          fontSize: 13,
          borderRadius: "var(--radius-sm)",
          border: "1px solid var(--color-border-light)"
        }}><option value="">{t("inventory_movements.all")}</option>{stores.map(s => <option key={s.id} value={s.id}>{s.store_name}</option>)}</select></div>
        <div><label style={{
          fontSize: 11,
          color: "var(--color-text-muted)",
          display: "block",
          marginBottom: 4
        }}>{t("inventory_movements.type")}</label>
          <select value={movementType} onChange={e => {
          setMovementType(e.target.value);
          setPage(1);
        }} style={{
          padding: "6px 12px",
          fontSize: 13,
          borderRadius: "var(--radius-sm)",
          border: "1px solid var(--color-border-light)"
        }}><option value="">{t("inventory_movements.all_2")}</option><option value="in">{t("inventory_movements.in")}</option><option value="out">{t("inventory_movements.out")}</option><option value="adjustment">{t("inventory_movements.adjustment")}</option><option value="waste">{t("inventory_movements.waste")}</option><option value="return">{t("inventory_movements.return", "Return")}</option><option value="transfer_in">{t("inventory_movements.transfer_in", "Transfer In")}</option><option value="transfer_out">{t("inventory_movements.transfer_out", "Transfer Out")}</option></select></div>
        <label style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        fontSize: 13,
        cursor: "pointer",
        padding: "6px 12px",
        borderRadius: "var(--radius-sm)",
        border: `1px solid ${negativeOnly ? "var(--color-error)" : "var(--color-border-light)"}`,
        background: negativeOnly ? "var(--color-error-soft, #FBF1F1)" : "transparent",
        color: negativeOnly ? "var(--color-error)" : "var(--color-text)",
        alignSelf: "flex-end",
        marginBottom: 2
      }}>
          <input type="checkbox" checked={negativeOnly} onChange={e => {
          setNegativeOnly(e.target.checked);
          setPage(1);
        }} />
          {t("inventory_movements.negative_impact_only", "Negative impact")}
        </label>
        <div><label style={{
          fontSize: 11,
          color: "var(--color-text-muted)",
          display: "block",
          marginBottom: 4
        }}>{t("inventory_movements.from")}</label><input type="date" value={fromDate} onChange={e => {
          setFromDate(e.target.value);
          setPage(1);
        }} style={{
          padding: "6px 10px",
          fontSize: 13,
          borderRadius: "var(--radius-sm)",
          border: "1px solid var(--color-border-light)"
        }} /></div>
        <div><label style={{
          fontSize: 11,
          color: "var(--color-text-muted)",
          display: "block",
          marginBottom: 4
        }}>{t("inventory_movements.to")}</label><input type="date" value={toDate} onChange={e => {
          setToDate(e.target.value);
          setPage(1);
        }} style={{
          padding: "6px 10px",
          fontSize: 13,
          borderRadius: "var(--radius-sm)",
          border: "1px solid var(--color-border-light)"
        }} /></div>
      </div>

      <div className="table-header-bar"><span className="text-sm font-semibold">{items.length} {" "}{t("inventory_movements.movements_2")}</span></div>
      <div className="table-container"><table className="data-table">
        <thead><tr><th>{t("inventory_movements.item")}</th><th>{t("inventory_movements.type_2")}</th><th style={{
              textAlign: "center"
            }}>{t("inventory_movements.qty")}</th><th style={{
              textAlign: "right"
            }}>{t("inventory_movements.unit_cost")}</th><th>{t("inventory_movements.reason")}</th><th>{t("inventory_movements.photos")}</th><th>{t("inventory_movements.date")}</th><th>{t("inventory_movements.by")}</th></tr></thead>
        <tbody>
          {loading ? <tr><td colSpan={8} className="data-table-empty">{t("inventory_movements.loading")}</td></tr> : items.length === 0 ? <tr><td colSpan={8} className="data-table-empty">{t("inventory_movements.no_movements_found")}</td></tr> : items.map(m => <tr key={m.id}>
              <td style={{
              fontWeight: 600
            }}>{m.item_name || `#${m.inventory_item_id}`}</td>
              <td>{typeBadge(m.movement_type)}</td>
              <td style={{
              textAlign: "center",
              fontWeight: 600,
              color: m.quantity_delta < 0 ? "var(--color-error)" : "var(--color-success)"
            }}>{m.quantity_delta > 0 ? `+${m.quantity_delta}` : m.quantity_delta}</td>
              <td style={{
              textAlign: "right"
            }}>{m.unit_cost_at_movement != null ? format(m.unit_cost_at_movement) : "—"}</td>
              <td style={{
              fontSize: 12,
              maxWidth: 200,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap"
            }}>{m.reason || "—"}</td>
              <td>{Array.isArray(m.image_urls) && m.image_urls.length > 0 ? <div style={{
              display: "flex",
              gap: 4
            }}>
                    {m.image_urls.map((u: string, i: number) => <a key={i} href={u} target="_blank" rel="noopener noreferrer">
                        {/* plain img: /uploads paths are served by the backend, not next/image */}
                        <img src={u} alt="" style={{
                  width: 36,
                  height: 36,
                  objectFit: "cover",
                  borderRadius: 6,
                  border: "1px solid var(--color-border-light)"
                }} />
                      </a>)}
                  </div> : "—"}</td>
              <td style={{
              fontSize: 12
            }}>{m.created_at ? new Date(m.created_at).toLocaleDateString() : "—"}</td>
              <td style={{
              fontSize: 12
            }}>{m.performed_by_name || "—"}</td>
            </tr>)}
        </tbody>
      </table></div>

      {totalPages > 1 && <div style={{
      display: "flex",
      justifyContent: "center",
      gap: 8,
      marginTop: 16
    }}>
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="btn btn-outline btn-sm">{t("inventory_movements.prev", "Prev")}</button>
          <span style={{
        fontSize: 13,
        padding: "4px 8px",
        display: "flex",
        alignItems: "center"
      }}>{t("common.page_of", { page, total: totalPages })}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="btn btn-outline btn-sm">{t("inventory_movements.next", "Next")}</button>
        </div>}
    </div>;
}