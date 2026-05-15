"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ArrowLeft, Save } from "lucide-react";

export default function EditSupplierPage() {
  const p = useParams(); const r = useRouter(); const id = p.id as string;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState<Record<string, any>>({});

  useEffect(() => { load(); }, [id]);

  const load = async () => { setLoading(true);
    try { const d = await api.getRaw<any>(`/admin/inventory/suppliers/${id}`); setForm({ supplier_name: d.supplier_name || "", contact_person: d.contact_person || "", phone_number: d.phone_number || "", is_active: d.is_active }); }
    catch {} finally { setLoading(false); }
  };

  const save = async () => { setSaving(true);
    try { await api.patch(`/admin/inventory/suppliers/${id}`, form); setMsg("Saved"); setTimeout(() => setMsg(""), 2000); } catch {} finally { setSaving(false); }
  };

  if (loading) return <div style={{ padding: 32 }}>Loading...</div>;

  return (
    <div style={{ padding: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}><button onClick={() => r.push("/inventory/suppliers")} className="btn btn-ghost btn-sm"><ArrowLeft size={18} /></button><div><h1 className="page-title" style={{ margin: 0 }}>{form.supplier_name || "Supplier"}</h1></div></div>
      {msg && <div className="alert alert-success" style={{ marginBottom: 12 }}>{msg}</div>}
      <div className="card" style={{ padding: 24, maxWidth: 500 }}>
        <div className="df-grid">
          <div className="df-field"><label className="df-label">Name *</label><input required value={form.supplier_name} onChange={e => setForm({ ...form, supplier_name: e.target.value })} /></div>
          <div className="df-field"><label className="df-label">Contact</label><input value={form.contact_person} onChange={e => setForm({ ...form, contact_person: e.target.value })} /></div>
          <div className="df-field"><label className="df-label">Phone</label><input value={form.phone_number} onChange={e => setForm({ ...form, phone_number: e.target.value })} /></div>
          <div className="df-field"><label className="df-label" style={{ display: "flex", alignItems: "center", gap: 8 }}><input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} /> Active</label></div>
        </div>
        <div className="df-actions" style={{ marginTop: 20 }}><button type="button" onClick={() => r.push("/inventory/suppliers")} className="btn btn-ghost">Cancel</button><button onClick={save} disabled={saving} className="btn btn-primary"><Save size={16} /> {saving ? "Saving..." : "Save Changes"}</button></div>
      </div>
    </div>
  );
}
