"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Plus, Edit2, Trash2 } from "lucide-react";

interface Equipment {
  id: number;
  name: string;
  equipment_type: string;
  serial_number: string;
  manufacturer: string;
  model: string;
  location: string;
  status: string;
  store_id: number;
  last_maintenance_date: string;
  next_maintenance_date: string;
}

const STATUS_COLORS: Record<string, string> = {
  operational: "var(--color-success)",
  maintenance: "var(--color-warning)",
  broken: "var(--color-error)",
  retired: "var(--color-text-muted)",
};

export default function EquipmentPage() {
  const router = useRouter();
  const [items, setItems] = useState<Equipment[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [storeFilter, setStoreFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (storeFilter) params.set("store_id", storeFilter);
      if (statusFilter) params.set("status", statusFilter);
      params.set("per_page", "100");
      const d = await api.getRaw<any>(`/admin/equipment?${params.toString()}`);
      setItems(d?.items || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [storeFilter, statusFilter]);

  useEffect(() => {
    api.getRaw<any>("/admin/stores?per_page=50").then(d => setStores(Array.isArray(d)?d:(d.items||[]))).catch((e)=>{console.error('stores:',e)});
    fetchData();
  }, [fetchData]);

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this equipment record?")) return;
    setDeletingId(id);
    try { await api.del(`/admin/equipment/${id}`); fetchData(); } catch (e) { console.error(e); } finally { setDeletingId(null); }
  };

  return (
    <div style={{ padding: 32 }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Equipment</h1>
          <p className="page-subtitle">{items.length} records</p>
        </div>
        <button type="button" onClick={() => router.push("/equipment/new")} className="btn btn-primary btn-sm">
          <Plus size={16} /> Add Equipment
        </button>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <select className="border rounded px-3 py-2 text-sm" value={storeFilter} onChange={e => setStoreFilter(e.target.value)}>
          <option value="">All Stores</option>
          {stores.map((s: any) => <option key={s.id} value={s.id}>{s.store_name}</option>)}
        </select>
        <select className="border rounded px-3 py-2 text-sm" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="operational">Operational</option>
          <option value="maintenance">Maintenance</option>
          <option value="broken">Broken</option>
          <option value="retired">Retired</option>
        </select>
      </div>

      {loading ? <p>Loading...</p> : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Serial</th>
                <th>Location</th>
                <th>Status</th>
                <th>Last Maint.</th>
                <th>Next Maint.</th>
                <th style={{ width: 100 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id}>
                  <td><strong>{item.name}</strong></td>
                  <td>{item.equipment_type}</td>
                  <td>{item.serial_number || "—"}</td>
                  <td>{item.location || "—"}</td>
                  <td><span style={{ color: STATUS_COLORS[item.status] || "inherit", fontWeight: 600, fontSize: 12, textTransform: "capitalize" }}>{item.status}</span></td>
                  <td>{item.last_maintenance_date || "—"}</td>
                  <td>{item.next_maintenance_date || "—"}</td>
                  <td>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => router.push(`/equipment/${item.id}`)} className="btn btn-icon btn-ghost"><Edit2 size={14} /></button>
                      <button onClick={() => handleDelete(item.id)} disabled={deletingId === item.id} className="btn btn-icon btn-ghost" style={{ color: deletingId === item.id ? "var(--color-text-muted)" : "var(--color-error)" }}><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign: "center", padding: 24, color: "var(--color-text-muted)" }}>No equipment found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
