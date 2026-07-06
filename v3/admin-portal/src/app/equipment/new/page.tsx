"use client";

import { useTranslation } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ArrowLeft, Save } from "lucide-react";
export default function NewEquipmentPage() {
  const {
    t
  } = useTranslation();
  const router = useRouter();
  const [stores, setStores] = useState<any[]>([]);
  const [form, setForm] = useState<Record<string, any>>({
    store_id: "",
    name: "",
    equipment_type: "general",
    serial_number: "",
    manufacturer: "",
    model: "",
    location: "",
    purchase_date: "",
    warranty_expiry: "",
    status: "operational",
    last_maintenance_date: "",
    next_maintenance_date: "",
    notes: "",
    is_active: true
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    api.getRaw<any>("/admin/stores?per_page=50").then(d => setStores(Array.isArray(d) ? d : d.items || [])).catch(e => {
      console.error('stores:', e);
    });
  }, []);
  const update = (k: string, v: any) => setForm(p => ({
    ...p,
    [k]: v
  }));
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form
      };
      const n = Number(payload.store_id);
      payload.store_id = Number.isNaN(n) ? null : n;
      const r: any = await api.post("/admin/equipment", payload);
      const id = r?.id;
      if (id) router.push(`/equipment/${id}`);
    } catch (e: any) {
      setError(e?.message || "Failed to create equipment");
    } finally {
      setSaving(false);
    }
  };
  const inputClass = "w-full border rounded px-3 py-2 text-sm";
  const labelClass = "block text-xs font-semibold text-gray-500 uppercase mb-1";
  return <div style={{
    padding: 32
  }}>
      <div style={{
      display: "flex",
      alignItems: "center",
      gap: 12,
      marginBottom: 20
    }}>
        <button onClick={() => router.push("/equipment")} className="btn btn-ghost btn-sm"><ArrowLeft size={18} /></button>
        <div><h1 className="page-title" style={{
          margin: 0
        }}>{t("equipment_new.new_equipment")}</h1></div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <form onSubmit={handleSubmit} className="card" style={{
      padding: 24,
      maxWidth: 720
    }}>
        <div className="df-grid">
          <div className="df-field">
            <label className={labelClass}>{t("equipment_new.store")}</label>
            <select required className={inputClass} value={form.store_id} onChange={e => update("store_id", e.target.value)}>
              <option value="">{t("equipment_new.select_store")}</option>
              {stores.map((s: any) => <option key={s.id} value={s.id}>{s.store_name}</option>)}
            </select>
          </div>
          <div className="df-field">
            <label className={labelClass}>{t("equipment_new.name")}</label>
            <input required className={inputClass} value={form.name} onChange={e => update("name", e.target.value)} />
          </div>
          <div className="df-field">
            <label className={labelClass}>{t("equipment_new.type")}</label>
            <input className={inputClass} value={form.equipment_type} onChange={e => update("equipment_type", e.target.value)} />
          </div>
          <div className="df-field">
            <label className={labelClass}>{t("equipment_new.serial_number")}</label>
            <input className={inputClass} value={form.serial_number} onChange={e => update("serial_number", e.target.value)} />
          </div>
          <div className="df-field">
            <label className={labelClass}>{t("equipment_new.manufacturer")}</label>
            <input className={inputClass} value={form.manufacturer} onChange={e => update("manufacturer", e.target.value)} />
          </div>
          <div className="df-field">
            <label className={labelClass}>{t("equipment_new.model")}</label>
            <input className={inputClass} value={form.model} onChange={e => update("model", e.target.value)} />
          </div>
          <div className="df-field">
            <label className={labelClass}>{t("equipment_new.location")}</label>
            <input className={inputClass} value={form.location} onChange={e => update("location", e.target.value)} />
          </div>
          <div className="df-field">
            <label className={labelClass}>{t("equipment_new.status")}</label>
            <select className={inputClass} value={form.status} onChange={e => update("status", e.target.value)}>
              <option value="operational">{t("equipment_new.operational")}</option>
              <option value="maintenance">{t("equipment_new.maintenance")}</option>
              <option value="broken">{t("equipment_new.broken")}</option>
              <option value="retired">{t("equipment_new.retired")}</option>
            </select>
          </div>
          <div className="df-field">
            <label className={labelClass}>{t("equipment_new.purchase_date")}</label>
            <input type="date" className={inputClass} value={form.purchase_date} onChange={e => update("purchase_date", e.target.value)} />
          </div>
          <div className="df-field">
            <label className={labelClass}>{t("equipment_new.warranty_expiry")}</label>
            <input type="date" className={inputClass} value={form.warranty_expiry} onChange={e => update("warranty_expiry", e.target.value)} />
          </div>
          <div className="df-field">
            <label className={labelClass}>{t("equipment_new.last_maintenance")}</label>
            <input type="date" className={inputClass} value={form.last_maintenance_date} onChange={e => update("last_maintenance_date", e.target.value)} />
          </div>
          <div className="df-field">
            <label className={labelClass}>{t("equipment_new.next_maintenance")}</label>
            <input type="date" className={inputClass} value={form.next_maintenance_date} onChange={e => update("next_maintenance_date", e.target.value)} />
          </div>
          <div className="df-field" style={{
          gridColumn: "1/-1"
        }}>
            <label className={labelClass}>{t("equipment_new.notes")}</label>
            <textarea rows={3} className={inputClass} value={form.notes} onChange={e => update("notes", e.target.value)} />
          </div>
        </div>
        <div className="df-actions" style={{
        marginTop: 16
      }}>
          <button type="button" onClick={() => router.push("/equipment")} className="btn btn-ghost">{t("equipment_new.cancel")}</button>
          <button type="submit" disabled={saving} className="btn btn-primary"><Save size={16} /> {saving ? "Saving..." : "Create"}</button>
        </div>
      </form>
    </div>;
}