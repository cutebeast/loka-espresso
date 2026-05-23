"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ArrowLeft, Save, Plus, Trash2 } from "lucide-react";

interface MaintenanceLog {
  id: number;
  maintenance_type: string;
  status: string;
  description: string;
  performed_by: string;
  cost: number;
  started_at: string;
  completed_at: string;
  notes: string;
}

export default function EquipmentEditPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [form, setForm] = useState<Record<string, any>>({});
  const [logs, setLogs] = useState<MaintenanceLog[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [showLogForm, setShowLogForm] = useState(false);
  const [logForm, setLogForm] = useState<Record<string, any>>({
    maintenance_type: "preventive", status: "scheduled", description: "",
    performed_by: "", cost: "", started_at: "", completed_at: "", notes: "",
  });

  const loadEquipment = async () => {
    setLoading(true);
    try {
      const d = await api.getRaw<any>(`/admin/equipment/${id}`);
      setForm(d);
      setLogs(d.maintenance_logs || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    api.getRaw<any>("/admin/stores?per_page=50").then(d => setStores(Array.isArray(d)?d:(d.items||[]))).catch((e)=>{console.error('stores:',e)});
    loadEquipment();
  }, [id]);

  const update = (k: string, v: unknown) => setForm(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { ...form };
      delete payload.id;
      delete payload.created_at;
      delete payload.updated_at;
      delete payload.maintenance_logs;
      await api.patch(`/admin/equipment/${id}`, payload);
      setMsg("Saved"); setTimeout(() => setMsg(""), 2000);
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  const handleAddLog = async () => {
    try {
      const payload: any = { ...logForm };
      if (payload.cost) payload.cost = Number(payload.cost);
      await api.post(`/admin/equipment/${id}/maintenance-logs`, payload);
      setShowLogForm(false);
      setLogForm({ maintenance_type: "preventive", status: "scheduled", description: "", performed_by: "", cost: "", started_at: "", completed_at: "", notes: "" });
      loadEquipment();
      setMsg("Maintenance log added"); setTimeout(() => setMsg(""), 2000);
    } catch (e) { console.error(e); }
  };

  const handleDeleteLog = async (logId: number) => {
    if (!confirm("Delete this maintenance log?")) return;
    setDeletingLogId(logId);
    try {
      await api.del(`/admin/equipment/${id}/maintenance-logs/${logId}`);
      loadEquipment();
    } catch (e) { console.error(e); } finally { setDeletingLogId(null); }
  };

  const [deletingLogId, setDeletingLogId] = useState<number | null>(null);

  const inputClass = "w-full border rounded px-3 py-2 text-sm";
  const labelClass = "block text-xs font-semibold text-gray-500 uppercase mb-1";

  if (loading) return <div style={{ padding: 32 }}>Loading...</div>;

  return (
    <div style={{ padding: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={() => router.push("/equipment")} className="btn btn-ghost btn-sm"><ArrowLeft size={18} /></button>
        <div><h1 className="page-title" style={{ margin: 0 }}>{form.name || "Equipment"}</h1></div>
      </div>
      {msg && <div className="alert alert-success" style={{ marginBottom: 12 }}>{msg}</div>}

      <div className="card" style={{ padding: 24, maxWidth: 720, marginBottom: 24 }}>
        <h3 style={{ marginBottom: 16, fontSize: 16 }}>Details</h3>
        <div className="df-grid">
          <div className="df-field">
            <label className={labelClass}>Store</label>
            <select className={inputClass} value={form.store_id || ""} onChange={e => update("store_id", Number(e.target.value))}>
              {stores.map((s: any) => <option key={s.id} value={s.id}>{s.store_name}</option>)}
            </select>
          </div>
          <div className="df-field">
            <label className={labelClass}>Name</label>
            <input className={inputClass} value={form.name || ""} onChange={e => update("name", e.target.value)} />
          </div>
          <div className="df-field">
            <label className={labelClass}>Type</label>
            <input className={inputClass} value={form.equipment_type || ""} onChange={e => update("equipment_type", e.target.value)} />
          </div>
          <div className="df-field">
            <label className={labelClass}>Serial Number</label>
            <input className={inputClass} value={form.serial_number || ""} onChange={e => update("serial_number", e.target.value)} />
          </div>
          <div className="df-field">
            <label className={labelClass}>Manufacturer</label>
            <input className={inputClass} value={form.manufacturer || ""} onChange={e => update("manufacturer", e.target.value)} />
          </div>
          <div className="df-field">
            <label className={labelClass}>Model</label>
            <input className={inputClass} value={form.model || ""} onChange={e => update("model", e.target.value)} />
          </div>
          <div className="df-field">
            <label className={labelClass}>Location</label>
            <input className={inputClass} value={form.location || ""} onChange={e => update("location", e.target.value)} />
          </div>
          <div className="df-field">
            <label className={labelClass}>Status</label>
            <select className={inputClass} value={form.status || "operational"} onChange={e => update("status", e.target.value)}>
              <option value="operational">Operational</option>
              <option value="maintenance">Maintenance</option>
              <option value="broken">Broken</option>
              <option value="retired">Retired</option>
            </select>
          </div>
          <div className="df-field">
            <label className={labelClass}>Purchase Date</label>
            <input type="date" className={inputClass} value={form.purchase_date || ""} onChange={e => update("purchase_date", e.target.value)} />
          </div>
          <div className="df-field">
            <label className={labelClass}>Warranty Expiry</label>
            <input type="date" className={inputClass} value={form.warranty_expiry || ""} onChange={e => update("warranty_expiry", e.target.value)} />
          </div>
          <div className="df-field">
            <label className={labelClass}>Last Maintenance</label>
            <input type="date" className={inputClass} value={form.last_maintenance_date || ""} onChange={e => update("last_maintenance_date", e.target.value)} />
          </div>
          <div className="df-field">
            <label className={labelClass}>Next Maintenance</label>
            <input type="date" className={inputClass} value={form.next_maintenance_date || ""} onChange={e => update("next_maintenance_date", e.target.value)} />
          </div>
          <div className="df-field" style={{ gridColumn: "1/-1" }}>
            <label className={labelClass}>Notes</label>
            <textarea rows={3} className={inputClass} value={form.notes || ""} onChange={e => update("notes", e.target.value)} />
          </div>
        </div>
        <div className="df-actions" style={{ marginTop: 16 }}>
          <button type="button" onClick={() => router.push("/equipment")} className="btn btn-ghost">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn btn-primary"><Save size={16} /> {saving ? "Saving..." : "Save Changes"}</button>
        </div>
      </div>

      {/* Maintenance Logs */}
      <div className="card" style={{ padding: 24, maxWidth: 720 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>Maintenance Logs</h3>
          <button onClick={() => setShowLogForm(!showLogForm)} className="btn btn-sm btn-outline"><Plus size={14} /> {showLogForm ? "Cancel" : "Add Log"}</button>
        </div>

        {showLogForm && (
          <div style={{ background: "var(--color-bg-muted)", borderRadius: "var(--radius-md)", padding: 16, marginBottom: 16 }}>
            <div className="df-grid">
              <div className="df-field">
                <label className={labelClass}>Type</label>
                <select className={inputClass} value={logForm.maintenance_type} onChange={e => setLogForm({...logForm, maintenance_type: e.target.value})}>
                  <option value="preventive">Preventive</option>
                  <option value="corrective">Corrective</option>
                  <option value="inspection">Inspection</option>
                  <option value="repair">Repair</option>
                  <option value="replacement">Replacement</option>
                </select>
              </div>
              <div className="df-field">
                <label className={labelClass}>Status</label>
                <select className={inputClass} value={logForm.status} onChange={e => setLogForm({...logForm, status: e.target.value})}>
                  <option value="scheduled">Scheduled</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
              <div className="df-field">
                <label className={labelClass}>Performed By</label>
                <input className={inputClass} value={logForm.performed_by} onChange={e => setLogForm({...logForm, performed_by: e.target.value})} />
              </div>
              <div className="df-field">
                <label className={labelClass}>Cost</label>
                <input type="number" step="0.01" className={inputClass} value={logForm.cost} onChange={e => setLogForm({...logForm, cost: e.target.value})} />
              </div>
              <div className="df-field">
                <label className={labelClass}>Started At</label>
                <input type="datetime-local" className={inputClass} value={logForm.started_at} onChange={e => setLogForm({...logForm, started_at: e.target.value})} />
              </div>
              <div className="df-field">
                <label className={labelClass}>Completed At</label>
                <input type="datetime-local" className={inputClass} value={logForm.completed_at} onChange={e => setLogForm({...logForm, completed_at: e.target.value})} />
              </div>
              <div className="df-field" style={{ gridColumn: "1/-1" }}>
                <label className={labelClass}>Description</label>
                <input className={inputClass} value={logForm.description} onChange={e => setLogForm({...logForm, description: e.target.value})} />
              </div>
              <div className="df-field" style={{ gridColumn: "1/-1" }}>
                <label className={labelClass}>Notes</label>
                <textarea rows={2} className={inputClass} value={logForm.notes} onChange={e => setLogForm({...logForm, notes: e.target.value})} />
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <button onClick={handleAddLog} className="btn btn-primary btn-sm"><Save size={14} /> Save Log</button>
            </div>
          </div>
        )}

        {logs.length === 0 ? (
          <p style={{ color: "var(--color-text-muted)", fontSize: 13 }}>No maintenance logs yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {logs.map(log => (
              <div key={log.id} style={{ background: "var(--color-bg-muted)", borderRadius: "var(--radius-md)", padding: 12, border: "1px solid var(--color-border-light)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{log.maintenance_type} — <span style={{ textTransform: "capitalize" }}>{log.status}</span></div>
                    <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 2 }}>{log.description || "No description"}</div>
                    {log.performed_by && <div style={{ fontSize: 11, marginTop: 4 }}>By: {log.performed_by}</div>}
                    {log.cost != null && <div style={{ fontSize: 11, marginTop: 2 }}>Cost: RM {Number(log.cost).toFixed(2)}</div>}
                    {log.started_at && <div style={{ fontSize: 11, marginTop: 2 }}>{new Date(log.started_at).toLocaleString()}</div>}
                  </div>
                  <button onClick={() => handleDeleteLog(log.id)} disabled={deletingLogId === log.id} className="btn btn-icon btn-ghost" style={{ color: deletingLogId === log.id ? "var(--color-text-muted)" : "var(--color-error)" }}><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
