"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Plus, Trash2, Shield, Store } from "lucide-react";

interface Admin { id: number; email: string; display_name: string; phone_number?: string; is_active: boolean; last_login_at?: string; roles?: string[]; store_ids?: number[]; }
interface Role { id: number; display_name: string; description?: string; }
interface Store { id: number; store_name: string; }

export default function AdminUsersPage() {
  const [items, setItems] = useState<Admin[]>([]);
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<Role[]>([]);
  const [allStores, setAllStores] = useState<Store[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ email: "", display_name: "", password: "", phone_number: "", role_id: "" });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const fetch = () => {
    setLoading(true);
    api.get<any>("/admin/auth/users").then(d => setItems(Array.isArray(d) ? d : (d.items || []))).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => {
    fetch();
    api.get<any>("/admin/auth/roles").then(d => setRoles(Array.isArray(d) ? d : (d.items || []))).catch(() => {});
    api.get<any>("/admin/stores?per_page=100").then(d => setAllStores(Array.isArray(d) ? d : (d.items || []))).catch(() => {});
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/admin/auth/register", { ...form, role_id: form.role_id ? Number(form.role_id) : undefined });
      setShowForm(false);
      setForm({ email: "", display_name: "", password: "", phone_number: "", role_id: "" });
      setMsg("Admin created");
      setTimeout(() => setMsg(""), 2000);
      fetch();
    } catch (e: any) { setMsg(e.message || "Failed"); } finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this admin account?")) return;
    try {
      await api.del(`/admin/auth/users/${id}`);
      fetch();
      setMsg("Admin deleted");
      setTimeout(() => setMsg(""), 2000);
    } catch (e: any) { setMsg(e.message || "Failed"); }
  };

  return (
    <div style={{ padding: 24 }}>
      <div className="page-header"><div><h1 className="page-title">Admin Users</h1><p className="page-subtitle">{items.length} accounts · {roles.length} roles</p></div><button onClick={() => setShowForm(true)} className="btn btn-primary btn-sm"><Plus size={14} /> Add Admin</button></div>
      {msg && <div className={`alert ${msg.includes("Failed") ? "alert-error" : "alert-success"}`} style={{ marginBottom: 12 }}>{msg}</div>}

      {showForm && (
        <div className="card" style={{ padding: 20, marginBottom: 16, maxWidth: 440 }}>
          <h3 style={{ margin: "0 0 12px" }}>New Admin Account</h3>
          <form onSubmit={handleCreate}>
            <div className="df-grid">
              <div className="df-field" style={{ gridColumn: "1/-1" }}><label className="form-label">Display Name</label><input required className="w-full border rounded px-3 py-2 text-sm" value={form.display_name} onChange={e => setForm({ ...form, display_name: e.target.value })} placeholder="Ali" /></div>
              <div className="df-field"><label className="form-label">Email</label><input required type="email" className="w-full border rounded px-3 py-2 text-sm" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="ali@loka.com" /></div>
              <div className="df-field"><label className="form-label">Phone</label><input className="w-full border rounded px-3 py-2 text-sm" value={form.phone_number} onChange={e => setForm({ ...form, phone_number: e.target.value })} placeholder="+60" /></div>
              <div className="df-field" style={{ gridColumn: "1/-1" }}><label className="form-label">Password</label><input required type="password" className="w-full border rounded px-3 py-2 text-sm" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Min 8 characters" /></div>
              <div className="df-field" style={{ gridColumn: "1/-1" }}>
                <label className="form-label">Role</label>
                <select value={form.role_id} onChange={e => setForm({ ...form, role_id: e.target.value })} className="w-full border rounded px-3 py-2 text-sm">
                  <option value="">No role</option>
                  {roles.map(r => <option key={r.id} value={r.id}>{r.display_name}</option>)}
                </select>
              </div>
            </div>
            <div className="df-actions"><button type="button" onClick={() => setShowForm(false)} className="btn btn-ghost">Cancel</button><button type="submit" disabled={saving} className="btn btn-primary"><Plus size={14} />{saving ? "Creating..." : "Create"}</button></div>
          </form>
        </div>
      )}

      <div className="table-container"><table className="data-table">
        <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Roles</th><th>Stores</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {loading ? <tr><td colSpan={7} className="data-table-empty">Loading...</td></tr>
          : items.map(a => (
            <tr key={a.id}>
              <td style={{ fontWeight: 600 }}>{a.display_name}</td>
              <td>{a.email}</td>
              <td style={{ fontSize: 12 }}>{a.phone_number || "—"}</td>
              <td style={{ fontSize: 12 }}>
                {a.roles?.length ? (
                  <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                    {a.roles.map(r => <span key={r} className="badge badge-sm badge-primary" style={{ fontSize: 10 }}>{r}</span>)}
                  </div>
                ) : <span className="badge badge-sm badge-gray">No role</span>}
              </td>
              <td style={{ fontSize: 11 }}>
                {a.store_ids?.length ? a.store_ids.map(id => allStores.find(s => s.id === id)?.store_name).filter(Boolean).join(", ") : <span className="badge badge-sm badge-gray" style={{ fontSize: 10 }}>All</span>}
              </td>
              <td><span className={`badge badge-sm ${a.is_active ? "badge-green" : "badge-gray"}`}>{a.is_active ? "Active" : "Inactive"}</span></td>
              <td><button onClick={() => handleDelete(a.id)} className="btn btn-ghost btn-sm" style={{ color: "var(--color-error)" }}><Trash2 size={14} /></button></td>
            </tr>
          ))}
        </tbody>
      </table></div>

      {/* Roles reference */}
      {roles.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h3 style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, marginBottom: 10 }}><Shield size={16} /> Roles</h3>
          <div className="table-container"><table className="data-table" style={{ fontSize: 12 }}>
            <thead><tr><th>Role</th><th>Description</th></tr></thead>
            <tbody>
              {roles.map(r => <tr key={r.id}><td style={{ fontWeight: 600 }}>{r.display_name}</td><td style={{ opacity: 0.6 }}>{r.description || "—"}</td></tr>)}
            </tbody>
          </table></div>
        </div>
      )}
    </div>
  );
}
