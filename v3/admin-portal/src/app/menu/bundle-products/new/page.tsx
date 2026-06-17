"use client";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ArrowLeft, Plus, Trash2, Upload, Save } from "lucide-react";

interface MenuItemOption { id: number; item_name: string; base_price: number; category_id: number; }
interface CategoryOption { id: number; category_name: string; }

export default function BundleProductNewPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [imagePreview, setImagePreview] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [menuItems, setMenuItems] = useState<MenuItemOption[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [selectedCat, setSelectedCat] = useState("");

  const [form, setForm] = useState({
    title: "", description: "", bundle_price: "", bundle_type: "combo",
    image_url: "", is_active: true, display_order: 0,
  });

  const [components, setComponents] = useState<Array<{
    menu_item_id: string; default_quantity: number; is_required: boolean;
    is_swappable: boolean; swap_group: string; sort_order: number;
  }>>([]);

  useEffect(() => {
    api.getRaw<any>("/admin/menu/items?per_page=500")
      .then(d => setMenuItems((d?.items || [])))
      .catch((e) => { console.error('menu items:', e); });
    api.getRaw<any>("/admin/menu/categories?per_page=100")
      .then(d => setCategories((d?.items || [])))
      .catch((e) => { console.error('menu categories:', e); });
  }, []);

  const filteredItems = selectedCat
    ? menuItems.filter(i => i.category_id === Number(selectedCat))
    : menuItems;

  const handleUpload = async () => {
    const f = fileRef.current?.files?.[0]; if (!f) return; setUploading(true);
    try {
      const fd = new FormData(); fd.append("file", f);
      const j = await api.upload("/upload/image", fd);
      const url = j.url || j.filename || "";
      setForm({ ...form, image_url: url }); setImagePreview(url);
      if (fileRef.current) fileRef.current.value = "";
    } catch (e: any) { setError(e.message); } finally { setUploading(false); }
  };

  const addComponent = () => setComponents([...components, { menu_item_id: "", default_quantity: 1, is_required: true, is_swappable: false, swap_group: "", sort_order: components.length }]);

  const removeComponent = (idx: number) => setComponents(components.filter((_, i) => i !== idx));

  const updateComponent = (idx: number, field: string, value: any) => {
    setComponents(components.map((c, i) => i === idx ? { ...c, [field]: value } : c));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title) { setError("Title is required"); return; }
    if (!form.bundle_price || Number(form.bundle_price) <= 0) { setError("Valid bundle price is required"); return; }
    if (components.length === 0) { setError("At least one component is required"); return; }
    for (let i = 0; i < components.length; i++) {
      const c = components[i]; if (!c || !c.menu_item_id) { setError(`Component ${i + 1}: select a menu item`); return; }
    }
    setSaving(true);
    try {
      const payload = {
        ...form, bundle_price: Number(form.bundle_price),
        components: components.filter(c => !!c.menu_item_id).map(c => ({
          menu_item_id: Number(c.menu_item_id),
          default_quantity: c.default_quantity,
          is_required: c.is_required,
          is_swappable: c.is_swappable,
          swap_group: c.swap_group ? Number(c.swap_group) : null,
          sort_order: c.sort_order,
          modifier_overrides: [],
        })),
      };
      await api.post("/admin/menu/bundle-products", payload);
      router.push("/menu/bundle-products");
    } catch (err: any) { setError(err.message); } finally { setSaving(false); }
  };

  return (
    <div style={{ padding: 32, height: "100%", overflow: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={() => router.push("/menu/bundle-products")} className="btn btn-ghost btn-sm"><ArrowLeft size={18} /></button>
        <div><h1 className="page-title" style={{ margin: 0 }}>New Bundle Product</h1><p className="page-subtitle" style={{ marginTop: 2 }}>Combo meal combining existing menu items at a special price</p></div>
      </div>
      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="card" style={{ padding: 24, maxWidth: 800 }}>
        <form onSubmit={handleSubmit}>
          <div className="df-grid">
            <div className="df-field" style={{ gridColumn: "1/-1" }}><label className="df-label">Title *</label><input required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. Snack Plate Combo" /></div>
            <div className="df-field"><label className="df-label">Bundle Type</label><select value={form.bundle_type} onChange={e => setForm({ ...form, bundle_type: e.target.value })}><option value="combo">Combo</option></select></div>
            <div className="df-field"><label className="df-label">Bundle Price (RM) *</label><input type="number" step="0.01" min="0" required value={form.bundle_price} onChange={e => setForm({ ...form, bundle_price: e.target.value })} placeholder="0.00" /></div>
            <div className="df-field" style={{ gridColumn: "1/-1" }}><label className="df-label">Description</label><textarea rows={3} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Marketing description for the combo" /></div>
            <div className="df-field" style={{ gridColumn: "1/-1" }}>
              <label className="df-label">Image</label>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <input ref={fileRef} type="file" accept="image/*" onChange={handleUpload} style={{ display: "none" }} />
                <button type="button" onClick={() => fileRef.current?.click()} className="btn btn-sm btn-outline" disabled={uploading}><Upload size={14} /> {uploading ? "Uploading..." : "Upload Image"}</button>
                {imagePreview && <><img src={imagePreview} alt="" style={{ width: 48, height: 48, borderRadius: 6, objectFit: "cover" }} /><button type="button" onClick={() => { setForm({ ...form, image_url: "" }); setImagePreview(""); }} className="btn btn-ghost btn-sm" style={{ color: "var(--color-error)" }}>Clear</button></>}
              </div>
            </div>
            <div className="df-field"><label className="df-label">Display Order</label><input type="number" value={form.display_order} onChange={e => setForm({ ...form, display_order: Number(e.target.value) })} /></div>
            <div className="df-field"><label className="df-label" style={{ display: "flex", alignItems: "center", gap: 8 }}><input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} /> Active</label></div>
          </div>

          <div style={{ marginTop: 24, marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Components</h3>
            <button type="button" onClick={addComponent} className="btn btn-sm btn-outline" style={{ display: "flex", alignItems: "center", gap: 4 }}><Plus size={14} /> Add</button>
          </div>
          {components.length === 0 && <p style={{ fontSize: 13, color: "var(--color-text-muted)" }}>No components added. Click "Add" to include menu items in this bundle.</p>}

          {components.length > 0 && (
            <div style={{ marginBottom: 12, background: "var(--color-bg-muted)", borderRadius: "var(--radius-md)", padding: "10px 14px" }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>Filter by category:</label>
                <select value={selectedCat} onChange={e => setSelectedCat(e.target.value)} style={{ flex: 1, padding: "6px 10px", fontSize: 12, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-light)" }}>
                  <option value="">All categories ({menuItems.length} items)</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.category_name}</option>)}
                </select>
              </div>
            </div>
          )}

          {components.map((c, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, padding: "8px 12px", background: "var(--color-bg-muted)", borderRadius: "var(--radius-md)", flexWrap: "wrap" }}>
              <select value={c.menu_item_id} onChange={e => updateComponent(i, "menu_item_id", e.target.value)} style={{ flex: 1, minWidth: 180, padding: "6px 10px", fontSize: 13, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-light)" }} required>
                <option value="">— Select item —</option>
                {filteredItems.map(m => <option key={m.id} value={m.id}>{m.item_name} (RM {Number(m.base_price || 0).toFixed(2)})</option>)}
              </select>
              <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>Qty: <input type="number" min={1} value={c.default_quantity} onChange={e => updateComponent(i, "default_quantity", Number(e.target.value))} style={{ width: 50, padding: "4px 6px", fontSize: 12, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-light)" }} /></label>
              <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}><input type="checkbox" checked={c.is_required} onChange={e => updateComponent(i, "is_required", e.target.checked)} /> Req</label>
              <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}><input type="checkbox" checked={c.is_swappable} onChange={e => updateComponent(i, "is_swappable", e.target.checked)} /> Swap</label>
              {c.is_swappable && <input type="number" value={c.swap_group} onChange={e => updateComponent(i, "swap_group", e.target.value)} placeholder="group" style={{ width: 60, padding: "4px 6px", fontSize: 12, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-light)" }} />}
              <button type="button" onClick={() => removeComponent(i)} className="btn btn-ghost btn-sm" style={{ color: "var(--color-error)" }}><Trash2 size={14} /></button>
            </div>
          ))}

          <div className="df-actions" style={{ marginTop: 20 }}><button type="button" onClick={() => router.push("/menu/bundle-products")} className="btn btn-ghost">Cancel</button><button type="submit" className="btn btn-primary" disabled={saving}><Save size={16} /> {saving ? "Creating..." : "Create Bundle"}</button></div>
        </form>
      </div>
    </div>
  );
}
