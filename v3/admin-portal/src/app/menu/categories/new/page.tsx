"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ArrowLeft, Save } from "lucide-react";

export default function NewCategoryPage() {
  const router = useRouter();
  const [form, setForm] = useState({ category_name: "", slug: "", description: "", is_available: true });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    try {
      if (!form.slug) form.slug = form.category_name.toLowerCase().replace(/[^a-z0-9]/g, "-");
      const r: any = await api.post("/admin/menu/categories", form);
      const id = r?.id;
      if (id) router.push(`/menu/categories/${id}`);
    } catch { /* ignore */ }
    finally { setSaving(false); }
  };

  return (
    <div style={{ padding: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={() => router.push("/menu/categories")} className="btn btn-ghost btn-sm"><ArrowLeft size={18} /></button>
        <h1 className="page-title" style={{ margin: 0 }}>New Category</h1>
      </div>
      <form onSubmit={handleSubmit}>
        <div className="card" style={{ padding: 24, maxWidth: 500 }}>
          <div className="df-grid">
            <div className="df-field"><label className="form-label">Name *</label><input required className="w-full border rounded px-3 py-2 text-sm" value={form.category_name} onChange={e => setForm({ ...form, category_name: e.target.value })} /></div>
            <div className="df-field"><label className="form-label">Slug</label><input className="w-full border rounded px-3 py-2 text-sm" value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value })} placeholder="auto-generated" /></div>
            <div className="df-field" style={{ gridColumn: "1/-1" }}><label className="form-label">Description</label><input className="w-full border rounded px-3 py-2 text-sm" value={form.description || ""} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
            <div className="df-field"><label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}><input type="checkbox" checked={form.is_available} onChange={e => setForm({ ...form, is_available: e.target.checked })} /> Active</label></div>
          </div>
          <div className="df-actions"><button type="button" onClick={() => router.push("/menu/categories")} className="btn btn-ghost">Cancel</button><button type="submit" disabled={saving} className="btn btn-primary"><Save size={16} /> {saving ? "Saving..." : "Create"}</button></div>
        </div>
      </form>
    </div>
  );
}
