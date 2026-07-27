"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import { Plus, Trash2, CheckCircle, RefreshCw } from "lucide-react";

interface Task {
  id: number;
  store_id: number;
  store_name?: string;
  staff_id: number;
  staff_name?: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  due_date: string | null;
  recur_interval_days: number | null;
  completed_at: string | null;
  created_at: string;
}
interface StaffMember { id: number; display_name: string; store_id: number; }
interface Store { id: number; store_name: string; }

const PRIORITIES = ["low", "normal", "high", "urgent"] as const;
const STATUSES = ["pending", "in_progress", "completed", "cancelled"] as const;
const RECURRENCE = [
  { value: "", key: "one_off" },
  { value: "1", key: "daily" },
  { value: "7", key: "weekly" },
  { value: "30", key: "monthly" },
] as const;

export default function StaffTasksPage() {
  const { t } = useTranslation();
  const [items, setItems] = useState<Task[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [storeFilter, setStoreFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ staff_id: "", title: "", description: "", priority: "normal", due_date: "", recur: "" });

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams();
      if (storeFilter) qs.set("store_id", storeFilter);
      if (statusFilter) qs.set("status", statusFilter);
      qs.set("per_page", "100");
      const d = await api.getRaw<{ items: Task[] }>(`/admin/staff/tasks?${qs.toString()}`);
      setItems(d?.items || []);
    } catch (e: any) {
      setError(e.message || t("admin.errors.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [storeFilter, statusFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => {
    api.get<Store[]>("/admin/stores?per_page=50").then(d => setStores(Array.isArray(d) ? d : (d as any).items || [])).catch(e => console.error('stores:', e));
    api.getRaw<{ items: StaffMember[] }>("/admin/staff?per_page=100").then(d => setStaff((d?.items || []).filter((s: any) => s.is_active !== false))).catch(e => console.error('staff:', e));
  }, []);

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 4000); };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.staff_id || !form.title) return;
    setSaving(true);
    try {
      const member = staff.find(s => String(s.id) === form.staff_id);
      await api.post("/admin/staff/tasks", {
        store_id: member?.store_id || Number(storeFilter) || 1,
        staff_id: Number(form.staff_id),
        title: form.title,
        description: form.description || null,
        priority: form.priority,
        due_date: form.due_date || null,
        recur_interval_days: form.recur ? Number(form.recur) : null,
      });
      setShowForm(false);
      setForm({ staff_id: "", title: "", description: "", priority: "normal", due_date: "", recur: "" });
      flash(t("staff_tasks.created"));
      fetchData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (task: Task, status: string) => {
    try {
      await api.patch(`/admin/staff/tasks/${task.id}`, { status });
      flash(t("staff_tasks.updated"));
      fetchData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm(t("common.confirm_delete"))) return;
    try {
      await api.del(`/admin/staff/tasks/${id}`);
      flash(t("staff_tasks.deleted"));
      fetchData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const recurLabel = (days: number | null) => {
    if (!days) return "—";
    const found = RECURRENCE.find(r => r.value === String(days));
    return found ? t(`staff_tasks.recur_${found.key}`) : t("staff_tasks.recur_every_n", { n: days });
  };

  const prioColor: Record<string, string> = { low: "badge-gray", normal: "badge-blue", high: "badge-yellow", urgent: "badge-red" };
  const statusColor: Record<string, string> = { pending: "badge-yellow", in_progress: "badge-blue", completed: "badge-green", cancelled: "badge-gray" };

  return (
    <div style={{ padding: 32 }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t("staff_tasks.staff_tasks")}</h1>
          <p className="page-subtitle">{t("staff_tasks.total_count", { count: items.length })}</p>
        </div>
        <button type="button" onClick={() => setShowForm(true)} className="btn btn-primary btn-sm">
          <Plus size={16} />{t("staff_tasks.new_task")}
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {msg && <div className="alert alert-success">{msg}</div>}

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <select value={storeFilter} onChange={e => setStoreFilter(e.target.value)} style={{ padding: "6px 12px", fontSize: 13, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-light)" }}>
          <option value="">{t("admin.common.allStores")}</option>
          {stores.map(s => <option key={s.id} value={s.id}>{s.store_name}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ padding: "6px 12px", fontSize: 13, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-light)" }}>
          <option value="">{t("staff_tasks.all_status")}</option>
          {STATUSES.map(s => <option key={s} value={s}>{t(`staff_tasks.status_${s}`)}</option>)}
        </select>
      </div>

      {showForm && (
        <>
          <div className="drawer-overlay" onClick={() => setShowForm(false)} />
          <div className="drawer" style={{ width: 480 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
              <h3 style={{ margin: 0 }}>{t("staff_tasks.new_task")}</h3>
              <button onClick={() => setShowForm(false)} className="btn btn-ghost btn-sm">✕</button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="df-grid">
                <div className="df-field" style={{ gridColumn: "1/-1" }}>
                  <label className="df-label">{t("staff_tasks.assign_to")} *</label>
                  <select value={form.staff_id} onChange={e => setForm({ ...form, staff_id: e.target.value })} style={{ width: "100%" }} required>
                    <option value="">{t("staff_tasks.select_staff")}</option>
                    {staff.map(s => <option key={s.id} value={s.id}>{s.display_name}</option>)}
                  </select>
                </div>
                <div className="df-field" style={{ gridColumn: "1/-1" }}>
                  <label className="df-label">{t("staff_tasks.task_title")} *</label>
                  <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder={t("staff_tasks.title_placeholder")} required />
                </div>
                <div className="df-field" style={{ gridColumn: "1/-1" }}>
                  <label className="df-label">{t("staff_tasks.description")}</label>
                  <textarea rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
                </div>
                <div className="df-field">
                  <label className="df-label">{t("staff_tasks.priority")}</label>
                  <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })} style={{ width: "100%" }}>
                    {PRIORITIES.map(p => <option key={p} value={p}>{t(`staff_tasks.priority_${p}`)}</option>)}
                  </select>
                </div>
                <div className="df-field">
                  <label className="df-label">{t("staff_tasks.due_date")}</label>
                  <input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} />
                </div>
                <div className="df-field" style={{ gridColumn: "1/-1" }}>
                  <label className="df-label">{t("staff_tasks.recurrence")}</label>
                  <select value={form.recur} onChange={e => setForm({ ...form, recur: e.target.value })} style={{ width: "100%" }}>
                    {RECURRENCE.map(r => <option key={r.value} value={r.value}>{t(`staff_tasks.recur_${r.key}`)}</option>)}
                  </select>
                  <div className="df-hint">{t("staff_tasks.recurrence_hint")}</div>
                </div>
              </div>
              <button type="submit" disabled={saving} className="btn btn-primary" style={{ marginTop: 16, width: "100%" }}>
                {saving ? "…" : t("staff_tasks.create")}
              </button>
            </form>
          </div>
        </>
      )}

      <div className="table-header-bar"><span className="text-sm font-semibold">{t("staff_tasks.total_count", { count: items.length })}</span></div>
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t("staff_tasks.task_title")}</th>
              <th>{t("staff_tasks.assign_to")}</th>
              <th>{t("staff_tasks.priority")}</th>
              <th>{t("staff_tasks.due_date")}</th>
              <th>{t("staff_tasks.recurrence")}</th>
              <th>{t("staff_tasks.status")}</th>
              <th style={{ width: 150 }}>{t("staff_tasks.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="data-table-empty">{t("staff_tasks.loading")}</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={7} className="data-table-empty">{t("staff_tasks.no_tasks")}</td></tr>
            ) : items.map(task => (
              <tr key={task.id}>
                <td>
                  <strong style={{ fontSize: 13 }}>{task.title}</strong>
                  {task.description && <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{task.description}</div>}
                </td>
                <td>
                  {task.staff_name || `#${task.staff_id}`}
                  <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{task.store_name || `#${task.store_id}`}</div>
                </td>
                <td><span className={`badge badge-sm ${prioColor[task.priority] || "badge-gray"}`} style={{ textTransform: "capitalize" }}>{t(`staff_tasks.priority_${task.priority}`)}</span></td>
                <td style={{ fontSize: 12 }}>{task.due_date || "—"}</td>
                <td style={{ fontSize: 12 }}>
                  {task.recur_interval_days ? (
                    <span className="badge badge-sm badge-blue"><RefreshCw size={10} /> {recurLabel(task.recur_interval_days)}</span>
                  ) : "—"}
                </td>
                <td><span className={`badge badge-sm ${statusColor[task.status] || "badge-gray"}`} style={{ textTransform: "capitalize" }}>{t(`staff_tasks.status_${task.status}`)}</span></td>
                <td>
                  <div style={{ display: "flex", gap: 6 }}>
                    {task.status === "pending" && (
                      <button onClick={() => setStatus(task, "in_progress")} className="btn btn-ghost btn-sm" title={t("staff_tasks.start")} style={{ fontSize: 11 }}>
                        {t("staff_tasks.start")}
                      </button>
                    )}
                    {task.status !== "completed" && task.status !== "cancelled" && (
                      <button onClick={() => setStatus(task, "completed")} className="btn btn-ghost btn-sm" title={t("staff_tasks.mark_complete")}>
                        <CheckCircle size={14} />
                      </button>
                    )}
                    <button onClick={() => handleDelete(task.id)} className="btn btn-ghost btn-sm" style={{ color: "var(--color-error)" }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
