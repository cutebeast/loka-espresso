"use client";

import { useTranslation } from "@/lib/i18n";
import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Edit2 } from "lucide-react";
interface Store {
  id: number;
  store_name: string;
}
interface Category {
  id: number;
  category_name: string;
}
interface InventoryItem {
  id: number;
  item_name: string;
  item_code: string;
  item_type: string;
  unit_of_measure: string;
  category_id: number;
}
interface StockRecord {
  id: number;
  inventory_item_id: number;
  store_id: number;
  current_stock: number;
  reserved_stock: number;
  reorder_level: number;
  reorder_quantity: number;
  par_level: number;
  storage_location: string | null;
  item_name?: string;
  item_code?: string;
  item_type?: string;
}
export default function InventoryStocksPage() {
  const {
    t
  } = useTranslation();
  const router = useRouter();
  const [stores, setStores] = useState<Store[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [storeId, setStoreId] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [stocks, setStocks] = useState<StockRecord[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    api.getRaw<any>("/admin/stores?per_page=50").then(d => {
      const list = d.items || [];
      setStores(list);
    }).catch((e: any) => setError(e.message || "Failed to load stores"));
    api.getRaw<any>("/admin/inventory/categories?per_page=100").then(d => {
      setCategories(d.items || (Array.isArray(d) ? d : []));
    }).catch((e: unknown) => console.error("inventory stocks load:", e));
  }, []);
  useEffect(() => {
    api.getRaw<any>("/admin/inventory/items?per_page=500").then(d => {
      setItems(d.items || (Array.isArray(d) ? d : []));
    }).catch(e => console.error("Failed to load items:", e));
  }, []);
  const fetchStocks = useCallback(() => {
    if (!storeId) return;
    setLoading(true);
    api.getRaw<any>(`/admin/inventory/stocks?store_id=${storeId}&per_page=200`).then(d => {
      const raw = d.items || (Array.isArray(d) ? d : []);
      setStocks(raw);
    }).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, [storeId]);
  useEffect(() => {
    fetchStocks();
  }, [fetchStocks]);
  const itemMap = useMemo(() => {
    const m = new Map<number, InventoryItem>();
    items.forEach(i => m.set(i.id, i));
    return m;
  }, [items]);
  const mergedStocks = useMemo(() => {
    return stocks.map(s => {
      const item = itemMap.get(s.inventory_item_id);
      return {
        ...s,
        item_name: item?.item_name || `Item #${s.inventory_item_id}`,
        item_code: item?.item_code || "",
        item_type: item?.item_type || "",
        category_id: item?.category_id || 0
      };
    }).filter(s => !catFilter || s.category_id === Number(catFilter));
  }, [stocks, itemMap, catFilter]);
  const openEdit = (s: StockRecord) => {
    router.push(`/inventory/stocks/${s.id}`);
  };
  return <div style={{
    padding: 32
  }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t("inventory_stocks.inventory_stock_levels")}</h1>
          <p className="page-subtitle">{mergedStocks.length}{t("inventory_stocks.stock_records")}</p>
        </div>
      </div>
      {error && <div className="alert alert-error">{error}</div>}

      <div style={{
      marginBottom: 16,
      display: "flex",
      gap: 12,
      flexWrap: "wrap"
    }}>
        <select value={storeId} onChange={e => setStoreId(e.target.value)} style={{
        padding: "6px 12px",
        fontSize: 13,
        borderRadius: "var(--radius-sm)",
        border: "1px solid var(--color-border-light)"
      }}>
          <option value="">{t("inventory_stocks.please_select_a_store")}</option>
          {stores.map(s => <option key={s.id} value={s.id}>{s.store_name}</option>)}
        </select>
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)} style={{
        padding: "6px 12px",
        fontSize: 13,
        borderRadius: "var(--radius-sm)",
        border: "1px solid var(--color-border-light)"
      }}>
          <option value="">{t("inventory_stocks.all_categories")}</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.category_name}</option>)}
        </select>
      </div>

      {!storeId ? <div style={{
      textAlign: "center",
      padding: 60,
      color: "var(--color-text-muted)"
    }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{
        margin: "0 auto 12px",
        opacity: 0.4
      }}><rect x="4" y="2" width="16" height="20" rx="2" /><line x1="12" y1="18" x2="12.01" y2="18" strokeWidth="2" /></svg>
          <p style={{
        fontSize: 14
      }}>{t("inventory_stocks.please_select_a_store_to_view")}</p>
        </div> : <>
      <div className="table-header-bar"><span style={{
          fontSize: 13,
          fontWeight: 600
        }}>{t("inventory_stocks.stock_levels")}</span></div>
      <div className="table-container" style={{
        marginTop: 0
      }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>{t("inventory_stocks.item_name")}</th>
              <th>{t("inventory_stocks.code")}</th>
              <th>{t("inventory_stocks.type")}</th>
              <th style={{
                textAlign: "center"
              }}>{t("inventory_stocks.current_stock")}</th>
              <th style={{
                textAlign: "center"
              }}>{t("inventory_stocks.reserved")}</th>
              <th style={{
                textAlign: "center"
              }}>{t("inventory_stocks.reorder_level")}</th>
              <th style={{
                textAlign: "center"
              }}>{t("inventory_stocks.par_level")}</th>
              <th>{t("inventory_stocks.location")}</th>
              <th>{t("inventory_stocks.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={9} className="data-table-empty">{t("inventory_stocks.loading")}</td></tr> : mergedStocks.length === 0 ? <tr><td colSpan={9} className="data-table-empty">{t("inventory_stocks.no_stock_records_for_this_store")}</td></tr> : mergedStocks.map(s => <tr key={s.id}>
                <td>
                  <div style={{
                  fontWeight: 600
                }}>{s.item_name}</div>
                  {s.storage_location && <div style={{
                  fontSize: 11,
                  color: "var(--color-text-muted)"
                }}>{s.storage_location}</div>}
                </td>
                <td className="font-mono" style={{
                fontSize: 12
              }}>{s.item_code}</td>
                <td><span className={`badge badge-sm ${s.item_type === "fnb" ? "badge-green" : "badge-blue"}`}>{s.item_type === "fnb" ? "FnB" : "Non-FnB"}</span></td>
                <td style={{
                textAlign: "center",
                fontWeight: 600,
                color: s.current_stock <= (s.reorder_level || 0) ? "var(--color-error)" : "var(--color-text)"
              }}>{s.current_stock}</td>
                <td style={{
                textAlign: "center"
              }}>{s.reserved_stock || "—"}</td>
                <td style={{
                textAlign: "center",
                fontSize: 12
              }}>{s.reorder_level || "—"}</td>
                <td style={{
                textAlign: "center",
                fontSize: 12
              }}>{s.par_level || "—"}</td>
                <td style={{
                fontSize: 12
              }}>{s.storage_location || "—"}</td>
                <td>
                  <button type="button" onClick={() => openEdit(s)} className="btn btn-ghost btn-sm" style={{
                  color: "var(--color-info)"
                }}>
                    <Edit2 size={14} />
                  </button>
                </td>
              </tr>)}
          </tbody>
        </table>
      </div>
      </>}
    </div>;
}