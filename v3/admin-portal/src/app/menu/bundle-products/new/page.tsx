"use client";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ArrowLeft, Plus, Trash2, Upload, Save, ChevronUp, ChevronDown } from "lucide-react";

interface MenuItemOption { id: number; item_name: string; base_price: number; category_id: number; is_bundle_eligible?: boolean; }
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

  const [form, setForm] = useState({
    title: "", description: "", bundle_price: "", bundle_type: "combo",
    image_url: "", is_active: true, display_order: 0,
    pick_count: "",
    allow_duplicates: false,
  });

  const [components, setComponents] = useState<Array<{
    menu_item_id: string; cat_filter: string; default_quantity: number;
    is_required: boolean; is_swappable: boolean; swap_group: string; sort_order: number;
  }>>([]);

  useEffect(() => {
    api.getRaw<any>("/admin/menu/items?per_page=500")
      .then(d => setMenuItems((d?.items || []).filter((mi: any) => mi.is_bundle_eligible)))
      .catch((e) => { console.error('menu items:', e); });
    api.getRaw<any>("/admin/menu/categories?per_page=100")
      .then(d => setCategories((d?.items || [])))
      .catch((e) => { console.error('menu categories:', e); });
  }, []);

  const itemsForComponent = (catFilter: string) => catFilter
    ? menuItems.filter(i => i.category_id === Number(catFilter))
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

  const addComponent = () => setComponents([...components, { menu_item_id: "", cat_filter: "", default_quantity: 1, is_required: true, is_swappable: false, swap_group: "", sort_order: components.length }]);

  const removeComponent = (idx: number) => setComponents(components.filter((_, i) => i !== idx));

  const moveComponent = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= components.length) return;
    const next = [...components];
    [next[idx], next[target]] = [next[target]!, next[idx]!];
    next.forEach((c, i) => { c.sort_order = i; });
    setComponents(next);
  };

  const updateComponent = (idx: number, field: string, value: any) => {
    setComponents(components.map((c, i) => {
      if (i !== idx) return c;
      const next = { ...c, [field]: value };
      if (field === "cat_filter") next.menu_item_id = "";
      return next;
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const isPickX = form.bundle_type === "pick_x";
    if (!form.title) { setError("Title is required"); return; }
    if (!form.bundle_price || Number(form.bundle_price) <= 0) { setError("Valid bundle price is required"); return; }
    if (isPickX) {
      const pc = Number(form.pick_count);
      if (!pc || pc < 1) { setError("Pick count must be at least 1"); return; }
      if (!form.allow_duplicates && components.length < pc) {
        setError(`Need at least ${pc} items in the pool (current: ${components.length})`); return;
      }
      if (form.allow_duplicates && components.length < 1) {
        setError("At least one item required in the selectable pool"); return;
      }
    } else {
      if (components.length === 0) { setError("At least one component is required"); return; }
    }
    for (let i = 0; i < components.length; i++) {
      const c = components[i]; if (!c || !c.menu_item_id) { setError(`Item ${i + 1}: select a menu item`); return; }
    }
    setSaving(true);
    try {
      const payload: any = {
        title: form.title, description: form.description,
        bundle_price: Number(form.bundle_price),
        bundle_type: form.bundle_type,
        image_url: form.image_url || undefined,
        is_active: form.is_active,
        display_order: form.display_order,
      };
      if (isPickX) {
        payload.pick_count = Number(form.pick_count);
        payload.allow_duplicates = form.allow_duplicates;
      }
      payload.components = components.filter(c => !!c.menu_item_id).map(c => ({
        menu_item_id: Number(c.menu_item_id),
        default_quantity: c.default_quantity,
        is_required: c.is_required,
        is_swappable: c.is_swappable,
        swap_group: c.swap_group ? Number(c.swap_group) : null,
        sort_order: c.sort_order,
        modifier_overrides: [],
      }));
      await api.post("/admin/menu/bundle-products", payload);
      router.push("/menu/bundle-products?created=1");
    } catch (err: any) { setError(err.message); } finally { setSaving(false); }
  };

  return (
    <div style={{ padding: 32, height: "100%", overflow: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={() => router.push("/menu/bundle-products")} className="btn btn-ghost btn-sm"><ArrowLeft size={18} /></button>
        <div><h1 className="page-title" style={{ margin: 0 }}>New Bundle Product</h1><p className="page-subtitle" style={{ marginTop: 2 }}>Combo meal combining existing menu items at a special price</p></div>
      </div>
      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="card" style={{ padding: "24px 24px 400px 24px", maxWidth: 800 }}>
        <form onSubmit={handleSubmit}>
          <div className="df-grid">
            <div className="df-field" style={{ gridColumn: "1/-1" }}><label className="df-label">Title *</label><input required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. Snack Plate Combo" /></div>
            <div className="df-field"><label className="df-label">Bundle Type</label><select value={form.bundle_type} onChange={e => setForm({ ...form, bundle_type: e.target.value })}><option value="combo">Combo</option><option value="value_meal">Value Meal</option><option value="family_meal">Family Meal</option><option value="breakfast_set">Breakfast Set</option><option value="promotional">Promotional</option><option value="pick_x">Pick-X (Build Your Own)</option></select></div>
            <div className="df-field"><label className="df-label">Bundle Price (RM) *</label><input type="number" step="0.01" min="0" required value={form.bundle_price} onChange={e => setForm({ ...form, bundle_price: e.target.value })} placeholder="0.00" /></div>

            {form.bundle_type === "pick_x" && (
              <>
                <div className="df-field">
                  <label className="df-label">Pick Count *</label>
                  <input type="number" min={1} step={1} required value={form.pick_count} onChange={e => setForm({ ...form, pick_count: e.target.value })} placeholder="e.g. 3" />
                  <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Number of items the customer must select</span>
                </div>
                <div className="df-field">
                  <label className="df-label" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input type="checkbox" checked={form.allow_duplicates} onChange={e => setForm({ ...form, allow_duplicates: e.target.checked })} />
                    Allow Duplicate Picks
                  </label>
                  <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Customer can pick the same item multiple times</span>
                  {form.allow_duplicates && (
                    <span style={{ fontSize: 11, color: "var(--color-text-muted)", display: "block", marginTop: 2 }}>
                      Max quantity per item = pick count ({form.pick_count || "?"})
                    </span>
                  )}
                </div>
              </>
            )}
            {form.bundle_type === "pick_x" && components.filter(c => c.menu_item_id).length > 0 && (
              <div className="df-field" style={{ gridColumn: "1/-1" }}>
                <div style={{
                  background: "var(--color-warning-light, #FDF5E6)", border: "1px solid var(--color-warning, #C9A84C)",
                  borderRadius: "var(--radius-sm, 6px)", padding: "8px 12px", fontSize: 12,
                  color: "var(--color-text-secondary)", marginBottom: 8,
                }}>
                  {((): any => {
                    const pickN = Number(form.pick_count) || 1;
                    const prices = components.filter(c => c.menu_item_id).map(c => {
                      const mi = menuItems.find(m => m.id === Number(c.menu_item_id));
                      return mi ? mi.base_price : 0;
                    }).sort((a, b) => a - b);
                    const cheapestSum = prices.slice(0, Math.min(pickN, prices.length)).reduce((s, p) => s + p, 0);
                    return `Cheapest ${pickN} items total RM ${cheapestSum.toFixed(2)}. Set bundle price ≤ RM ${cheapestSum.toFixed(2)} for the deal to always apply.`;
                  })()}
                </div>
              </div>
            )}
            <div className="df-field" style={{ gridColumn: "1/-1" }}><label className="df-label">Description</label><textarea rows={3} maxLength={500} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Marketing description for the combo" /></div>
            <div className="df-field" style={{ gridColumn: "1/-1" }}>
              <label className="df-label">Image</label>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <input ref={fileRef} type="file" accept="image/*" onChange={handleUpload} style={{ display: "none" }} />
                <button type="button" onClick={() => fileRef.current?.click()} className="btn btn-sm btn-outline" disabled={uploading}><Upload size={14} /> {uploading ? "Uploading..." : "Upload Image"}</button>
                {imagePreview && <><img src={imagePreview} alt="" style={{ width: 48, height: 48, borderRadius: 6, objectFit: "cover" }} /><button type="button" onClick={() => { setForm({ ...form, image_url: "" }); setImagePreview(""); }} className="btn btn-ghost btn-sm" style={{ color: "var(--color-error)" }}>Clear</button></>}
              </div>
            </div>
            <div className="df-field"><label className="df-label">Display Order</label><input type="number" min="0" value={form.display_order} onChange={e => setForm({ ...form, display_order: Number(e.target.value) })} /></div>
            <div className="df-field"><label className="df-label" style={{ display: "flex", alignItems: "center", gap: 8 }}><input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} /> Active</label></div>
          </div>

          <div style={{ marginTop: 24, marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>{form.bundle_type === "pick_x" ? "Selectable Items Pool" : "Components"}</h3>
            <button type="button" onClick={addComponent} className="btn btn-sm btn-outline" style={{ display: "flex", alignItems: "center", gap: 4 }}><Plus size={14} /> Add</button>
          </div>
          {components.length === 0 && <p style={{ fontSize: 13, color: "var(--color-text-muted)" }}>{form.bundle_type === "pick_x" ? "No items in pool. Click \"Add\" to include selectable items." : "No components added. Click \"Add\" to include menu items in this bundle."}</p>}

          {components.map((c, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, padding: "8px 12px", background: "var(--color-bg-muted)", borderRadius: "var(--radius-md)", flexWrap: "wrap" }}>
              <select
                value={c.cat_filter}
                onChange={e => updateComponent(i, "cat_filter", e.target.value)}
                style={{ width: 130, padding: "6px 10px", fontSize: 12, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-light)" }}
              >
                <option value="">All categories</option>
                {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.category_name}</option>)}
              </select>
              <select value={c.menu_item_id} onChange={e => updateComponent(i, "menu_item_id", e.target.value)} style={{ flex: 1, minWidth: 160, padding: "6px 10px", fontSize: 13, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-light)" }} required>
                <option value="">— Select item —</option>
                {itemsForComponent(c.cat_filter).map(m => <option key={m.id} value={m.id}>{m.item_name} (RM {Number(m.base_price || 0).toFixed(2)})</option>)}
              </select>
              <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>Qty: <input type="number" min={1} value={c.default_quantity} onChange={e => updateComponent(i, "default_quantity", Number(e.target.value))} style={{ width: 50, padding: "4px 6px", fontSize: 12, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-light)" }} /></label>
              {form.bundle_type !== "pick_x" && (
                <>
                  <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }} title="Required component"><input type="checkbox" checked={c.is_required} onChange={e => updateComponent(i, "is_required", e.target.checked)} /> Required</label>
                  <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }} title="Customer can swap this for another item"><input type="checkbox" checked={c.is_swappable} onChange={e => updateComponent(i, "is_swappable", e.target.checked)} /> Swappable</label>
                  {c.is_swappable && <input type="number" value={c.swap_group} onChange={e => updateComponent(i, "swap_group", e.target.value)} placeholder="swap group" style={{ width: 70, padding: "4px 6px", fontSize: 12, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-light)" }} />}
                </>
              )}
              <button type="button" onClick={() => moveComponent(i, -1)} disabled={i === 0} className="btn btn-ghost btn-sm" style={{ padding: "4px", opacity: i === 0 ? 0.3 : 1 }} aria-label="Move up"><ChevronUp size={14} /></button>
              <button type="button" onClick={() => moveComponent(i, 1)} disabled={i === components.length - 1} className="btn btn-ghost btn-sm" style={{ padding: "4px", opacity: i === components.length - 1 ? 0.3 : 1 }} aria-label="Move down"><ChevronDown size={14} /></button>
              <button type="button" onClick={() => removeComponent(i)} className="btn btn-ghost btn-sm" style={{ color: "var(--color-error)" }}><Trash2 size={14} /></button>
            </div>
          ))}

          <div className="df-actions" style={{ marginTop: 20 }}><button type="button" onClick={() => router.push("/menu/bundle-products")} className="btn btn-ghost">Cancel</button><button type="submit" className="btn btn-primary" disabled={saving}><Save size={16} /> {saving ? "Creating..." : "Create Bundle"}</button></div>
        </form>
      </div>
    </div>
  );
}
