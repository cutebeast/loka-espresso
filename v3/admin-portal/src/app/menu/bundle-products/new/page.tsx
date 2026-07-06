"use client";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { parseApiError } from "@/lib/errors";
import { ArrowLeft, Plus, Trash2, Upload, Save, ChevronUp, ChevronDown, Users, Shuffle, LayoutGrid } from "lucide-react";
import { useCurrency } from "@/hooks/useCurrency";

interface MenuItemOption { id: number; item_name: string; base_price: number; category_id: number; is_bundle_eligible?: boolean; }
interface CategoryOption { id: number; category_name: string; }

type BundleMode = "fixed" | "pick_n" | "multi_course";

export default function BundleProductNewPage() {
  const router = useRouter();
  const { symbol, format } = useCurrency();
  const [mode, setMode] = useState<BundleMode | null>(null);
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
    max_per_order: "1",
  });

  type Component = { menu_item_id: string; cat_filter: string; default_quantity: number; sort_order: number; _tempGroupIdx?: number };
  type Group = { group_label: string; pick_count: number; min_pick: number; max_pick: number; sort_order: number; _tempId: number };

  const [components, setComponents] = useState<Component[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);

  const _tempIdCounter = useRef(0);
  const nextTempId = () => ++_tempIdCounter.current;

  useEffect(() => {
    api.getRaw<any>("/admin/menu/items?per_page=500")
      .then(d => setMenuItems((d?.items || []).filter((mi: any) => mi.is_bundle_eligible)))
      .catch((e: unknown) => { console.error('menu items:', e); });
    api.getRaw<any>("/admin/menu/categories?per_page=100")
      .then(d => setCategories((d?.items || [])))
      .catch((e: unknown) => { console.error('menu categories:', e); });
  }, []);

  const selectMode = (m: BundleMode) => {
    setMode(m);
    setForm(prev => ({
      ...prev,
      bundle_type: m === "pick_n" ? "pick_x" : m === "multi_course" ? "multi_course" : "combo",
      pick_count: "",
      allow_duplicates: false,
    }));
    setComponents([]);
    setGroups([]);
    setError("");
  };

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
    } catch (e: unknown) { setError(parseApiError(e, "Upload failed")); } finally { setUploading(false); }
  };

  const addComponent = (groupIdx?: number) => {
    const c: Component = { menu_item_id: "", cat_filter: "", default_quantity: 1, sort_order: components.length };
    if (groupIdx !== undefined) c._tempGroupIdx = groupIdx;
    setComponents([...components, c]);
  };

  const removeComponent = (idx: number) => setComponents(components.filter((_, i) => i !== idx));

  const moveComponent = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= components.length) return;
    const next = [...components];
    [next[idx], next[target]] = [next[target]!, next[idx]!];
    const sorted = next.map((c, i) => ({ ...c, sort_order: i }));
    setComponents(sorted);
  };

  const updateComponent = (idx: number, field: string, value: any) => {
    setComponents(components.map((c, i) => {
      if (i !== idx) return c;
      const next = { ...c, [field]: value };
      if (field === "cat_filter") next.menu_item_id = "";
      return next;
    }));
  };

  const addGroup = () => {
    const tid = nextTempId();
    setGroups([...groups, { group_label: "", pick_count: 1, min_pick: 1, max_pick: 1, sort_order: groups.length, _tempId: tid }]);
  };

  const removeGroup = (idx: number) => {
    const groupIdx = idx;
    setGroups(groups.filter((_, i) => i !== idx));
    setComponents(components.map(c => {
      if (c._tempGroupIdx === groupIdx) return { ...c, _tempGroupIdx: undefined };
      if ((c._tempGroupIdx ?? 0) > groupIdx) return { ...c, _tempGroupIdx: (c._tempGroupIdx ?? 0) - 1 };
      return c;
    }));
  };

  const updateGroup = (idx: number, field: string, value: any) => {
    setGroups(groups.map((g, i) => {
      if (i !== idx) return g;
      const next = { ...g, [field]: value };
      if (field === "pick_count") {
        next.min_pick = value;
        next.max_pick = value;
      }
      return next;
    }));
  };

  const groupComponents = (groupIdx: number) => components.filter(c => (c._tempGroupIdx ?? -1) === groupIdx);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title) { setError("Title is required"); return; }
    if (!form.bundle_price || Number(form.bundle_price) <= 0) { setError("Valid bundle price is required"); return; }

    if (mode === "pick_n") {
      const pc = Number(form.pick_count);
      if (!pc || pc < 1) { setError("Pick count must be at least 1"); return; }
      if (!form.allow_duplicates && components.length < pc) { setError(`Need at least ${pc} items in the pool`); return; }
    }
    if (mode === "multi_course") {
      if (groups.length === 0) { setError("At least one group is required"); return; }
      for (const [gi, g] of groups.entries()) {
        if (!g.group_label.trim()) { setError("All groups must have a label"); return; }
        if (!g.pick_count || g.pick_count < 1) { setError(`Group "${g.group_label}" needs a pick count >= 1`); return; }
        if (groupComponents(gi).length === 0) { setError(`Group "${g.group_label}" must have at least one component`); return; }
      }
    }
    if (mode !== "multi_course" && components.length === 0) { setError("At least one component is required"); return; }

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
        max_per_order: Number(form.max_per_order) || 1,
      };

      if (mode === "pick_n") {
        payload.pick_count = Number(form.pick_count);
        payload.allow_duplicates = form.allow_duplicates;
      }

      payload.components = components.filter(c => !!c.menu_item_id).map((c, i) => {
        const entry: any = {
          menu_item_id: Number(c.menu_item_id),
          default_quantity: c.default_quantity,
          sort_order: i,
          modifier_overrides: [],
        };
        if (mode === "multi_course" && c._tempGroupIdx !== undefined) {
          entry.bundle_group_id = c._tempGroupIdx;
        }
        return entry;
      });

      if (mode === "multi_course") {
        payload.groups = groups.map((g, gi) => ({
          group_label: g.group_label,
          pick_count: g.pick_count,
          min_pick: g.min_pick,
          max_pick: g.max_pick,
          sort_order: gi,
        }));
      }

      await api.post("/admin/menu/bundle-products", payload);
      router.push("/menu/bundle-products?created=1");
    } catch (err: unknown) { setError(parseApiError(err, "Failed to create bundle")); } finally { setSaving(false); }
  };

  if (!mode) {
    return (
      <div style={{ padding: 32, maxWidth: 900 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <button onClick={() => router.push("/menu/bundle-products")} className="btn btn-ghost btn-sm"><ArrowLeft size={18} /></button>
          <div><h1 className="page-title" style={{ margin: 0 }}>New Bundle Product</h1><p className="page-subtitle" style={{ marginTop: 2 }}>Choose a bundle type to get started</p></div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 }}>
          {([
            { mode: "fixed" as BundleMode, icon: <LayoutGrid size={32} />, title: "Fixed Set", desc: "All items included at a set price. No choices.", example: `Snack Plate = burger + fries + drink for ${symbol}15` },
            { mode: "pick_n" as BundleMode, icon: <Shuffle size={32} />, title: "Pick & Choose", desc: "Customer picks N items from a single pool.", example: `Pick any 2 for ${symbol}12` },
            { mode: "multi_course" as BundleMode, icon: <Users size={32} />, title: "Multi-Course", desc: "Multiple groups, each with its own pick count.", example: `3 mains + 2 sides + 1 drink = ${symbol}45` },
          ]).map(opt => (
            <div
              key={opt.mode}
              onClick={() => selectMode(opt.mode)}
              role="button"
              tabIndex={0}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectMode(opt.mode); } }}
              style={{
                cursor: "pointer", padding: 24, borderRadius: 12,
                border: "2px solid var(--color-border-light)",
                background: "var(--color-bg-white)",
                transition: "all 0.15s",
                display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 12,
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--color-primary)"; e.currentTarget.style.boxShadow = "0 2px 12px rgba(59,74,26,0.1)"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--color-border-light)"; e.currentTarget.style.boxShadow = "none"; }}
            >
              <div style={{ color: "var(--color-primary)" }}>{opt.icon}</div>
              <div><h3 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 4px" }}>{opt.title}</h3><p style={{ fontSize: 12, color: "var(--color-text-muted)", margin: 0, lineHeight: 1.5 }}>{opt.desc}</p></div>
              <p style={{ fontSize: 11, color: "var(--color-text-secondary)", fontStyle: "italic", margin: 0 }}>e.g. {opt.example}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const modeLabel = mode === "fixed" ? "Fixed Set" : mode === "pick_n" ? "Pick & Choose" : "Multi-Course";

  return (
    <div style={{ padding: 32, height: "100%", overflow: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={() => setMode(null)} className="btn btn-ghost btn-sm"><ArrowLeft size={18} /></button>
        <div><h1 className="page-title" style={{ margin: 0 }}>New {modeLabel} Bundle</h1><p className="page-subtitle" style={{ marginTop: 2 }}>{mode === "fixed" ? "All items included at a set price" : mode === "pick_n" ? "Customer picks N items from the pool" : "Multiple groups, each with its own pick count"}</p></div>
      </div>
      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="card" style={{ padding: "24px 24px 400px 24px", maxWidth: 800 }}>
        <form onSubmit={handleSubmit}>
          <div className="df-grid">
            <div className="df-field" style={{ gridColumn: "1/-1" }}><label className="df-label">Title *</label><input required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. Snack Plate Combo" /></div>
            <div className="df-field"><label className="df-label">Bundle Price ({symbol}) *</label><input type="number" step="0.01" min="0" required value={form.bundle_price} onChange={e => setForm({ ...form, bundle_price: e.target.value })} placeholder="0.00" /></div>
            <div className="df-field"><label className="df-label">Marketing Label</label><select value={form.bundle_type} onChange={e => setForm({ ...form, bundle_type: e.target.value })}><option value="combo">Combo</option><option value="value_meal">Value Meal</option><option value="family_meal">Family Meal</option><option value="breakfast_set">Breakfast Set</option><option value="promotional">Promotional</option>{mode === "pick_n" && <option value="pick_x">Pick & Choose</option>}{mode === "multi_course" && <option value="multi_course">Multi-Course</option>}</select></div>

            {mode === "pick_n" && (
              <>
                <div className="df-field"><label className="df-label">Pick Count *</label><input type="number" min={1} step={1} required value={form.pick_count} onChange={e => setForm({ ...form, pick_count: e.target.value })} placeholder="e.g. 3" /><span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Number of items the customer must select</span></div>
                <div className="df-field"><label className="df-label" style={{ display: "flex", alignItems: "center", gap: 8 }}><input type="checkbox" checked={form.allow_duplicates} onChange={e => setForm({ ...form, allow_duplicates: e.target.checked })} />Allow Duplicate Picks</label><span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Customer can pick the same item multiple times</span></div>
              </>
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
            <div className="df-field"><label className="df-label">Max Per Order</label><input type="number" min="1" step="1" value={form.max_per_order} onChange={e => setForm({ ...form, max_per_order: e.target.value })} /></div>
            <div className="df-field"><label className="df-label" style={{ display: "flex", alignItems: "center", gap: 8 }}><input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} /> Active</label></div>
          </div>

          {mode === "multi_course" ? (
            <div style={{ marginTop: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Groups</h3>
                <button type="button" onClick={addGroup} className="btn btn-sm btn-outline" style={{ display: "flex", alignItems: "center", gap: 4 }}><Plus size={14} /> Add Group</button>
              </div>
              {groups.length === 0 && <p style={{ fontSize: 13, color: "var(--color-text-muted)", marginBottom: 16 }}>No groups defined. Click &quot;Add Group&quot; to create selection groups.</p>}
              {groups.map((g, gi) => (
                <div key={gi} style={{ background: "var(--color-bg-muted)", borderRadius: 12, padding: 16, marginBottom: 16, border: "1px solid var(--color-border-light)" }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
                    <input value={g.group_label} onChange={e => updateGroup(gi, "group_label", e.target.value)} placeholder="Group label (e.g. Choose Your Mains)" style={{ flex: 1, minWidth: 200, padding: "6px 10px", fontSize: 13, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-light)" }} />
                    <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}>Pick: <input type="number" min={1} step={1} value={g.pick_count} onChange={e => updateGroup(gi, "pick_count", Number(e.target.value))} style={{ width: 55, padding: "4px 6px", fontSize: 12, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-light)" }} /></label>
                    <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}>Max: <input type="number" min={1} step={1} value={g.max_pick} onChange={e => updateGroup(gi, "max_pick", Number(e.target.value))} style={{ width: 55, padding: "4px 6px", fontSize: 12, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-light)" }} /></label>
                    <button type="button" onClick={() => removeGroup(gi)} className="btn btn-ghost btn-sm" style={{ color: "var(--color-error)" }}><Trash2 size={14} /></button>
                  </div>
                  {g.max_pick > g.pick_count && <p style={{ fontSize: 11, color: "var(--color-info)", margin: "0 0 8px" }}>Extras allowed: up to {g.max_pick} items. Extra items are charged at full price.</p>}

                  <div style={{ borderTop: "1px solid var(--color-border-light)", paddingTop: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: "var(--color-text-muted)" }}>Group Items</div>
                    {groupComponents(gi).map((c, i) => (
                      <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                        <select value={c.cat_filter || ""} onChange={e => updateComponent(components.indexOf(c), "cat_filter", e.target.value)} style={{ width: 130, padding: "4px 8px", fontSize: 12, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-light)" }}>
                          <option value="">All categories</option>
                          {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.category_name}</option>)}
                        </select>
                        <select value={c.menu_item_id} onChange={e => updateComponent(components.indexOf(c), "menu_item_id", e.target.value)} style={{ flex: 1, padding: "4px 8px", fontSize: 12, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-light)" }} required>
                          <option value="">— Select item —</option>
                          {itemsForComponent(c.cat_filter || "").map(m => <option key={m.id} value={m.id}>{m.item_name} ({format(m.base_price)})</option>)}
                        </select>
                        <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>Qty: <input type="number" min={1} value={c.default_quantity} onChange={e => updateComponent(components.indexOf(c), "default_quantity", Number(e.target.value))} style={{ width: 50, padding: "4px 6px", fontSize: 12, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-light)" }} /></label>
                        <button type="button" onClick={() => removeComponent(components.indexOf(c))} className="btn btn-ghost btn-sm" style={{ color: "var(--color-error)" }}><Trash2 size={14} /></button>
                      </div>
                    ))}
                    <button type="button" onClick={() => addComponent(gi)} className="btn btn-ghost btn-sm" style={{ fontSize: 12, paddingLeft: 0 }}><Plus size={12} /> Add item to {g.group_label || "this group"}</button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ marginTop: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>{mode === "pick_n" ? "Selectable Items Pool" : "Components"}</h3>
                <button type="button" onClick={() => addComponent()} className="btn btn-sm btn-outline" style={{ display: "flex", alignItems: "center", gap: 4 }}><Plus size={14} /> Add</button>
              </div>
              {components.length === 0 && <p style={{ fontSize: 13, color: "var(--color-text-muted)" }}>{mode === "pick_n" ? "No items in pool. Click &quot;Add&quot; to include selectable items." : "No components added. Click &quot;Add&quot; to include menu items in this bundle."}</p>}
              {components.map((c, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, padding: "8px 12px", background: "var(--color-bg-muted)", borderRadius: "var(--radius-md)", flexWrap: "wrap" }}>
                  <select value={c.cat_filter || ""} onChange={e => updateComponent(i, "cat_filter", e.target.value)} style={{ width: 130, padding: "6px 10px", fontSize: 12, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-light)" }}>
                    <option value="">All categories</option>
                    {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.category_name}</option>)}
                  </select>
                  <select value={c.menu_item_id} onChange={e => updateComponent(i, "menu_item_id", e.target.value)} style={{ flex: 1, minWidth: 160, padding: "6px 10px", fontSize: 13, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-light)" }} required>
                    <option value="">— Select item —</option>
                    {itemsForComponent(c.cat_filter || "").map(m => <option key={m.id} value={m.id}>{m.item_name} ({format(m.base_price)})</option>)}
                  </select>
                  <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>Qty: <input type="number" min={1} value={c.default_quantity} onChange={e => updateComponent(i, "default_quantity", Number(e.target.value))} style={{ width: 50, padding: "4px 6px", fontSize: 12, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-light)" }} /></label>
                  <button type="button" onClick={() => moveComponent(i, -1)} disabled={i === 0} className="btn btn-ghost btn-sm" style={{ padding: "4px", opacity: i === 0 ? 0.3 : 1 }} aria-label="Move up"><ChevronUp size={14} /></button>
                  <button type="button" onClick={() => moveComponent(i, 1)} disabled={i === components.length - 1} className="btn btn-ghost btn-sm" style={{ padding: "4px", opacity: i === components.length - 1 ? 0.3 : 1 }} aria-label="Move down"><ChevronDown size={14} /></button>
                  <button type="button" onClick={() => removeComponent(i)} className="btn btn-ghost btn-sm" style={{ color: "var(--color-error)" }}><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          )}

          <div className="df-actions" style={{ marginTop: 20 }}><button type="button" onClick={() => router.push("/menu/bundle-products")} className="btn btn-ghost">Cancel</button><button type="submit" className="btn btn-primary" disabled={saving}><Save size={16} /> {saving ? "Creating..." : "Create Bundle"}</button></div>
        </form>
      </div>
    </div>
  );
}
