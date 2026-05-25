"use client";

import { useEffect, useState, useMemo } from "react";
import { api } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import Alert from "@/components/Alert";
import EmptyState from "@/components/EmptyState";
import SkeletonCard from "@/components/SkeletonCard";
import Badge from "@/components/Badge";
import { Package, RefreshCw, X, Search } from "lucide-react";

interface InventoryItem {
  id: number;
  item_name: string;
  item_code: string;
  item_type: string;
  current_stock: number;
  unit_of_measure: string;
  reorder_level: number;
  par_level?: number;
  category_name?: string;
}

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [catFilter, setCatFilter] = useState("");

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editStock, setEditStock] = useState("");
  const [updateSubmitting, setUpdateSubmitting] = useState(false);

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

  useEffect(() => { load(); }, []);

  const categories = useMemo(() => {
    const seen = new Set<string>();
    const cats: { name: string }[] = [];
    items.forEach(i => {
      if (i.category_name && !seen.has(i.category_name)) {
        seen.add(i.category_name);
        cats.push({ name: i.category_name });
      }
    });
    return cats;
  }, [items]);

  const filtered = useMemo(() =>
    catFilter ? items.filter(i => i.category_name === catFilter) : items,
    [items, catFilter]
  );

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
    setUpdateSubmitting(true);
    setError("");
    setSuccess("");
    try {
      await api.post("/staff/inventory/update", { item_id: itemId, current_stock: newCount });
      setSuccess("Stock updated — movement logged");
      setEditingId(null);
      setEditStock("");
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUpdateSubmitting(false);
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <PageHeader
        title="Inventory"
        subtitle="Stock counts and adjustments"
        back
        action={
          <button type="button" onClick={load} className="btn btn-ghost btn-sm" aria-label="Refresh" style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <RefreshCw size={16} /> Refresh
          </button>
        }
      />
      {success && <Alert variant="success">{success}</Alert>}
      {error && <Alert variant="error">{error}</Alert>}

      {/* Category Filter */}
      <div style={{ marginBottom: 12, display: "flex", gap: 8, alignItems: "center" }}>
        <Search size={14} style={{ color: "var(--color-text-muted)" }} />
        <select
          value={catFilter}
          onChange={e => setCatFilter(e.target.value)}
          style={{ padding: "6px 12px", fontSize: 13, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-light)" }}
        >
          <option value="">All Categories ({items.length})</option>
          {categories.map(c => (
            <option key={c.name} value={c.name}>{c.name}</option>
          ))}
        </select>
        <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{filtered.length} items</span>
      </div>

      {loading ? (
        <SkeletonCard count={3} />
      ) : items.length === 0 ? (
        <EmptyState icon={<Package size={48} />} title="No inventory items" description="No inventory items registered for your store" />
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {filtered.map(item => (
            <div key={item.id} className="card" style={{ padding: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{item.item_name || "Unnamed Item"}</div>
                  <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                    {item.item_code}{item.category_name ? ` · ${item.category_name}` : ""}{item.item_type ? ` · ${item.item_type === "non_fnb" ? "Non-FnB" : "FnB"}` : ""}
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
                  <input type="number" value={editStock} onChange={e => setEditStock(e.target.value)} style={{ width: 100, padding: "4px 8px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-light)", fontSize: 13 }} />
                  <button type="button" onClick={() => handleUpdate(item.id)} disabled={updateSubmitting} className="btn btn-primary btn-sm">{updateSubmitting ? "..." : "Save"}</button>
                  <button type="button" onClick={cancelUpdate} className="btn btn-ghost btn-sm"><X size={14} /></button>
                </div>
              ) : (
                <div style={{ marginTop: 12 }}>
                  <button type="button" onClick={() => openUpdate(item)} className="btn btn-sm" style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
                    <Package size={14} /> Update Count
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
