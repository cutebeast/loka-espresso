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
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const fetchStores = async () => {
    try {
      const d = await api.getRaw<any>("/admin/stores?per_page=50");
      setStores(d.items || []);
      if (!storeId && d.items?.length) setStoreId(String(d.items[0].id));
    } catch (e) {
      console.error(e);
    }
  };
  const fetchData = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (movementType) params.set("movement_type", movementType);
      if (fromDate) params.set("date_from", fromDate);
      if (toDate) params.set("date_to", toDate);
      if (storeId) params.set("store_id", storeId);
      const d = await api.getRaw<any>(`/admin/inventory/movements?${params}`);
      const list = d.items || d || [];
      setItems(Array.isArray(list) ? list : []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [movementType, fromDate, toDate, storeId]);
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
      <div className="page-header"><div><h1 className="page-title">{t("inventory_movements.inventory_movements")}</h1><p className="page-subtitle">{items.length}{t("inventory_movements.movements")}</p></div></div>
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
          <select value={storeId} onChange={e => setStoreId(e.target.value)} style={{
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
          <select value={movementType} onChange={e => setMovementType(e.target.value)} style={{
          padding: "6px 12px",
          fontSize: 13,
          borderRadius: "var(--radius-sm)",
          border: "1px solid var(--color-border-light)"
        }}><option value="">{t("inventory_movements.all_2")}</option><option value="in">{t("inventory_movements.in")}</option><option value="out">{t("inventory_movements.out")}</option><option value="adjustment">{t("inventory_movements.adjustment")}</option><option value="waste">{t("inventory_movements.waste")}</option></select></div>
        <div><label style={{
          fontSize: 11,
          color: "var(--color-text-muted)",
          display: "block",
          marginBottom: 4
        }}>{t("inventory_movements.from")}</label><input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} style={{
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
        }}>{t("inventory_movements.to")}</label><input type="date" value={toDate} onChange={e => setToDate(e.target.value)} style={{
          padding: "6px 10px",
          fontSize: 13,
          borderRadius: "var(--radius-sm)",
          border: "1px solid var(--color-border-light)"
        }} /></div>
      </div>

      <div className="table-header-bar"><span className="text-sm font-semibold">{items.length}{t("inventory_movements.movements_2")}</span></div>
      <div className="table-container"><table className="data-table">
        <thead><tr><th>{t("inventory_movements.item")}</th><th>{t("inventory_movements.type_2")}</th><th style={{
              textAlign: "center"
            }}>{t("inventory_movements.qty")}</th><th style={{
              textAlign: "right"
            }}>{t("inventory_movements.unit_cost")}</th><th>{t("inventory_movements.reason")}</th><th>{t("inventory_movements.date")}</th><th>{t("inventory_movements.by")}</th></tr></thead>
        <tbody>
          {loading ? <tr><td colSpan={7} className="data-table-empty">{t("inventory_movements.loading")}</td></tr> : items.length === 0 ? <tr><td colSpan={7} className="data-table-empty">{t("inventory_movements.no_movements_found")}</td></tr> : items.map(m => <tr key={m.id}>
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
              <td style={{
              fontSize: 12
            }}>{m.created_at ? new Date(m.created_at).toLocaleDateString() : "—"}</td>
              <td style={{
              fontSize: 12
            }}>{m.performed_by_name || "—"}</td>
            </tr>)}
        </tbody>
      </table></div>
    </div>;
}