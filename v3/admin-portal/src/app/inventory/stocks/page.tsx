"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import { api } from "@/lib/api";
import { Edit2 } from "lucide-react";

interface Store { id: number; store_name: string; }
interface Category { id: number; category_name: string; }
interface InventoryItem { id: number; item_name: string; item_code: string; item_type: string; unit_of_measure: string; category_id: number; }
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
  const [stores, setStores] = useState<Store[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [storeId, setStoreId] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [stocks, setStocks] = useState<StockRecord[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editModal, setEditModal] = useState<StockRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState({ current_stock: 0, reserved_stock: 0, reorder_level: 0, reorder_quantity: 0, par_level: 0, storage_location: "" });

  useEffect(() => {
    api.getRaw<any>("/admin/stores?per_page=50").then(d => {
      const list = d.items || [];
      setStores(list);
      if (list.length > 0) setStoreId(String(list[0].id));
    }).catch((e: any) => setError(e.message || "Failed to load stores"));
    api.getRaw<any>("/admin/inventory/categories?per_page=100").then(d => {
      setCategories(d.items || (Array.isArray(d) ? d : []));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    api.getRaw<any>("/admin/inventory/items?per_page=500").then(d => {
      setItems(d.items || (Array.isArray(d) ? d : []));
    }).catch((e) => console.error("Failed to load items:", e));
  }, []);

  const fetchStocks = useCallback(() => {
    if (!storeId) return;
    setLoading(true);
    api.getRaw<any>(`/admin/inventory/stocks?store_id=${storeId}&per_page=200`)
      .then(d => {
        const raw = d.items || (Array.isArray(d) ? d : []);
        setStocks(raw);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [storeId]);

  useEffect(() => { fetchStocks(); }, [fetchStocks]);

  const itemMap = useMemo(() => {
    const m = new Map<number, InventoryItem>();
    items.forEach(i => m.set(i.id, i));
    return m;
  }, [items]);

  const mergedStocks = useMemo(() => {
    return stocks
      .map(s => {
        const item = itemMap.get(s.inventory_item_id);
        return {
          ...s,
          item_name: item?.item_name || `Item #${s.inventory_item_id}`,
          item_code: item?.item_code || "",
          item_type: item?.item_type || "",
          category_id: item?.category_id || 0,
        };
      })
      .filter(s => !catFilter || s.category_id === Number(catFilter));
  }, [stocks, itemMap, catFilter]);

  const openEdit = (s: StockRecord) => {
    setEditModal(s);
    setEditForm({
      current_stock: s.current_stock,
      reserved_stock: s.reserved_stock,
      reorder_level: s.reorder_level,
      reorder_quantity: s.reorder_quantity,
      par_level: s.par_level,
      storage_location: s.storage_location || "",
    });
  };

  const saveEdit = async () => {
    if (!editModal) return;
    setSaving(true);
    try {
      await api.patch(`/admin/inventory/stocks/${editModal.id}`, {
        current_stock: Number(editForm.current_stock),
        reserved_stock: Number(editForm.reserved_stock),
        reorder_level: Number(editForm.reorder_level),
        reorder_quantity: Number(editForm.reorder_quantity),
        par_level: Number(editForm.par_level),
        storage_location: editForm.storage_location || null,
      });
      setEditModal(null);
      fetchStocks();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: 32 }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Inventory Stock Levels</h1>
          <p className="page-subtitle">{mergedStocks.length} stock records</p>
        </div>
      </div>
      {error && <div className="alert alert-error">{error}</div>}

      <div style={{ marginBottom: 16, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <select
          value={storeId}
          onChange={e => setStoreId(e.target.value)}
          style={{ padding: "6px 12px", fontSize: 13, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-light)" }}
        >
          {stores.map(s => (
            <option key={s.id} value={s.id}>{s.store_name}</option>
          ))}
        </select>
        <select
          value={catFilter}
          onChange={e => setCatFilter(e.target.value)}
          style={{ padding: "6px 12px", fontSize: 13, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-light)" }}
        >
          <option value="">All Categories</option>
          {categories.map(c => (
            <option key={c.id} value={c.id}>{c.category_name}</option>
          ))}
        </select>
      </div>

      <div className="table-container" style={{ marginTop: 16 }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Item Name</th>
              <th>Code</th>
              <th>Type</th>
              <th style={{textAlign:"center"}}>Current Stock</th>
              <th style={{textAlign:"center"}}>Reserved</th>
              <th style={{textAlign:"center"}}>Reorder Level</th>
              <th style={{textAlign:"center"}}>Par Level</th>
              <th>Location</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="data-table-empty">Loading...</td></tr>
            ) : mergedStocks.length === 0 ? (
              <tr><td colSpan={9} className="data-table-empty">No stock records for this store.</td></tr>
            ) : mergedStocks.map(s => (
              <tr key={s.id}>
                <td>
                  <div style={{ fontWeight: 600 }}>{s.item_name}</div>
                  {s.storage_location && <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{s.storage_location}</div>}
                </td>
                <td className="font-mono" style={{ fontSize: 12 }}>{s.item_code}</td>
                <td><span className={`badge badge-sm ${s.item_type === "fnb" ? "badge-green" : "badge-blue"}`}>{s.item_type === "fnb" ? "FnB" : "Non-FnB"}</span></td>
                <td style={{ textAlign: "center", fontWeight: 600, color: s.current_stock <= (s.reorder_level || 0) ? "var(--color-error)" : "var(--color-text)" }}>{s.current_stock}</td>
                <td style={{ textAlign: "center" }}>{s.reserved_stock || "—"}</td>
                <td style={{ textAlign: "center", fontSize: 12 }}>{s.reorder_level || "—"}</td>
                <td style={{ textAlign: "center", fontSize: 12 }}>{s.par_level || "—"}</td>
                <td style={{ fontSize: 12 }}>{s.storage_location || "—"}</td>
                <td>
                  <button type="button" onClick={() => openEdit(s)} className="btn btn-ghost btn-sm" style={{ color: "var(--color-info)" }}>
                    <Edit2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setEditModal(null)}>
          <div style={{ background: "var(--color-bg)", borderRadius: "var(--radius-md)", padding: 24, minWidth: 360, maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 8px" }}>Edit Stock — {editModal.item_name}</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div><label style={{ fontSize: 12, fontWeight: 600 }}>Current Stock</label><input type="number" step="0.01" value={editForm.current_stock} onChange={e => setEditForm(f => ({ ...f, current_stock: Number(e.target.value) }))} style={{ width: "100%", padding: "6px 10px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-light)" }} /></div>
              <div><label style={{ fontSize: 12, fontWeight: 600 }}>Reserved Stock</label><input type="number" step="0.01" value={editForm.reserved_stock} onChange={e => setEditForm(f => ({ ...f, reserved_stock: Number(e.target.value) }))} style={{ width: "100%", padding: "6px 10px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-light)" }} /></div>
              <div><label style={{ fontSize: 12, fontWeight: 600 }}>Reorder Level</label><input type="number" step="0.01" value={editForm.reorder_level} onChange={e => setEditForm(f => ({ ...f, reorder_level: Number(e.target.value) }))} style={{ width: "100%", padding: "6px 10px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-light)" }} /></div>
              <div><label style={{ fontSize: 12, fontWeight: 600 }}>Reorder Quantity</label><input type="number" step="0.01" value={editForm.reorder_quantity} onChange={e => setEditForm(f => ({ ...f, reorder_quantity: Number(e.target.value) }))} style={{ width: "100%", padding: "6px 10px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-light)" }} /></div>
              <div><label style={{ fontSize: 12, fontWeight: 600 }}>Par Level</label><input type="number" step="0.01" value={editForm.par_level} onChange={e => setEditForm(f => ({ ...f, par_level: Number(e.target.value) }))} style={{ width: "100%", padding: "6px 10px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-light)" }} /></div>
              <div><label style={{ fontSize: 12, fontWeight: 600 }}>Storage Location</label><input value={editForm.storage_location} onChange={e => setEditForm(f => ({ ...f, storage_location: e.target.value }))} style={{ width: "100%", padding: "6px 10px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-light)" }} /></div>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
              <button type="button" onClick={() => setEditModal(null)} className="btn btn-ghost btn-sm">Cancel</button>
              <button type="button" onClick={saveEdit} disabled={saving} className="btn btn-primary btn-sm">{saving ? "Saving..." : "Save"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
