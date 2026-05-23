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
  const [form, setForm] = useState({ email: "", display_name: "", password: "", confirmPassword: "", phone_number: "", role_id: "" });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [validationError, setValidationError] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const fetch = () => {
    setLoading(true); setMsg("");
    api.get<any>("/admin/auth/users").then(d => setItems(Array.isArray(d) ? d : (d.items || []))).catch((e: any) => setMsg(e.message || "Failed to load users")).finally(() => setLoading(false));
  };

  useEffect(() => {
    fetch();
    api.get<any>("/admin/auth/roles").then(d => setRoles(Array.isArray(d) ? d : (d.items || []))).catch((e: any) => console.error("Failed to load roles:", e));
    api.get<any>("/admin/stores?per_page=100").then(d => setAllStores(Array.isArray(d) ? d : (d.items || []))).catch((e: any) => console.error("Failed to load stores:", e));
  }, []);

  const validateForm = (): string | null => {
    if (!form.display_name.trim()) return "Display name is required.";
    if (!form.email.trim()) return "Email is required.";
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(form.email.trim())) return "Please enter a valid email address.";
    if (form.password.length < 8) return "Password must be at least 8 characters.";
    if (form.password !== form.confirmPassword) return "Passwords do not match.";
    return null;
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError("");
    const vError = validateForm();
    if (vError) { setValidationError(vError); return; }

    setSaving(true);
    try {
      await api.post("/admin/auth/register", { ...form, role_id: form.role_id ? Number(form.role_id) : undefined });
      setShowForm(false);
      setForm({ email: "", display_name: "", password: "", confirmPassword: "", phone_number: "", role_id: "" });
      setMsg("Admin created");
      setTimeout(() => setMsg(""), 2000);
      fetch();
    } catch (e: any) { setMsg(e.message || "Failed"); } finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this admin account?")) return;
    setDeletingId(id);
    try {
      await api.del(`/admin/auth/users/${id}`);
      fetch();
      setMsg("Admin deleted");
      setTimeout(() => setMsg(""), 2000);
    } catch (e: any) { setMsg(e.message || "Failed"); } finally { setDeletingId(null); }
  };

  return (
    <div style={{ padding: 24 }}>
      <div className="page-header"><div><h1 className="page-title">Admin Users</h1><p className="page-subtitle">{items.length} accounts · {roles.length} roles</p></div><button type="button" onClick={() => setShowForm(true)} className="btn btn-primary btn-sm"><Plus size={14} /> Add Admin</button></div>
      {msg && <div className={`alert ${msg.includes("Failed") || validationError ? "alert-error" : "alert-success"}`} style={{ marginBottom: 12 }}>{msg}</div>}

      {showForm && (
        <div className="card" style={{ padding: 20, marginBottom: 16, maxWidth: 440 }}>
          <h3 style={{ margin: "0 0 12px" }}>New Admin Account</h3>
          {validationError && <div className="alert alert-error" style={{ marginBottom: 12, fontSize: 13 }}>{validationError}</div>}
          <form onSubmit={handleCreate}>
            <div className="df-grid">
              <div className="df-field" style={{ gridColumn: "1/-1" }}><label htmlFor="admin-dname" className="form-label">Display Name</label><input id="admin-dname" required className="w-full border rounded px-3 py-2 text-sm" value={form.display_name} onChange={e => setForm({ ...form, display_name: e.target.value })} placeholder="Ali" /></div>
              <div className="df-field"><label htmlFor="admin-email" className="form-label">Email</label><input id="admin-email" required type="email" className="w-full border rounded px-3 py-2 text-sm" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="ali@loka.com" /></div>
              <div className="df-field"><label htmlFor="admin-phone" className="form-label">Phone</label><input id="admin-phone" className="w-full border rounded px-3 py-2 text-sm" value={form.phone_number} onChange={e => setForm({ ...form, phone_number: e.target.value })} placeholder="+60" /></div>
              <div className="df-field"><label htmlFor="admin-password" className="form-label">Password (min 8 chars)</label><input id="admin-password" required type="password" className="w-full border rounded px-3 py-2 text-sm" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Min 8 characters" /></div>
              <div className="df-field"><label htmlFor="admin-confirm-password" className="form-label">Confirm Password</label><input id="admin-confirm-password" required type="password" className="w-full border rounded px-3 py-2 text-sm" value={form.confirmPassword} onChange={e => setForm({ ...form, confirmPassword: e.target.value })} placeholder="Re-enter password" /></div>
              <div className="df-field" style={{ gridColumn: "1/-1" }}>
                <label htmlFor="admin-role" className="form-label">Role</label>
                <select id="admin-role" value={form.role_id} onChange={e => setForm({ ...form, role_id: e.target.value })} className="w-full border rounded px-3 py-2 text-sm">
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
              <td><button type="button" onClick={() => handleDelete(a.id)} disabled={deletingId === a.id} className="btn btn-ghost btn-sm" style={{ color: deletingId === a.id ? "var(--color-text-muted)" : "var(--color-error)" }}><Trash2 size={14} /></button></td>
            </tr>
          ))}
        </tbody>
      </table></div>

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
