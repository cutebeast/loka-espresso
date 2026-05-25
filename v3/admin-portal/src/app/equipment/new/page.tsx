"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ArrowLeft, Save } from "lucide-react";

export default function NewEquipmentPage() {
  const router = useRouter();
  const [stores, setStores] = useState<any[]>([]);
  const [form, setForm] = useState<Record<string, any>>({
    store_id: "", name: "", equipment_type: "general", serial_number: "",
    manufacturer: "", model: "", location: "", purchase_date: "",
    warranty_expiry: "", status: "operational", last_maintenance_date: "",
    next_maintenance_date: "", notes: "", is_active: true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getRaw<any>("/admin/stores?per_page=50").then(d => setStores(Array.isArray(d)?d:(d.items||[]))).catch((e)=>{console.error('stores:',e)});
  }, []);

  const update = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form };
      const n = Number(payload.store_id);
      payload.store_id = Number.isNaN(n) ? null : n;
      const r: any = await api.post("/admin/equipment", payload);
      const id = r?.id;
      if (id) router.push(`/equipment/${id}`);
    } catch (e: any) { setError(e?.message || "Failed to create equipment"); }
    finally { setSaving(false); }
  };

  const inputClass = "w-full border rounded px-3 py-2 text-sm";
  const labelClass = "block text-xs font-semibold text-gray-500 uppercase mb-1";

  return (
    <div style={{ padding: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={() => router.push("/equipment")} className="btn btn-ghost btn-sm"><ArrowLeft size={18} /></button>
        <div><h1 className="page-title" style={{ margin: 0 }}>New Equipment</h1></div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <form onSubmit={handleSubmit} className="card" style={{ padding: 24, maxWidth: 720 }}>
        <div className="df-grid">
          <div className="df-field">
            <label className={labelClass}>Store *</label>
            <select required className={inputClass} value={form.store_id} onChange={e => update("store_id", e.target.value)}>
              <option value="">— Select Store —</option>
              {stores.map((s: any) => <option key={s.id} value={s.id}>{s.store_name}</option>)}
            </select>
          </div>
          <div className="df-field">
            <label className={labelClass}>Name *</label>
            <input required className={inputClass} value={form.name} onChange={e => update("name", e.target.value)} />
          </div>
          <div className="df-field">
            <label className={labelClass}>Type</label>
            <input className={inputClass} value={form.equipment_type} onChange={e => update("equipment_type", e.target.value)} />
          </div>
          <div className="df-field">
            <label className={labelClass}>Serial Number</label>
            <input className={inputClass} value={form.serial_number} onChange={e => update("serial_number", e.target.value)} />
          </div>
          <div className="df-field">
            <label className={labelClass}>Manufacturer</label>
            <input className={inputClass} value={form.manufacturer} onChange={e => update("manufacturer", e.target.value)} />
          </div>
          <div className="df-field">
            <label className={labelClass}>Model</label>
            <input className={inputClass} value={form.model} onChange={e => update("model", e.target.value)} />
          </div>
          <div className="df-field">
            <label className={labelClass}>Location</label>
            <input className={inputClass} value={form.location} onChange={e => update("location", e.target.value)} />
          </div>
          <div className="df-field">
            <label className={labelClass}>Status</label>
            <select className={inputClass} value={form.status} onChange={e => update("status", e.target.value)}>
              <option value="operational">Operational</option>
              <option value="maintenance">Maintenance</option>
              <option value="broken">Broken</option>
              <option value="retired">Retired</option>
            </select>
          </div>
          <div className="df-field">
            <label className={labelClass}>Purchase Date</label>
            <input type="date" className={inputClass} value={form.purchase_date} onChange={e => update("purchase_date", e.target.value)} />
          </div>
          <div className="df-field">
            <label className={labelClass}>Warranty Expiry</label>
            <input type="date" className={inputClass} value={form.warranty_expiry} onChange={e => update("warranty_expiry", e.target.value)} />
          </div>
          <div className="df-field">
            <label className={labelClass}>Last Maintenance</label>
            <input type="date" className={inputClass} value={form.last_maintenance_date} onChange={e => update("last_maintenance_date", e.target.value)} />
          </div>
          <div className="df-field">
            <label className={labelClass}>Next Maintenance</label>
            <input type="date" className={inputClass} value={form.next_maintenance_date} onChange={e => update("next_maintenance_date", e.target.value)} />
          </div>
          <div className="df-field" style={{ gridColumn: "1/-1" }}>
            <label className={labelClass}>Notes</label>
            <textarea rows={3} className={inputClass} value={form.notes} onChange={e => update("notes", e.target.value)} />
          </div>
        </div>
        <div className="df-actions" style={{ marginTop: 16 }}>
          <button type="button" onClick={() => router.push("/equipment")} className="btn btn-ghost">Cancel</button>
          <button type="submit" disabled={saving} className="btn btn-primary"><Save size={16} /> {saving ? "Saving..." : "Create"}</button>
        </div>
      </form>
    </div>
  );
}
