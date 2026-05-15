"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ArrowLeft, Save } from "lucide-react";

interface Store { id: number; store_name: string; }

export default function NewStaffPage() {
  const router = useRouter();
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ display_name: "", employee_id: "", role: "server", phone_number: "", is_active: true });

  useEffect(() => {
    api.getRaw<any>("/admin/stores?per_page=50").then(d => { const list = d.items || []; setStores(list); if (list.length > 0) setStoreId(String(list[0].id)); }).catch(()=>{});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => { e.preventDefault(); setSaving(true);
    try { await api.post("/admin/staff", { ...form, store_id: Number(storeId) }); router.push("/staff"); }
    catch (err: any) { setError(err.message); } finally { setSaving(false); }
  };

  return (
    <div style={{ padding: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={() => router.push("/staff")} className="btn btn-ghost btn-sm"><ArrowLeft size={18} /></button>
        <div><h1 className="page-title" style={{ margin: 0 }}>New Staff</h1></div>
      </div>
      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}
      <div className="card" style={{ padding: 24, maxWidth: 500 }}>
        <form onSubmit={handleSubmit}><div className="df-grid">
          <div className="df-field"><label className="df-label">Name *</label><input required value={form.display_name} onChange={e => setForm({ ...form, display_name: e.target.value })} /></div>
          <div className="df-field"><label className="df-label">Employee ID *</label><input required value={form.employee_id} onChange={e => setForm({ ...form, employee_id: e.target.value })} /></div>
          <div className="df-field"><label className="df-label">Role</label><select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}><option value="server">Server</option><option value="cashier">Cashier</option><option value="kitchen_staff">Kitchen Staff</option><option value="shift_supervisor">Shift Supervisor</option><option value="store_manager">Store Manager</option></select></div>
          <div className="df-field"><label className="df-label">Phone</label><input value={form.phone_number} onChange={e => setForm({ ...form, phone_number: e.target.value })} /></div>
          <div className="df-field"><label className="df-label">Store</label><select value={storeId} onChange={e => setStoreId(e.target.value)} style={{ width: "100%" }}>{stores.map(s => <option key={s.id} value={s.id}>{s.store_name}</option>)}</select></div>
          <div className="df-field"><label className="df-label" style={{ display: "flex", alignItems: "center", gap: 8 }}><input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} /> Active</label></div>
        </div><div className="df-actions" style={{ marginTop: 20 }}><button type="button" onClick={() => router.push("/staff")} className="btn btn-ghost">Cancel</button><button type="submit" disabled={saving} className="btn btn-primary"><Save size={16} /> {saving ? "Creating..." : "Create Staff"}</button></div></form>
      </div>
    </div>
  );
}
