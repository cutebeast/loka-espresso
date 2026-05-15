"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ArrowLeft, Save } from "lucide-react";

interface Store { id: number; store_name: string; }

export default function NewCategoryPage() {
  const router = useRouter();
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ category_name: "", slug: "", description: "", is_active: true });

  useEffect(() => {
    api.getRaw<any>("/admin/stores?per_page=50").then(d => { const list = d.items || []; setStores(list); if (list.length > 0) setStoreId(String(list[0].id)); }).catch(()=>{});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => { e.preventDefault(); setSaving(true);
    try {
      if (!form.slug) form.slug = form.category_name.toLowerCase().replace(/[^a-z0-9]/g, "-");
      const r: any = await api.post("/admin/inventory/categories", { ...form, store_id: Number(storeId) });
      const id = r?.data?.id || r?.id;
      if (id) router.push(`/inventory/categories/${id}`);
      else router.push("/inventory/categories");
    } catch (err: any) { setError(err.message); } finally { setSaving(false); }
  };

  return (
    <div style={{ padding: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={() => router.push("/inventory/categories")} className="btn btn-ghost btn-sm"><ArrowLeft size={18} /></button>
        <h1 className="page-title" style={{ margin: 0 }}>New Category</h1>
      </div>
      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="card" style={{ padding: 24, maxWidth: 500 }}>
          <div className="df-grid">
            <div className="df-field"><label className="form-label">Name *</label><input required className="w-full border rounded px-3 py-2 text-sm" value={form.category_name} onChange={e => setForm({ ...form, category_name: e.target.value })} /></div>
            <div className="df-field"><label className="form-label">Slug</label><input className="w-full border rounded px-3 py-2 text-sm" value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value })} placeholder="auto-generated" /></div>
            <div className="df-field" style={{ gridColumn: "1/-1" }}><label className="form-label">Description</label><input className="w-full border rounded px-3 py-2 text-sm" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
            <div className="df-field"><label className="form-label">Store</label><select value={storeId} onChange={e => setStoreId(e.target.value)} className="w-full border rounded px-3 py-2 text-sm">{stores.map(s => <option key={s.id} value={s.id}>{s.store_name}</option>)}</select></div>
            <div className="df-field"><label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}><input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} /> Active</label></div>
          </div>
          <div className="df-actions"><button type="button" onClick={() => router.push("/inventory/categories")} className="btn btn-ghost">Cancel</button><button type="submit" disabled={saving} className="btn btn-primary"><Save size={16} /> {saving ? "Saving..." : "Create"}</button></div>
        </div>
      </form>
    </div>
  );
}
