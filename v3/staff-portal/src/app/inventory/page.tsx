"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import Alert from "@/components/Alert";
import EmptyState from "@/components/EmptyState";
import SkeletonCard from "@/components/SkeletonCard";
import Badge from "@/components/Badge";
import { Package, RefreshCw, X, AlertTriangle } from "lucide-react";

interface InventoryItem {
  id: number;
  item_name: string;
  item_code: string;
  item_type: string;
  current_stock: number;
  unit_of_measure: string;
  reorder_level: number;
  par_level?: number;
}

interface MenuItem {
  id: number;
  item_name: string;
}

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editStock, setEditStock] = useState("");

  const [wasteOpen, setWasteOpen] = useState(false);
  const [wasteForm, setWasteForm] = useState({ inventory_item_id: "", menu_item_id: "", quantity: 0, reason: "" });
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api.getRaw<any>("/staff/inventory");
      setItems(Array.isArray(data) ? data : (data?.items || []));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    api.getRaw<any>("/admin/menu/items?per_page=500")
      .then(d => setMenuItems(Array.isArray(d) ? d : (d?.items || [])))
      .catch(() => {});
  }, []);

  const openUpdate = (item: InventoryItem) => {
    setEditingId(item.id);
    setEditStock(String(item.current_stock));
    setError("");
    setSuccess("");
  };

  const cancelUpdate = () => {
    setEditingId(null);
    setEditStock("");
  };

  const handleUpdate = async (itemId: number) => {
    const newCount = Number(editStock);
    if (isNaN(newCount) || newCount < 0) {
      setError("Please enter a valid stock count");
      return;
    }
    setSubmitting(true);
    setError("");
    setSuccess("");
    try {
      await api.post("/staff/inventory/update", { item_id: itemId, new_count: newCount });
      setSuccess("Stock updated");
      setEditingId(null);
      setEditStock("");
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const openWaste = (item?: InventoryItem) => {
    setWasteForm({ inventory_item_id: item ? String(item.id) : "", menu_item_id: "", quantity: 0, reason: "" });
    setWasteOpen(true);
    setError("");
    setSuccess("");
  };

  const handleWaste = async () => {
    if (!wasteForm.inventory_item_id && !wasteForm.menu_item_id) {
      setError("Select an inventory item or menu item");
      return;
    }
    if (wasteForm.quantity <= 0) {
      setError("Quantity must be greater than 0");
      return;
    }
    if (wasteForm.reason.trim().length < 3) {
      setError("Please provide a reason (min 3 characters)");
      return;
    }
    setSubmitting(true);
    setError("");
    setSuccess("");
    try {
      const body: Record<string, unknown> = {
        quantity: wasteForm.quantity,
        reason: wasteForm.reason.trim(),
      };
      if (wasteForm.inventory_item_id) body.inventory_item_id = Number(wasteForm.inventory_item_id);
      if (wasteForm.menu_item_id) body.menu_item_id = Number(wasteForm.menu_item_id);
      await api.post("/staff/inventory/waste", body);
      setSuccess("Waste reported successfully");
      setWasteOpen(false);
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <PageHeader
        title="Inventory"
        subtitle="Stock counts and waste reporting"
        back
        action={
          <button type="button" onClick={load} className="btn btn-ghost btn-sm" aria-label="Refresh" style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <RefreshCw size={16} /> Refresh
          </button>
        }
      />
      {success && <Alert variant="success">{success}</Alert>}
      {error && <Alert variant="error">{error}</Alert>}

      <div style={{ marginBottom: 16, display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={() => openWaste()}
          className="btn btn-sm"
          style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--color-error)", color: "#fff", border: "none" }}
        >
          <AlertTriangle size={14} /> Report Waste
        </button>
      </div>

      {wasteOpen && (
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Report Waste</h3>
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Inventory Item</label>
              <select
                value={wasteForm.inventory_item_id}
                onChange={e => setWasteForm({ ...wasteForm, inventory_item_id: e.target.value })}
                style={{ width: "100%", padding: "6px 10px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-light)" }}
              >
                <option value="">— Select —</option>
                {items.map(i => <option key={i.id} value={i.id}>{i.item_name} ({i.item_code})</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Menu Item (FnB)</label>
              <select
                value={wasteForm.menu_item_id}
                onChange={e => setWasteForm({ ...wasteForm, menu_item_id: e.target.value })}
                style={{ width: "100%", padding: "6px 10px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-light)" }}
              >
                <option value="">— Select —</option>
                {menuItems.map(m => <option key={m.id} value={m.id}>{m.item_name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Quantity *</label>
              <input
                type="number"
                min={1}
                value={wasteForm.quantity || ""}
                onChange={e => setWasteForm({ ...wasteForm, quantity: Number(e.target.value) })}
                style={{ width: "100%", padding: "6px 10px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-light)" }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Reason *</label>
              <textarea
                value={wasteForm.reason}
                onChange={e => setWasteForm({ ...wasteForm, reason: e.target.value })}
                placeholder="e.g. expired, damaged, spillage..."
                rows={3}
                style={{ width: "100%", padding: "6px 10px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-light)", resize: "vertical" }}
              />
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setWasteOpen(false)} className="btn btn-ghost btn-sm">Cancel</button>
              <button
                type="button"
                onClick={handleWaste}
                disabled={submitting}
                className="btn btn-sm"
                style={{ display: "flex", alignItems: "center", gap: 4, background: "var(--color-error)", color: "#fff", border: "none" }}
              >
                {submitting ? "Submitting..." : "Submit Report"}
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <SkeletonCard count={3} />
      ) : items.length === 0 ? (
        <EmptyState icon={<Package size={48} />} title="No inventory items" description="No inventory items registered for your store" />
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {items.map(item => (
            <div key={item.id} className="card" style={{ padding: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{item.item_name || "Unnamed Item"}</div>
                  <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                    {item.item_code}{item.item_type ? ` · ${item.item_type === "non_fnb" ? "Non-FnB" : "FnB"}` : ""}
                  </div>
                </div>
                <Badge variant={item.item_type === "non_fnb" ? "purple" : "blue"}>{item.item_type === "non_fnb" ? "Non-FnB" : "FnB"}</Badge>
              </div>
              <div style={{ display: "flex", gap: 24, marginTop: 12, fontSize: 13 }}>
                <div>
                  <span style={{ color: "var(--color-text-muted)" }}>Stock: </span>
                  <span style={{ fontWeight: 700, color: item.current_stock <= (item.reorder_level || 0) ? "var(--color-error)" : "var(--color-success)" }}>
                    {item.current_stock}
                  </span>
                </div>
                <div><span style={{ color: "var(--color-text-muted)" }}>Unit: </span>{item.unit_of_measure}</div>
                <div><span style={{ color: "var(--color-text-muted)" }}>Par: </span>{item.par_level ?? item.reorder_level ?? "—"}</div>
              </div>

              {editingId === item.id ? (
                <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="number"
                    value={editStock}
                    onChange={e => setEditStock(e.target.value)}
                    style={{ width: 100, padding: "4px 8px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-light)", fontSize: 13 }}
                  />
                  <button
                    type="button"
                    onClick={() => handleUpdate(item.id)}
                    disabled={submitting}
                    className="btn btn-primary btn-sm"
                  >
                    {submitting ? "..." : "Save"}
                  </button>
                  <button type="button" onClick={cancelUpdate} className="btn btn-ghost btn-sm">
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                  {item.item_type === "non_fnb" && (
                    <button type="button" onClick={() => openUpdate(item)} className="btn btn-sm" style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
                      <Package size={14} /> Update Count
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => openWaste(item)}
                    className="btn btn-sm"
                    style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--color-error)" }}
                  >
                    <AlertTriangle size={14} /> Report Waste
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
