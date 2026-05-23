"use client";
import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { Plus, Trash2, Save, Shield, ShieldCheck } from "lucide-react";

interface Role { id: number; display_name: string; description?: string; role_key: string; }
interface Permission { id: number; permission_key: string; resource: string; action: string; description?: string; }

const STAFF_ROLE_KEYS = ["shift_supervisor", "cashier", "server", "kitchen_staff", "delivery_coordinator"];

const STAFF_PERM_GROUPS: { label: string; resources: string[] }[] = [
  { label: "Kitchen (KDS)", resources: ["kitchen"] },
  { label: "Tables", resources: ["tables"] },
  { label: "POS Terminal", resources: ["pos"] },
  { label: "Wallet Top-Up", resources: ["wallet"] },
  { label: "Time Clock", resources: ["time_clock"] },
  { label: "Reservations", resources: ["reservations"] },
];

export default function StaffRolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ display_name: "", description: "", role_key: "" });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [assigningRole, setAssigningRole] = useState<number | null>(null);
  const [rolePerms, setRolePerms] = useState<number[]>([]);

  const fetch = useCallback(() => {
    setLoading(true);
    api.get<Role[] | { items: Role[] }>("/admin/auth/roles").then(d => {
      const all = Array.isArray(d) ? d : (d.items || []);
      setRoles(all.filter((r: Role) => STAFF_ROLE_KEYS.includes(r.role_key)));
    }).catch((e) => { console.error('staff roles:', e); }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetch();
    api.get<Permission[] | { items: Permission[] }>("/admin/auth/permissions").then(d => {
      const all = Array.isArray(d) ? d : (d.items || []);
      // Only staff portal permissions (28-37)
      setPermissions(all.filter((p: Permission) => STAFF_PERM_GROUPS.some(g => g.resources.includes(p.resource))));
    }).catch((e) => { console.error('staff permissions:', e); });
  }, []);

  const handleCreate = async (e: React.FormEvent) => { e.preventDefault(); setSaving(true);
    try { await api.post("/admin/auth/roles", form); setShowForm(false); setForm({ display_name: "", description: "", role_key: "" }); setMsg("Role created"); setTimeout(() => setMsg(""), 2000); fetch(); }
    catch (e: any) { setMsg(e.message || "Failed"); } finally { setSaving(false); }
  };

  const handleUpdate = async (id: number) => { setSaving(true);
    try { await api.put(`/admin/auth/roles/${id}`, { display_name: form.display_name, description: form.description }); setEditingId(null); setMsg("Updated"); setTimeout(() => setMsg(""), 2000); fetch(); }
    catch (e: any) { setMsg(e.message || "Failed"); } finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this role? All assignments will be removed.")) return;
    setDeletingId(id);
    try { await api.del(`/admin/auth/roles/${id}`); fetch(); } catch (e) { console.error(e); } finally { setDeletingId(null); }
  };

  const loadRolePerms = async (roleId: number) => {
    setAssigningRole(roleId);
    try { const d = await api.getRaw<{ permission_ids?: number[]; data?: { permission_ids?: number[] } }>(`/admin/auth/roles/${roleId}/permissions`); setRolePerms(d?.permission_ids || d?.data?.permission_ids || []); }
    catch (e) { console.error(e); setRolePerms([]); }
  };

  const togglePerm = (permId: number) => { setRolePerms(prev => prev.includes(permId) ? prev.filter(p => p !== permId) : [...prev, permId]); };

  const savePerms = async () => {
    if (!assigningRole) return;
    try { await api.put(`/admin/auth/roles/${assigningRole}/permissions`, { permission_ids: rolePerms }); setAssigningRole(null); setMsg("Saved"); setTimeout(() => setMsg(""), 2000); }
    catch (e) { console.error(e); }
  };

  return (
    <div style={{ padding: 24 }}>
      <div className="page-header"><div><h1 className="page-title">Staff Roles</h1><p className="page-subtitle">{roles.length} roles · controls staff.loyaltysystem.uk access</p></div><button type="button" onClick={() => { setShowForm(true); setForm({ display_name: "", description: "", role_key: "" }); }} className="btn btn-primary btn-sm"><Plus size={14} /> Create Role</button></div>
      {msg && <div className={`alert ${msg.includes("Failed") ? "alert-error" : "alert-success"}`} style={{ marginBottom: 12 }}>{msg}</div>}

      {(showForm || editingId) && (
        <div className="card" style={{ padding: 20, marginBottom: 16, maxWidth: 440 }}>
          <h3>{editingId ? "Edit Role" : "New Staff Role"}</h3>
          <form onSubmit={e => { e.preventDefault(); editingId ? handleUpdate(editingId) : handleCreate(e); }}>
            <div className="df-grid">
              <div className="df-field" style={{ gridColumn: "1/-1" }}><label className="form-label">Name</label><input required className="w-full border rounded px-3 py-2 text-sm" value={form.display_name} onChange={e => setForm({ ...form, display_name: e.target.value })} /></div>
              <div className="df-field" style={{ gridColumn: "1/-1" }}><label className="form-label">Key</label><input className="w-full border rounded px-3 py-2 text-sm" value={form.role_key} onChange={e => setForm({ ...form, role_key: e.target.value.replace(/\s/g, "_").toLowerCase() })} /></div>
              <div className="df-field" style={{ gridColumn: "1/-1" }}><label className="form-label">Description</label><textarea className="w-full border rounded px-3 py-2 text-sm" rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
            </div>
            <div className="df-actions"><button type="button" onClick={() => { setShowForm(false); setEditingId(null); }} className="btn btn-ghost">Cancel</button><button type="submit" disabled={saving} className="btn btn-primary"><Save size={14} />{saving ? "Saving..." : editingId ? "Update" : "Create"}</button></div>
          </form>
        </div>
      )}

      {assigningRole && (
        <div className="card" style={{ padding: 20, marginBottom: 16, maxWidth: 700 }}>
          <h3 style={{ display: "flex", alignItems: "center", gap: 6 }}><ShieldCheck size={18} /> Staff Portal Permissions — {roles.find(r => r.id === assigningRole)?.display_name}</h3>
          <p style={{ fontSize: 12, opacity: 0.5, marginBottom: 16 }}>What this role can do on staff.loyaltysystem.uk</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {STAFF_PERM_GROUPS.map(group => {
              const groupPerms = permissions.filter(p => group.resources.includes(p.resource));
              if (groupPerms.length === 0) return null;
              return (
                <div key={group.label}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: 6, borderBottom: "1px solid var(--color-border-light)", paddingBottom: 3 }}>{group.label}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 4 }}>
                    {groupPerms.map(p => (
                      <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", borderRadius: 6, border: "1px solid var(--color-border-light)", fontSize: 12, cursor: "pointer", background: rolePerms.includes(p.id) ? "rgba(59,74,26,0.04)" : "transparent" }}>
                        <input type="checkbox" checked={rolePerms.includes(p.id)} onChange={() => togglePerm(p.id)} />
                        <span>{p.description || p.permission_key}</span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="df-actions" style={{ marginTop: 16 }}><button type="button" onClick={() => setAssigningRole(null)} className="btn btn-ghost">Cancel</button><button type="button" onClick={savePerms} className="btn btn-primary"><Save size={14} /> Save Permissions</button></div>
        </div>
      )}

      <div className="table-container"><table className="data-table">
        <thead><tr><th>Role</th><th>Key</th><th>Description</th><th style={{ width: 120 }}>Actions</th></tr></thead>
        <tbody>
          {loading ? <tr><td colSpan={4} className="data-table-empty">Loading...</td></tr>
          : roles.map(r => (
            <tr key={r.id}>
              <td><span style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}><Shield size={14} style={{ opacity: 0.4 }} /> {r.display_name}</span></td>
              <td style={{ fontSize: 11, fontFamily: "monospace", opacity: 0.5 }}>{r.role_key}</td>
              <td style={{ fontSize: 12, opacity: 0.7 }}>{r.description || "—"}</td>
              <td style={{ whiteSpace: "nowrap" }}>
                <div style={{ display: "flex", gap: 4 }}>
                  <button type="button" onClick={() => { setForm({ display_name: r.display_name, description: r.description || "", role_key: r.role_key }); setEditingId(r.id); }} className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}>Edit</button>
                  <button type="button" onClick={() => loadRolePerms(r.id)} className="btn btn-outline btn-sm" style={{ fontSize: 11 }}>Perms</button>
                  <button type="button" onClick={() => handleDelete(r.id)} disabled={deletingId === r.id} className="btn btn-ghost btn-sm" style={{ color: deletingId === r.id ? "var(--color-text-muted)" : "var(--color-error)", fontSize: 11 }}><Trash2 size={12} /></button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </div>
  );
}
