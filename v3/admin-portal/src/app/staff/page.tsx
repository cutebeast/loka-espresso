"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Plus, Trash2 } from "lucide-react";

interface Staff { id: number; principal_id: number; display_name: string; email_address?: string; phone_number?: string; store_id: number; store_name?: string; has_pin: boolean; is_active: boolean; roles: { id: number; name: string }[]; }
interface Store { id: number; store_name: string; }

export default function StaffPage() {
  const router = useRouter();
  const [items, setItems] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState("");

  const fetchStores = async () => {
    try { const d = await api.get<Store[] | { items: Store[] }>("/admin/stores?per_page=50"); const list = Array.isArray(d) ? d : (d.items || []); setStores(list); }
    catch (e) { console.error(e); }
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api.get<Staff[] | { items: Staff[] }>(`/admin/staff/roles`); // Use the roles endpoint that includes store_name + roles
      const all = Array.isArray(d) ? d : (d.items || []);
      setItems(storeId ? all.filter((s: Staff) => String(s.store_id) === storeId) : all);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, [storeId]);

  useEffect(() => { fetchStores(); }, []);
  useEffect(() => { fetchData(); }, [fetchData]);

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this staff member?")) return;
    try { await api.del(`/admin/staff/${id}`); fetchData(); } catch (e) { console.error(e); }
  };

  return (
    <div style={{ padding: 24 }}>
      <div className="page-header"><div><h1 className="page-title">Staff</h1><p className="page-subtitle">{items.length} members</p></div><button type="button" onClick={() => router.push("/staff/new")} className="btn btn-primary btn-sm"><Plus size={14} /> Add Staff</button></div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
        <select value={storeId} onChange={e => setStoreId(e.target.value)} style={{ padding: "6px 12px", fontSize: 13, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-light)" }}>
          <option value="">All Stores</option>
          {stores.map(s => <option key={s.id} value={s.id}>{s.store_name}</option>)}
        </select>
      </div>

      <div className="table-container"><table className="data-table">
        <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Store</th><th>PIN</th><th>Roles</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {loading ? <tr><td colSpan={8} className="data-table-empty">Loading...</td></tr>
          : items.map(s => (
            <tr key={s.id}>
              <td style={{ fontWeight: 600 }}>{s.display_name}</td>
              <td style={{ fontSize: 12 }}>{s.email_address || "—"}</td>
              <td style={{ fontSize: 12 }}>{s.phone_number || "—"}</td>
              <td style={{ fontSize: 12 }}>{s.store_name || `Store #${s.store_id}`}</td>
              <td><span className={`badge badge-sm ${s.has_pin ? "badge-green" : "badge-yellow"}`}>{s.has_pin ? "Set" : "None"}</span></td>
              <td style={{ fontSize: 12 }}>
                {s.roles?.length ? (
                  <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                    {s.roles.map((r) => <span key={r.id} className="badge badge-sm badge-primary" style={{ fontSize: 10 }}>{r.name}</span>)}
                  </div>
                ) : <span className="badge badge-sm badge-gray">No roles</span>}
              </td>
              <td><span className={`badge badge-sm ${s.is_active ? "badge-green" : "badge-gray"}`}>{s.is_active ? "Active" : "Inactive"}</span></td>
              <td>
                <button type="button" onClick={() => handleDelete(s.id)} className="btn btn-ghost btn-sm" style={{ color: "var(--color-error)" }}><Trash2 size={14} /></button>
              </td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </div>
  );
}
