"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ArrowLeft, Save, Copy, Check } from "lucide-react";

interface Store { id: number; store_name: string; }

export default function NewStaffPage() {
  const router = useRouter();
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ email: "", password: "", display_name: "", phone_number: "", role: "server" });
  const [created, setCreated] = useState<{ email: string; password: string; pin: string; display_name: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.getRaw<any>("/admin/stores?per_page=50").then(d => { const list = d.items || []; setStores(list); if (list.length > 0) setStoreId(String(list[0].id)); }).catch(()=>{});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => { e.preventDefault(); setSaving(true); setError("");
    try {
      const result = await api.post<any>("/admin/staff", {
        email: form.email, password: form.password, display_name: form.display_name,
        phone_number: form.phone_number, role: form.role, store_id: Number(storeId),
        pin: "000000",
      });
      setCreated({ email: form.email, password: form.password, pin: "000000", display_name: form.display_name });
    }
    catch (err: any) { setError(err.message); } finally { setSaving(false); }
  };

  const handleCopy = () => {
    if (!created) return;
    const text = `Staff: ${created.display_name}\nEmail: ${created.email}\nPassword: ${created.password}\nPIN: ${created.pin}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (created) {
    return (
      <div style={{ padding: 32, maxWidth: 500, margin: "0 auto", textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
        <h1 className="page-title" style={{ marginBottom: 8 }}>Staff Created</h1>
        <p style={{ fontSize: 13, opacity: 0.6, marginBottom: 20 }}>Share these credentials with the staff member</p>
        <div className="card" style={{ padding: 20, textAlign: "left", fontFamily: "monospace", fontSize: 13, lineHeight: 2 }}>
          <div><strong>Name:</strong> {created.display_name}</div>
          <div><strong>Email:</strong> {created.email}</div>
          <div><strong>Password:</strong> {created.password}</div>
          <div><strong>PIN:</strong> {created.pin}</div>
        </div>
        <div className="df-actions" style={{ marginTop: 16 }}>
          <button onClick={handleCopy} className="btn btn-primary"><Copy size={14} /> {copied ? "Copied!" : "Copy Credentials"}</button>
          <button onClick={() => router.push("/staff")} className="btn btn-ghost"><Check size={14} /> Done</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={() => router.push("/staff")} className="btn btn-ghost btn-sm"><ArrowLeft size={18} /></button>
        <div><h1 className="page-title" style={{ margin: 0 }}>New Staff</h1></div>
      </div>
      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}
      <div className="card" style={{ padding: 24, maxWidth: 500 }}>
        <form onSubmit={handleSubmit}><div className="df-grid">
          <div className="df-field"><label className="df-label">Display Name *</label><input required className="w-full border rounded px-3 py-2 text-sm" value={form.display_name} onChange={e => setForm({ ...form, display_name: e.target.value })} /></div>
          <div className="df-field"><label className="df-label">Email</label><input type="email" className="w-full border rounded px-3 py-2 text-sm" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="staff@loyaltysystem.uk" /></div>
          <div className="df-field"><label className="df-label">Password *</label><input required type="text" className="w-full border rounded px-3 py-2 text-sm" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /></div>
          <div className="df-field"><label className="df-label">Role</label><select className="w-full border rounded px-3 py-2 text-sm" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}><option value="server">Server</option><option value="cashier">Cashier</option><option value="kitchen_staff">Kitchen Staff</option><option value="shift_supervisor">Shift Supervisor</option><option value="store_manager">Store Manager</option></select></div>
          <div className="df-field"><label className="df-label">Phone</label><input className="w-full border rounded px-3 py-2 text-sm" value={form.phone_number} onChange={e => setForm({ ...form, phone_number: e.target.value })} /></div>
          <div className="df-field"><label className="df-label">Store *</label><select className="w-full border rounded px-3 py-2 text-sm" value={storeId} onChange={e => setStoreId(e.target.value)}>{stores.map(s => <option key={s.id} value={s.id}>{s.store_name}</option>)}</select></div>
          <div className="df-field" style={{ gridColumn: "1/-1" }}>
            <div style={{ fontSize: 11, opacity: 0.5 }}>Default PIN: <strong>000000</strong> (staff can change after login)</div>
          </div>
        </div><div className="df-actions" style={{ marginTop: 20 }}><button type="button" onClick={() => router.push("/staff")} className="btn btn-ghost">Cancel</button><button type="submit" disabled={saving} className="btn btn-primary"><Save size={16} /> {saving ? "Creating..." : "Create Staff"}</button></div></form>
      </div>
    </div>
  );
}
