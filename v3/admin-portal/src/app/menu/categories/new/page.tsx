"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ArrowLeft, Save } from "lucide-react";

export default function NewCategoryPage() {
  const router = useRouter();
  const [form, setForm] = useState({ category_name: "", slug: "", description: "", is_available: true, category_type: "regular", available_from_time: "", available_to_time: "", available_from_date: "", available_to_date: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError("");
    try {
      const payload: Record<string, unknown> = { ...form };
      if (!payload.slug) payload.slug = (payload.category_name as string).toLowerCase().replace(/[^a-z0-9]/g, "-");
      if (!payload.available_from_time) payload.available_from_time = null;
      if (!payload.available_to_time) payload.available_to_time = null;
      if (!payload.available_from_date) payload.available_from_date = null;
      if (!payload.available_to_date) payload.available_to_date = null;
      const r: any = await api.post("/admin/menu/categories", payload);
      const id = r?.id;
      if (id) router.push(`/menu/categories/${id}`);
    } catch (e: any) { setError(e.message || "Save failed"); console.error(e); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ padding: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={() => router.push("/menu/categories")} className="btn btn-ghost btn-sm"><ArrowLeft size={18} /></button>
        <h1 className="page-title" style={{ margin: 0 }}>New Category</h1>
      </div>
      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="card" style={{ padding: 24, maxWidth: 500 }}>
          <div className="df-grid">
            <div className="df-field"><label className="form-label">Name *</label><input required className="w-full border rounded px-3 py-2 text-sm" value={form.category_name} onChange={e => setForm({ ...form, category_name: e.target.value })} /></div>
            <div className="df-field"><label className="form-label">Slug</label><input className="w-full border rounded px-3 py-2 text-sm" value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value })} placeholder="auto-generated" /></div>
            <div className="df-field" style={{ gridColumn: "1/-1" }}><label className="form-label">Description</label><input className="w-full border rounded px-3 py-2 text-sm" value={form.description || ""} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
            <div className="df-field"><label className="form-label">Category Type</label><select className="w-full border rounded px-3 py-2 text-sm" value={form.category_type} onChange={e => setForm({ ...form, category_type: e.target.value })}><option value="regular">Regular</option><option value="combo">Combo (shows first)</option></select></div>
            <div className="df-field"><label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}><input type="checkbox" checked={form.is_available} onChange={e => setForm({ ...form, is_available: e.target.checked })} /> Active</label></div>
          </div>
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--color-border-light)" }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: "var(--color-text-muted)" }}>Availability Window (optional)</div>
            <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginBottom: 12 }}>Leave empty to always show. Set time-of-day for breakfast/lunch combos, or date range for seasonal combos (Christmas, CNY, etc).</div>
            <div className="df-grid">
              <div className="df-field"><label className="form-label">Available From (time)</label><input type="time" className="w-full border rounded px-3 py-2 text-sm" value={form.available_from_time || ""} onChange={e => setForm({ ...form, available_from_time: e.target.value })} /></div>
              <div className="df-field"><label className="form-label">Available To (time)</label><input type="time" className="w-full border rounded px-3 py-2 text-sm" value={form.available_to_time || ""} onChange={e => setForm({ ...form, available_to_time: e.target.value })} /></div>
              <div className="df-field"><label className="form-label">Available From (date)</label><input type="date" className="w-full border rounded px-3 py-2 text-sm" value={form.available_from_date || ""} onChange={e => setForm({ ...form, available_from_date: e.target.value })} /></div>
              <div className="df-field"><label className="form-label">Available To (date)</label><input type="date" className="w-full border rounded px-3 py-2 text-sm" value={form.available_to_date || ""} onChange={e => setForm({ ...form, available_to_date: e.target.value })} /></div>
            </div>
          </div>
          <div className="df-actions"><button type="button" onClick={() => router.push("/menu/categories")} className="btn btn-ghost">Cancel</button><button type="submit" disabled={saving} className="btn btn-primary"><Save size={16} /> {saving ? "Saving..." : "Create"}</button></div>
        </div>
      </form>
    </div>
  );
}
