"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ArrowLeft, Plus, Trash2, Save, Upload, RefreshCw, ChevronUp, ChevronDown } from "lucide-react";

type LocaleTab = "en" | "ms" | "zh" | "ta" | "tr";
const LOCALES: { code: LocaleTab; label: string; flag: string }[] = [
  { code: "en", label: "English", flag: "🇬🇧" }, { code: "ms", label: "BM", flag: "🇲🇾" }, { code: "zh", label: "中文", flag: "🇨🇳" }, { code: "ta", label: "தமிழ்", flag: "🇮🇳" }, { code: "tr", label: "TR", flag: "🇹🇷" },
];
const TR_FIELDS = [{ key: "title", label: "Title" }, { key: "description", label: "Description" }];

interface MenuItemOption { id: number; item_name: string; base_price: number; category_id: number; is_bundle_eligible?: boolean; }
interface CategoryOption { id: number; category_name: string; }

export default function BundleProductEditPage() {
  const p = useParams(); const r = useRouter(); const id = p.id as string;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingTr, setSavingTr] = useState(false);
  const [loc, setLoc] = useState<LocaleTab>("en");
  const [regen, setRegen] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [uploading, setUploading] = useState(false);
  const [img, setImg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [menuItems, setMenuItems] = useState<MenuItemOption[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [form, setForm] = useState<Record<string, any>>({});
  const [tr, setTr] = useState<Record<string, string>>({});
  const [components, setComponents] = useState<Array<any>>([]);

  useEffect(() => { load(); loadRefs(); }, [id]);

  const loadRefs = async () => {
    try { const d = await api.getRaw<any>("/admin/menu/items?per_page=500"); setMenuItems(d?.items || []); } catch (e) { console.error(e); }
    try { const d = await api.getRaw<any>("/admin/menu/categories?per_page=100"); setCategories(d?.items || []); } catch (e) { console.error(e); }
  };

  const selectedItemIds = new Set(components.map(c => Number(c.menu_item_id)).filter(Boolean));

  const itemsForComponent = (catFilter: string) => {
    const pool = catFilter
      ? menuItems.filter(i => i.category_id === Number(catFilter))
      : menuItems;
    return pool.filter(i => i.is_bundle_eligible || selectedItemIds.has(i.id));
  };

  const load = useCallback(async () => {
    try {
      const d = await api.getRaw<any>(`/admin/menu/bundle-products/${id}`);
      setForm({
        title: d.title || "", description: d.description || "",
        bundle_price: d.bundle_price?.toString() || "", bundle_type: d.bundle_type || "combo",
        image_url: d.image_url || "", is_active: d.is_active, display_order: d.display_order ?? 0,
        pick_count: d.pick_count?.toString() || "",
        allow_duplicates: d.allow_duplicates || false,
      });
      setImg(d.image_url || "");
      setComponents((d.components || []).map((c: any) => ({
        id: c.id,
        menu_item_id: String(c.menu_item_id || ""),
        cat_filter: "",
        default_quantity: c.default_quantity ?? 1,
        is_required: c.is_required !== false,
        is_swappable: c.is_swappable || false,
        swap_group: c.swap_group ? String(c.swap_group) : "",
        sort_order: c.sort_order ?? 0,
      })));
      const x: Record<string, string> = {};
      for (const lc of LOCALES) {
        if (lc.code === "en") continue;
        try {
          const rt = await api.getRaw<{ items: { id: number; translation_key: string; translated_text: string }[] }>(`/admin/translations?table_name=bundle_products&record_id=${id}&locale=${lc.code}&per_page=50`);
          if (rt?.items) for (const t of rt.items) { const f = t.translation_key.split(".").pop() || ""; x[`${lc.code}:${f}`] = t.translated_text || ""; }
        } catch (e) { console.error(e); }
      }
      setTr(x);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, [id]);

  const handleUpload = async () => {
    const f = fileRef.current?.files?.[0]; if (!f) return; setUploading(true);
    try { const fd = new FormData(); fd.append("file", f); const j = await api.upload("/upload/image", fd); const url = j.url || j.filename || ""; setForm({ ...form, image_url: url }); setImg(url); } catch (e) { console.error(e); } finally { setUploading(false); }
  };

  const handleSave = async () => {
    const isPickX = form.bundle_type === "pick_x";
    if (!form.title) { setError("Title is required"); return; }
    if (!form.bundle_price || Number(form.bundle_price) <= 0) { setError("Valid bundle price is required"); return; }
    if (isPickX) {
      const pc = Number(form.pick_count);
      if (!pc || pc < 1) { setError("Pick count must be at least 1"); return; }
      if (!form.allow_duplicates && components.length < pc) { setError(`Need at least ${pc} items in the pool`); return; }
      if (form.allow_duplicates && components.length < 1) { setError("At least one item required in the pool"); return; }
    } else {
      if (components.length === 0) { setError("At least one component is required"); return; }
    }
    for (let i = 0; i < components.length; i++) {
      const c = components[i]; if (!c || !c.menu_item_id) { setError(`Item ${i + 1}: select a menu item`); return; }
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        title: form.title, description: form.description || "",
        bundle_price: Number(form.bundle_price) || 0,
        bundle_type: form.bundle_type,
        image_url: form.image_url || undefined,
        is_active: form.is_active,
        display_order: form.display_order ?? 0,
      };
      if (isPickX) {
        payload.pick_count = Number(form.pick_count);
        payload.allow_duplicates = form.allow_duplicates;
      } else {
        payload.pick_count = null;
        payload.allow_duplicates = false;
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
      await api.patch(`/admin/menu/bundle-products/${id}`, payload);
      setSuccessMsg("Saved"); setTimeout(() => setSuccessMsg(""), 2000);
    } catch (e: any) { setError(e.message || "Save failed"); } finally { setSaving(false); }
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
  const handleDelete = async () => {
    if (!confirm("Delete this bundle product? This cannot be undone.")) return;
    try { await api.del(`/admin/menu/bundle-products/${id}`); r.push("/menu/bundle-products"); }
    catch (e: any) { setError(e.message || "Failed to delete bundle"); }
  };
  const updateComponent = (idx: number, field: string, value: any) => {
    setComponents(components.map((c, i) => {
      if (i !== idx) return c;
      const next = { ...c, [field]: value };
      if (field === "cat_filter") next.menu_item_id = "";
      return next;
    }));
  };

  const upsertTr = async (field: string, locale: string, src: string, text: string) => {
    const all = await api.getRaw<{ items: { id: number; translation_key?: string; translated_text?: string }[] }>(`/admin/translations?table_name=bundle_products&record_id=${id}&column_name=${field}&locale=${locale}&per_page=1`);
    if (all?.items?.[0]) { await api.put(`/admin/translations/${all.items[0].id}`, { translated_text: text }); }
    else { await api.post("/admin/translations", { translation_key: `bundle_products.${id}.${field}`, locale, namespace: "bundle", translated_text: text, source_text: src, table_name: "bundle_products", record_id: Number(id), column_name: field }); }
  };

  const regenAll = async (locale: string) => { setRegen(true); const results: { field: string; text: string }[] = [];
    for (const f of TR_FIELDS) { const src = (form[f.key] || "").trim(); if (!src) continue; try { const r = await api.post<{ translated_text?: string }>("/admin/translations/translate", { text: src, target_locale: locale, source_locale: "en" }); if (r?.translated_text) { results.push({ field: f.key, text: r.translated_text }); setTr(prev => ({ ...prev, [`${locale}:${f.key}`]: r.translated_text! })); } } catch (e) { console.error(e); } }
    for (const r of results) { await upsertTr(r.field, locale, (form[r.field] || "").trim(), r.text); }
    setSuccessMsg(results.length > 0 ? `Regenerated ${results.length} translations` : "No translatable content"); setTimeout(() => setSuccessMsg(""), 2500); setRegen(false);
  };

  const saveAllTr = async (locale: string) => { setSavingTr(true); for (const f of TR_FIELDS) { const key = `${locale}:${f.key}`; const text = tr[key] || ""; if (text.trim()) await upsertTr(f.key, locale, form[f.key] || "", text); } setSuccessMsg(`Saved`); setTimeout(() => setSuccessMsg(""), 2000); setSavingTr(false); };

  if (loading) return <div style={{ padding: 32 }}><p>Loading...</p></div>;

  return (
    <div style={{ padding: 32, height: "100%", overflow: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={() => r.push("/menu/bundle-products")} className="btn btn-ghost btn-sm"><ArrowLeft size={18} /></button>
        <div><h1 className="page-title" style={{ margin: 0 }}>{form.title || "Bundle Product"}</h1><p className="page-subtitle" style={{ marginTop: 2 }}>Edit details & translations</p></div>
      </div>
      {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}
      {successMsg && <div className="alert alert-success" style={{ marginBottom: 12 }}>{successMsg}</div>}

      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "2px solid var(--color-border-light)", paddingBottom: 0 }}>
        {LOCALES.map(l => <button key={l.code} onClick={() => setLoc(l.code)} style={{ padding: "10px 20px", fontSize: 13, fontWeight: loc === l.code ? 700 : 400, border: "none", borderBottom: loc === l.code ? "3px solid var(--color-primary)" : "3px solid transparent", background: loc === l.code ? "rgba(59,74,26,0.05)" : "transparent", cursor: "pointer", color: loc === l.code ? "var(--color-primary)" : "var(--color-text-muted)", borderRadius: "4px 4px 0 0" }}>{l.flag} {l.label}</button>)}
      </div>

      {loc === "en" && <div className="card" style={{ padding: "24px 24px 400px 24px", maxWidth: 800 }}>
        <h3 style={{ marginBottom: 20 }}>English (Source Content)</h3>
        <div className="df-grid">
          <div className="df-field" style={{ gridColumn: "1/-1" }}><label className="df-label">Title *</label><input required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></div>
          <div className="df-field"><label className="df-label">Bundle Type</label><select value={form.bundle_type} onChange={e => setForm({ ...form, bundle_type: e.target.value })}><option value="combo">Combo</option><option value="value_meal">Value Meal</option><option value="family_meal">Family Meal</option><option value="breakfast_set">Breakfast Set</option><option value="promotional">Promotional</option><option value="pick_x">Pick-X (Build Your Own)</option></select></div>
          <div className="df-field"><label className="df-label">Bundle Price (RM) *</label><input type="number" step="0.01" min="0" required value={form.bundle_price} onChange={e => setForm({ ...form, bundle_price: e.target.value })} /></div>

          {form.bundle_type === "pick_x" && (
            <>
              <div className="df-field">
                <label className="df-label">Pick Count *</label>
                <input type="number" min={1} step={1} required value={form.pick_count || ""} onChange={e => setForm({ ...form, pick_count: e.target.value })} placeholder="e.g. 3" />
                <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Number of items the customer must select</span>
              </div>
              <div className="df-field">
                <label className="df-label" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input type="checkbox" checked={form.allow_duplicates || false} onChange={e => setForm({ ...form, allow_duplicates: e.target.checked })} />
                  Allow Duplicate Picks
                </label>
                <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Customer can pick the same item multiple times</span>
                {(form.allow_duplicates) && (
                  <span style={{ fontSize: 11, color: "var(--color-text-muted)", display: "block", marginTop: 2 }}>
                    Max quantity per item = pick count ({form.pick_count || "?"})
                  </span>
                )}
              </div>
            </>
          )}
          {form.bundle_type === "pick_x" && components.filter((c: any) => c.menu_item_id).length > 0 && (
            <div className="df-field" style={{ gridColumn: "1/-1" }}>
              <div style={{
                background: "var(--color-warning-light, #FDF5E6)", border: "1px solid var(--color-warning, #C9A84C)",
                borderRadius: "var(--radius-sm, 6px)", padding: "8px 12px", fontSize: 12,
                color: "var(--color-text-secondary)", marginBottom: 8,
              }}>
                {(() => {
                  const pickN = Number(form.pick_count) || 1;
                  const prices = components.filter((c: any) => c.menu_item_id).map((c: any) => {
                    const mi = menuItems.find((m: any) => m.id === Number(c.menu_item_id));
                    return mi ? mi.base_price : 0;
                  }).sort((a: number, b: number) => a - b);
                  const cheapestSum = prices.slice(0, Math.min(pickN, prices.length)).reduce((s: number, p: number) => s + p, 0);
                  return `Cheapest ${pickN} items total RM ${cheapestSum.toFixed(2)}. Set bundle price ≤ RM ${cheapestSum.toFixed(2)} for the deal to always apply.`;
                })()}
              </div>
            </div>
          )}
          <div className="df-field" style={{ gridColumn: "1/-1" }}><label className="df-label">Description</label><textarea rows={3} maxLength={500} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
          <div className="df-field" style={{ gridColumn: "1/-1" }}>
            <label className="df-label">Image</label>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}><input ref={fileRef} type="file" accept="image/*" onChange={handleUpload} style={{ display: "none" }} /><button type="button" onClick={() => fileRef.current?.click()} className="btn btn-sm btn-outline" disabled={uploading}><Upload size={14} /> {uploading ? "Uploading..." : "Upload Image"}</button>{img && <><img src={img} alt="" style={{ width: 48, height: 48, borderRadius: 6, objectFit: "cover" }} /><button type="button" onClick={() => { setForm({ ...form, image_url: "" }); setImg(""); }} className="btn btn-ghost btn-sm" style={{ color: "var(--color-error)" }}>Clear</button></>}</div>
          </div>
          <div className="df-field"><label className="df-label">Display Order</label><input type="number" min="0" value={form.display_order} onChange={e => setForm({ ...form, display_order: Number(e.target.value) })} /></div>
          <div className="df-field"><label className="df-label" style={{ display: "flex", alignItems: "center", gap: 8 }}><input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} /> Active</label></div>
        </div>

        <div style={{ marginTop: 24, marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>{form.bundle_type === "pick_x" ? "Selectable Items Pool" : "Components"}</h3>
          <button type="button" onClick={addComponent} className="btn btn-sm btn-outline" style={{ display: "flex", alignItems: "center", gap: 4 }}><Plus size={14} /> Add</button>
        </div>
        {components.length === 0 && <p style={{ fontSize: 13, color: "var(--color-text-muted)", marginBottom: 8 }}>{form.bundle_type === "pick_x" ? "No items in pool. Click \"Add\" to include selectable items." : "No components added. Click \"Add\" to include menu items in this bundle."}</p>}
        {components.map((c, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, padding: "8px 12px", background: "var(--color-bg-muted)", borderRadius: "var(--radius-md)", flexWrap: "wrap" }}>
              <select
                value={c.cat_filter || ""}
                onChange={e => updateComponent(i, "cat_filter", e.target.value)}
                style={{ width: 130, padding: "6px 10px", fontSize: 12, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-light)" }}
              >
                <option value="">All categories</option>
                {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.category_name}</option>)}
              </select>
            <select value={c.menu_item_id} onChange={e => updateComponent(i, "menu_item_id", e.target.value)} style={{ flex: 1, minWidth: 160, padding: "6px 10px", fontSize: 13, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-light)" }} required>
              <option value="">— Select item —</option>
                {itemsForComponent(c.cat_filter || "").map(m => <option key={m.id} value={m.id}>{m.item_name} (RM {Number(m.base_price || 0).toFixed(2)})</option>)}
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

        <div className="df-actions" style={{ marginTop: 20 }}><button type="button" onClick={() => r.push("/menu/bundle-products")} className="btn btn-ghost">Cancel</button><button type="button" onClick={handleDelete} className="btn btn-ghost" style={{ color: "var(--color-error)", marginLeft: "auto", marginRight: 8 }}>Delete Bundle</button><button onClick={handleSave} disabled={saving} className="btn btn-primary"><Save size={16} /> {saving ? "Saving..." : "Save Changes"}</button></div>
      </div>}

      {loc !== "en" && <div className="card" style={{ padding: 24, maxWidth: 720 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}><h3 style={{ margin: 0, fontSize: 16 }}>{LOCALES.find(l => l.code === loc)?.flag} {LOCALES.find(l => l.code === loc)?.label} Translation</h3><button onClick={() => regenAll(loc)} disabled={regen} className="btn btn-primary btn-sm" style={{ fontSize: 12, padding: "8px 16px" }}><RefreshCw size={14} /> {regen ? "Generating..." : "Regenerate All"}</button></div>
        <div className="df-grid">
          {TR_FIELDS.map(f => { const k = `${loc}:${f.key}`; const t = tr[k] || ""; const s = form[f.key] || ""; const isLong = f.key === "description"; return <div className="df-field" key={f.key} style={isLong ? { gridColumn: "1/-1" } : {}}><label style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-muted)", display: "flex", justifyContent: "space-between" }}><span>{f.label}</span><span style={{ fontWeight: 400, fontStyle: "italic" }}>EN: {s?.slice(0, 30) || "—"}</span></label>{isLong ? <textarea rows={3} value={t} onChange={e => setTr(prev => ({ ...prev, [k]: e.target.value }))} style={{ width: "100%", padding: "8px 10px", fontSize: 13, border: t ? "1px solid var(--color-border-light)" : "2px solid #FCD34D", borderRadius: "var(--radius-sm)", background: t ? "var(--color-bg-white)" : "#FFFBEB" }} placeholder={t ? "" : "—"} /> : <input value={t} onChange={e => setTr(prev => ({ ...prev, [k]: e.target.value }))} style={{ width: "100%", padding: "8px 10px", fontSize: 13, border: t ? "1px solid var(--color-border-light)" : "2px solid #FCD34D", borderRadius: "var(--radius-sm)", background: t ? "var(--color-bg-white)" : "#FFFBEB" }} placeholder={t ? "" : "—"} />}</div>; })}
        </div>
        <div style={{ marginTop: 20 }}><button onClick={() => saveAllTr(loc)} disabled={savingTr} className="btn btn-primary" style={{ fontSize: 13, padding: "10px 24px" }}><Save size={16} /> {savingTr ? "Saving..." : "Save All Translations"}</button></div>
      </div>}
    </div>
  );
}
