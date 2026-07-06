"use client";

import { useEffect, useState, useCallback } from "react";
import { api, getPurchaseOrders, createPurchaseOrder, receivePurchaseOrder, cancelPurchaseOrder, type PurchaseOrder } from "@/lib/api";
import { Plus, Trash2, CheckCircle, XCircle } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { useCurrency } from "@/hooks/useCurrency";
interface Supplier {
  id: number;
  supplier_name: string;
}
interface InvItem {
  id: number;
  item_name: string;
  unit_of_measure: string;
}
interface Store {
  id: number;
  store_name: string;
}
export default function PurchaseOrdersPage() {
  const {
    t
  } = useTranslation();
  const {
    format
  } = useCurrency();
  const [items, setItems] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [invItems, setInvItems] = useState<InvItem[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState("");
  const [form, setForm] = useState({
    supplier_id: "",
    store_id: "",
    expected_delivery: "",
    lines: [{
      inventory_item_id: "",
      quantity_ordered: "",
      unit_cost: ""
    }] as {
      inventory_item_id: string;
      quantity_ordered: string;
      unit_cost: string;
    }[]
  });
  const fetchData = useCallback(() => {
    setLoading(true);
    getPurchaseOrders({
      status: statusFilter || undefined,
      store_id: storeId || undefined
    }).then(d => setItems(d)).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, [statusFilter, storeId]);
  useEffect(() => {
    (async () => {
      fetchData();
    })();
  }, [fetchData]);
  useEffect(() => {
    (async () => {
      try {
        const d = await api.getRaw<any>("/admin/inventory/suppliers");
        setSuppliers(Array.isArray(d) ? d : d.items || []);
      } catch (e) {
        console.error(e);
      }
      try {
        const d = await api.getRaw<any>("/admin/stores?per_page=50");
        setStores(d.items || []);
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);
  const loadItems = async (sid: string) => {
    setStoreId(sid);
    setForm(f => ({
      ...f,
      store_id: sid
    }));
    if (!sid) return;
    try {
      const d = await api.getRaw<any>(`/admin/inventory/items?store_id=${sid}&per_page=100`);
      setInvItems(Array.isArray(d) ? d : d.items || []);
    } catch (e) {
      console.error(e);
    }
  };
  const resetForm = () => {
    setForm({
      supplier_id: "",
      store_id: storeId,
      expected_delivery: "",
      lines: [{
        inventory_item_id: "",
        quantity_ordered: "",
        unit_cost: ""
      }]
    });
    setShowForm(false);
  };
  const addLineItem = () => setForm({
    ...form,
    lines: [...form.lines, {
      inventory_item_id: "",
      quantity_ordered: "",
      unit_cost: ""
    }]
  });
  const updateLine = (i: number, p: {
    inventory_item_id?: string;
    quantity_ordered?: string;
    unit_cost?: string;
  }) => {
    const lns = [...form.lines];
    const cur = lns[i];
    if (!cur) return;
    lns[i] = {
      inventory_item_id: p.inventory_item_id ?? cur.inventory_item_id,
      quantity_ordered: p.quantity_ordered ?? cur.quantity_ordered,
      unit_cost: p.unit_cost ?? cur.unit_cost
    };
    setForm({
      ...form,
      lines: lns
    });
  };
  const removeLine = (i: number) => {
    if (form.lines.length <= 1) return;
    setForm({
      ...form,
      lines: form.lines.filter((_, j) => j !== i)
    });
  };
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const pl = {
        supplier_id: Number(form.supplier_id),
        store_id: Number(form.store_id),
        expected_delivery: form.expected_delivery || new Date().toISOString().slice(0, 10),
        po_number: `PO-${Date.now()}`,
        lines: form.lines.map(i => ({
          inventory_item_id: Number(i.inventory_item_id),
          quantity_ordered: Number(i.quantity_ordered),
          unit_cost: Number(i.unit_cost)
        }))
      };
      await createPurchaseOrder(pl);
      resetForm();
      fetchData();
    } catch (err: any) {
      setError(err.message);
    }
  };
  const handleReceive = async (id: number) => {
    if (!confirm("Confirm receipt of this PO?")) return;
    try {
      await receivePurchaseOrder(id);
      fetchData();
    } catch (e) {
      console.error(e);
    }
    ;
  };
  const handleCancel = async (id: number) => {
    if (!confirm("Cancel this PO?")) return;
    try {
      await cancelPurchaseOrder(id);
      fetchData();
    } catch (e) {
      console.error(e);
    }
    ;
  };
  const sb = (s: string) => {
    const m: Record<string, string> = {
      draft: "badge-yellow",
      submitted: "badge-blue",
      ordered: "badge-blue",
      partially_received: "badge-orange",
      received: "badge-green",
      cancelled: "badge-red"
    };
    return <span className={`badge badge-sm ${m[s] || "badge-gray"}`}>{s?.replace(/_/g, " ")}</span>;
  };
  return <div style={{
    padding: 32
  }}>
      <div className="page-header">
        <div><h1 className="page-title">{t("inventory_purchase-orders.purchase_orders")}</h1><p className="page-subtitle">{items.length}{t("inventory_purchase-orders.pos")}</p></div>
        <button onClick={() => {
        setShowForm(true);
        loadItems(storeId);
      }} className="btn btn-primary btn-sm"><Plus size={16} />{t("inventory_purchase-orders.new_po")}</button>
      </div>
      {error && <div className="alert alert-error">{error}</div>}

      <div style={{
      marginBottom: 16,
      display: "flex",
      gap: 8,
      flexWrap: "wrap",
      alignItems: "end"
    }}>
        <div><label style={{
          fontSize: 11,
          fontWeight: 600,
          color: "var(--color-text-muted)",
          display: "block",
          marginBottom: 4
        }}>{t("inventory_purchase-orders.store")}</label>
          <select value={storeId} onChange={e => setStoreId(e.target.value)} style={{
          padding: "6px 12px",
          fontSize: 13,
          borderRadius: "var(--radius-sm)",
          border: "1px solid var(--color-border-light)"
        }}><option value="">{t("admin.common.allStores")}</option>{stores.map(s => <option key={s.id} value={s.id}>{s.store_name}</option>)}</select></div>
        <div><label style={{
          fontSize: 11,
          fontWeight: 600,
          color: "var(--color-text-muted)",
          display: "block",
          marginBottom: 4
        }}>{t("inventory_purchase-orders.status")}</label>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{
          padding: "6px 12px",
          fontSize: 13,
          borderRadius: "var(--radius-sm)",
          border: "1px solid var(--color-border-light)"
        }}><option value="">{t("inventory_purchase-orders.all_status")}</option><option value="draft">{t("inventory_purchase-orders.draft")}</option><option value="submitted">{t("inventory_purchase-orders.submitted")}</option><option value="ordered">{t("inventory_purchase-orders.ordered")}</option><option value="partially_received">{t("inventory_purchase-orders.partially_received")}</option><option value="received">{t("inventory_purchase-orders.received")}</option><option value="cancelled">{t("inventory_purchase-orders.cancelled")}</option></select></div>
      </div>

      {showForm && <><div className="drawer-overlay" onClick={resetForm} /><div className="drawer" style={{
        width: 640
      }}>
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 20
        }}><h3 style={{
            margin: 0
          }}>{t("inventory_purchase-orders.new_purchase_order")}</h3><button onClick={resetForm} className="btn btn-ghost btn-sm">✕</button></div>
        <form onSubmit={handleSubmit}>
          <div className="df-grid">
            <div className="df-field"><label className="df-label">{t("inventory_purchase-orders.store_2")}</label><select value={storeId} onChange={e => loadItems(e.target.value)} style={{
                width: "100%"
              }}><option value="">{t("inventory_purchase-orders.select")}</option>{stores.map(s => <option key={s.id} value={s.id}>{s.store_name}</option>)}</select></div>
            <div className="df-field"><label className="df-label">{t("inventory_purchase-orders.supplier")}</label><select value={form.supplier_id} onChange={e => setForm({
                ...form,
                supplier_id: e.target.value
              })} style={{
                width: "100%"
              }} required><option value="">{t("inventory_purchase-orders.select_2")}</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.supplier_name}</option>)}</select></div>
            <div className="df-field"><label className="df-label">{t("inventory_purchase-orders.expected_delivery")}</label><input type="date" value={form.expected_delivery} onChange={e => setForm({
                ...form,
                expected_delivery: e.target.value
              })} /></div>
          </div>
          <div style={{
            marginTop: 16
          }}>
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8
            }}>
              <h4 style={{
                margin: 0,
                fontSize: 13
              }}>{t("inventory_purchase-orders.line_items")}</h4>
              <button type="button" onClick={addLineItem} className="btn btn-sm btn-outline"><Plus size={12} />{t("inventory_purchase-orders.add_item")}</button>
            </div>
            {form.lines.map((li, i) => <div key={i} style={{
              display: "flex",
              gap: 6,
              marginBottom: 6,
              alignItems: "center"
            }}>
                <select value={li.inventory_item_id} onChange={e => updateLine(i, {
                inventory_item_id: e.target.value
              })} style={{
                flex: 2,
                padding: "6px",
                fontSize: 12,
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--color-border-light)"
              }} required><option value="">{t("inventory_purchase-orders.item")}</option>{invItems.map(iv => <option key={iv.id} value={iv.id}>{iv.item_name} ({iv.unit_of_measure})</option>)}</select>
                <input type="number" value={li.quantity_ordered} onChange={e => updateLine(i, {
                quantity_ordered: e.target.value
              })} placeholder={t("inventory_purchase-orders.qty")} style={{
                width: 70,
                padding: "6px 8px",
                fontSize: 12
              }} required />
                <input type="number" step="0.01" value={li.unit_cost} onChange={e => updateLine(i, {
                unit_cost: e.target.value
              })} placeholder={t("inventory_purchase-orders.cost")} style={{
                width: 90,
                padding: "6px 8px",
                fontSize: 12
              }} />
                <button type="button" onClick={() => removeLine(i)} className="btn btn-ghost btn-sm" style={{
                color: "var(--color-error)"
              }}><Trash2 size={14} /></button>
              </div>)}
          </div>
          <div className="df-actions" style={{
            marginTop: 16
          }}>
            <button type="button" onClick={resetForm} className="btn btn-ghost">{t("inventory_purchase-orders.cancel")}</button>
            <button type="submit" className="btn btn-primary">{t("inventory_purchase-orders.create_po")}</button>
          </div>
        </form>
      </div></>}

      <div className="table-header-bar"><span className="text-sm font-semibold">{items.length}{t("inventory_purchase-orders.pos_2")}</span></div>
      <div className="table-container"><table className="data-table">
        <thead><tr><th>{t("inventory_purchase-orders.id")}</th><th>{t("inventory_purchase-orders.supplier_2")}</th><th>{t("inventory_purchase-orders.status_2")}</th><th>{t("inventory_purchase-orders.items")}</th><th style={{
              textAlign: "right"
            }}>{t("inventory_purchase-orders.total")}</th><th>{t("inventory_purchase-orders.delivery")}</th><th style={{
              width: 120
            }}>{t("inventory_purchase-orders.actions")}</th></tr></thead>
        <tbody>
          {loading ? <tr><td colSpan={7} className="data-table-empty">{t("inventory_purchase-orders.loading")}</td></tr> : items.map(po => <tr key={po.id}>
              <td className="font-mono" style={{
              fontSize: 11
            }}>{t("inventory_purchase-orders.po")}{po.id}</td>
              <td style={{
              fontWeight: 600
            }}>{po.supplier_name || `#${po.supplier_id}`}</td>
              <td>{sb(po.status)}</td>
              <td style={{
              fontSize: 12
            }}>{po.items_count || (po.items || []).length}{t("inventory_purchase-orders.lines")}</td>
              <td style={{
              textAlign: "right",
              fontWeight: 600
            }}>{format(po.total_amount)}</td>
              <td style={{
              fontSize: 12
            }}>{po.expected_delivery?.slice(0, 10) || "—"}</td>
              <td>
                <div style={{
                display: "flex",
                gap: 4
              }}>
                  {(["draft", "submitted", "ordered", "partially_received"] as string[]).includes(po.status) && <button onClick={() => handleReceive(po.id)} className="btn btn-ghost btn-sm" title={t("inventory_purchase-orders.receive")} style={{
                  color: "var(--color-success)"
                }}><CheckCircle size={14} /></button>}
                  {(["draft", "submitted"] as string[]).includes(po.status) && <button onClick={() => handleCancel(po.id)} className="btn btn-ghost btn-sm" title={t("inventory_purchase-orders.cancel_2")} style={{
                  color: "var(--color-error)"
                }}><XCircle size={14} /></button>}
                </div>
              </td>
            </tr>)}
        </tbody>
      </table></div>
    </div>;
}