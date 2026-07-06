"use client";

import { useTranslation } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Plus, Trash2 } from "lucide-react";
interface Shift {
  id: number;
  staff_id: number;
  staff_name?: string;
  shift_template_id: number;
  template_name?: string;
  shift_date: string;
  start_time: string;
  end_time: string;
}
interface Template {
  id: number;
  store_id: number;
  name: string;
  start_time: string;
  end_time: string;
}
interface Staff {
  id: number;
  display_name: string;
  store_id: number;
}
interface Store {
  id: number;
  store_name: string;
}
export default function StaffShiftsPage() {
  const {
    t
  } = useTranslation();
  const [items, setItems] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [form, setForm] = useState({
    staff_id: "",
    shift_template_id: "",
    shift_date: ""
  });
  const [tplForm, setTplForm] = useState({
    name: "",
    start_time: "",
    end_time: "",
    store_id: ""
  });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api.get<Store[]>("/admin/stores?per_page=50").then(d => setStores(Array.isArray(d) ? d : [])).catch((err: any) => {
      console.error("Failed to load stores:", err);
    });
  }, []);
  useEffect(() => {
    if (!storeId) return;
    api.get<any>(`/admin/staff/shifts?store_id=${storeId}&per_page=200`).then(d => setItems(Array.isArray(d) ? d : d.items || [])).catch((err: any) => {
      setError("Failed to load shifts");
      console.error(err);
    }).finally(() => setLoading(false));
    api.get<any>(`/admin/staff/shift-templates?store_id=${storeId}`).then(d => setTemplates(Array.isArray(d) ? d : [])).catch((err: any) => {
      console.error("Failed to load templates:", err);
    });
    api.get<any>(`/admin/staff?store_id=${storeId}&per_page=200`).then(d => setStaffList(Array.isArray(d) ? d : d.items || [])).catch((err: any) => {
      console.error("Failed to load staff list:", err);
    });
  }, [storeId]);
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/admin/staff/shifts", {
        staff_id: Number(form.staff_id),
        shift_template_id: form.shift_template_id ? Number(form.shift_template_id) : null,
        shift_date: form.shift_date,
        store_id: Number(storeId),
        status: "scheduled"
      });
      setShowForm(false);
      setForm({
        staff_id: "",
        shift_template_id: "",
        shift_date: ""
      });
      // refresh
      api.get<any>(`/admin/staff/shifts?store_id=${storeId}&per_page=200`).then(d => setItems(Array.isArray(d) ? d : d.items || [])).catch((err: any) => {
        console.error("Failed to refresh shifts after create:", err);
      });
    } catch (e: any) {
      console.error("Failed to create shift:", e);
    } finally {
      setSaving(false);
    }
  };
  const handleCreateTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/admin/staff/shift-templates", {
        ...tplForm,
        store_id: Number(storeId)
      });
      setShowTemplateForm(false);
      setTplForm({
        name: "",
        start_time: "",
        end_time: "",
        store_id: ""
      });
      api.get<any>(`/admin/staff/shift-templates?store_id=${storeId}`).then(d => setTemplates(Array.isArray(d) ? d : [])).catch((err: any) => {
        console.error("Failed to refresh templates:", err);
      });
    } catch (e: any) {
      console.error("Failed to create template:", e);
    } finally {
      setSaving(false);
    }
  };
  const handleDelete = async (id: number) => {
    if (!confirm("Delete?")) return;
    setDeletingId(id);
    try {
      await api.del(`/admin/staff/shifts/${id}`);
      api.get<any>(`/admin/staff/shifts?store_id=${storeId}&per_page=200`).then(d => setItems(Array.isArray(d) ? d : d.items || [])).catch((err: any) => {
        console.error("Failed to refresh shifts after delete:", err);
      });
    } catch (e: any) {
      console.error("Failed to delete shift:", e);
    } finally {
      setDeletingId(null);
    }
  };
  return <div style={{
    padding: 32
  }}>
      <div className="page-header"><div><h1 className="page-title">{t("staff_shifts.staff_shifts")}</h1><p className="page-subtitle">{storeId ? `${items.length} assignments` : "Select a store"}</p></div><div style={{
        display: "flex",
        gap: 8
      }}><button type="button" onClick={() => setShowTemplateForm(true)} className="btn btn-outline btn-sm"><Plus size={14} />{t("staff_shifts.template")}</button><button type="button" onClick={() => setShowForm(true)} disabled={!storeId || templates.length === 0} className="btn btn-primary btn-sm" title={!storeId ? "Select a store first" : templates.length === 0 ? "Create a template first" : ""}><Plus size={14} />{t("staff_shifts.assign")}</button></div></div>

      <div style={{
      marginBottom: 16,
      display: "flex",
      gap: 12,
      alignItems: "center"
    }}>
        <select value={storeId} onChange={e => setStoreId(e.target.value)} style={{
        padding: "6px 12px",
        fontSize: 13,
        borderRadius: "var(--radius-sm)",
        border: "1px solid var(--color-border-light)"
      }}>
          <option value="">{t("staff_shifts.please_select_a_store")}</option>{stores.map(s => <option key={s.id} value={s.id}>{s.store_name}</option>)}
        </select>
      </div>

      {/* Instructions */}
      {storeId && <div style={{
      marginBottom: 16,
      padding: 14,
      borderRadius: 10,
      background: "rgba(59,74,26,0.04)",
      border: "1px solid rgba(59,74,26,0.1)",
      fontSize: 13,
      lineHeight: 1.6
    }}>
          <strong>{t("staff_shifts.how_it_works")}</strong>{t("staff_shifts.shifts_are_defined_per_store_as")}<br />
          <span style={{
        opacity: 0.6
      }}>{t("staff_shifts.create_a_shift_template_assign_staff")}</span>
        </div>}

      {/* Shift Templates */}
      {!loading && storeId && templates.length === 0 ? <div style={{
      marginBottom: 16,
      padding: 16,
      borderRadius: 10,
      background: "#FFF7ED",
      border: "1px solid #FED7AA",
      fontSize: 13
    }}>
          <strong>{t("staff_shifts.no_shift_templates_yet")}</strong>{t("staff_shifts.you_need_at_least_one_template")}<br />
          <button type="button" onClick={() => setShowTemplateForm(true)} style={{
        marginTop: 8,
        fontSize: 12,
        background: "none",
        border: "none",
        color: "var(--color-primary)",
        cursor: "pointer",
        fontWeight: 600,
        textDecoration: "underline"
      }}>{t("staff_shifts.create_your_first_template")}</button>
        </div> : templates.length > 0 && <div style={{
      marginBottom: 20,
      display: "flex",
      gap: 8,
      flexWrap: "wrap"
    }}>
          {templates.map(t => <div key={t.id} style={{
        padding: "6px 14px",
        borderRadius: 8,
        background: "rgba(59,74,26,0.06)",
        fontSize: 12,
        fontWeight: 600
      }}>{t.name}: {t.start_time}–{t.end_time}</div>)}
        </div>}

      {/* Create Template Modal */}
      {showTemplateForm && <div className="card" style={{
      padding: 20,
      marginBottom: 16,
      maxWidth: 400
    }}>
          <h4 style={{
        margin: "0 0 12px"
      }}>{t("staff_shifts.new_shift_template")}</h4>
          <form onSubmit={handleCreateTemplate}>
            <div className="df-grid">
              <div className="df-field" style={{
            gridColumn: "1/-1"
          }}>
                <label className="form-label">{t("staff_shifts.name")}</label>
                <input value={tplForm.name} onChange={e => setTplForm({
              ...tplForm,
              name: e.target.value
            })} placeholder={t("staff_shifts.morning_evening_midnight")} required className="w-full border rounded px-3 py-2 text-sm" />
              </div>
              <div className="df-field"><label className="form-label">{t("staff_shifts.start")}</label><input type="time" value={tplForm.start_time} onChange={e => setTplForm({
              ...tplForm,
              start_time: e.target.value
            })} required className="w-full border rounded px-3 py-2 text-sm" /></div>
              <div className="df-field"><label className="form-label">{t("staff_shifts.end")}</label><input type="time" value={tplForm.end_time} onChange={e => setTplForm({
              ...tplForm,
              end_time: e.target.value
            })} required className="w-full border rounded px-3 py-2 text-sm" /></div>
            </div>
            <div className="df-actions"><button type="button" onClick={() => setShowTemplateForm(false)} className="btn btn-ghost">{t("staff_shifts.cancel")}</button><button type="submit" disabled={saving} className="btn btn-primary"><Plus size={14} />{t("staff_shifts.create")}</button></div>
          </form>
        </div>}

      {/* Assign Shift Modal */}
      {showForm && <div className="card" style={{
      padding: 20,
      marginBottom: 16,
      maxWidth: 400
    }}>
          <h4 style={{
        margin: "0 0 12px"
      }}>{t("staff_shifts.assign_staff_to_shift")}</h4>
          <form onSubmit={handleCreate}>
            <div className="df-grid">
              <div className="df-field" style={{
            gridColumn: "1/-1"
          }}>
                <label className="form-label">{t("staff_shifts.template_2")}</label>
                <select value={form.shift_template_id} onChange={e => setForm({
              ...form,
              shift_template_id: e.target.value
            })} required className="w-full border rounded px-3 py-2 text-sm">
                  <option value="">{t("staff_shifts.select_shift")}</option>{templates.map(t => <option key={t.id} value={t.id}>{t.name} ({t.start_time}–{t.end_time})</option>)}
                </select>
              </div>
              <div className="df-field" style={{
            gridColumn: "1/-1"
          }}>
                <label className="form-label">{t("staff_shifts.staff")}</label>
                <select value={form.staff_id} onChange={e => setForm({
              ...form,
              staff_id: e.target.value
            })} required className="w-full border rounded px-3 py-2 text-sm">
                  <option value="">{t("staff_shifts.select_staff")}</option>{staffList.map(s => <option key={s.id} value={s.id}>{s.display_name}</option>)}
                </select>
              </div>
              <div className="df-field" style={{
            gridColumn: "1/-1"
          }}>
                <label className="form-label">{t("staff_shifts.date")}</label>
                <input type="date" value={form.shift_date} onChange={e => setForm({
              ...form,
              shift_date: e.target.value
            })} required className="w-full border rounded px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="df-actions"><button type="button" onClick={() => setShowForm(false)} className="btn btn-ghost">{t("staff_shifts.cancel_2")}</button><button type="submit" disabled={saving} className="btn btn-primary"><Plus size={14} />{t("staff_shifts.assign_2")}</button></div>
          </form>
        </div>}

      {error && <div className="alert alert-error">{error}</div>}

      <div className="table-header-bar"><span style={{
        fontSize: 13,
        fontWeight: 600
      }}>{t("staff_shifts.assignments")}</span></div>
      <div className="table-container"><table className="data-table">
        <thead><tr><th>{t("staff_shifts.staff_2")}</th><th>{t("staff_shifts.shift_template")}</th><th>{t("staff_shifts.date_2")}</th><th>{t("staff_shifts.time")}</th><th></th></tr></thead>
        <tbody>
          {!storeId ? <tr><td colSpan={5} className="data-table-empty">{t("staff_shifts.select_a_store_above_to_view")}</td></tr> : loading ? <tr><td colSpan={5} className="data-table-empty">{t("staff_shifts.loading")}</td></tr> : items.length === 0 ? <tr><td colSpan={5} className="data-table-empty">{t("staff_shifts.no_shifts_assigned_yet")}</td></tr> : items.map(s => <tr key={s.id}>
              <td style={{
              fontWeight: 600
            }}>{s.staff_name || `#${s.staff_id}`}</td>
              <td>{s.template_name || "—"}</td>
              <td>{s.shift_date}</td>
              <td>{s.start_time} – {s.end_time}</td>
              <td><button type="button" onClick={() => handleDelete(s.id)} disabled={deletingId === s.id} className="btn btn-ghost btn-sm" style={{
                color: deletingId === s.id ? "var(--color-text-muted)" : "var(--color-error)"
              }}><Trash2 size={14} /></button></td>
            </tr>)}
        </tbody>
      </table></div>
    </div>;
}