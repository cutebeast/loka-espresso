"use client";

import { useTranslation } from "@/lib/i18n";
import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { parseApiError } from "@/lib/errors";
import { ArrowLeft, Plus, Trash2, Save, Upload, RefreshCw, ChevronUp, ChevronDown } from "lucide-react";
import { useCurrency } from "@/hooks/useCurrency";
type Group = {
  id?: number;
  group_label: string;
  pick_count: number;
  min_pick: number;
  max_pick: number;
  sort_order: number;
  _origId?: number;
};
type LocaleTab = "en" | "ms" | "zh" | "ta" | "tr";
const LOCALES: {
  code: LocaleTab;
  label: string;
  flag: string;
}[] = [{
  code: "en",
  label: "English",
  flag: "🇬🇧"
}, {
  code: "ms",
  label: "BM",
  flag: "🇲🇾"
}, {
  code: "zh",
  label: "中文",
  flag: "🇨🇳"
}, {
  code: "ta",
  label: "தமிழ்",
  flag: "🇮🇳"
}, {
  code: "tr",
  label: "TR",
  flag: "🇹🇷"
}];
const TR_FIELDS = [{
  key: "title",
  label: "Title"
}, {
  key: "description",
  label: "Description"
}];
interface MenuItemOption {
  id: number;
  item_name: string;
  base_price: number;
  category_id: number;
  is_bundle_eligible?: boolean;
}
interface CategoryOption {
  id: number;
  category_name: string;
}
export default function BundleProductEditPage() {
  const {
    t
  } = useTranslation();
  const {
    symbol,
    format
  } = useCurrency();
  const p = useParams();
  const r = useRouter();
  const id = p.id as string;
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
  const [groups, setGroups] = useState<Group[]>([]);
  useEffect(() => {
    load();
    loadRefs();
  }, [id]);
  const loadRefs = async () => {
    try {
      const d = await api.getRaw<any>("/admin/menu/items?per_page=500");
      setMenuItems(d?.items || []);
    } catch (e) {
      console.error(e);
    }
    try {
      const d = await api.getRaw<any>("/admin/menu/categories?per_page=100");
      setCategories(d?.items || []);
    } catch (e) {
      console.error(e);
    }
  };
  const selectedItemIds = new Set(components.map(c => Number(c.menu_item_id)).filter(Boolean));
  const itemsForComponent = (catFilter: string) => {
    const pool = catFilter ? menuItems.filter(i => i.category_id === Number(catFilter)) : menuItems;
    return pool.filter(i => i.is_bundle_eligible || selectedItemIds.has(i.id));
  };
  const load = useCallback(async () => {
    try {
      const d = await api.getRaw<any>(`/admin/menu/bundle-products/${id}`);
      setForm({
        title: d.title || "",
        description: d.description || "",
        bundle_price: d.bundle_price?.toString() || "",
        bundle_type: d.bundle_type || "combo",
        image_url: d.image_url || "",
        is_active: d.is_active,
        display_order: d.display_order ?? 0,
        pick_count: d.pick_count?.toString() || "",
        allow_duplicates: d.allow_duplicates || false,
        max_per_order: d.max_per_order?.toString() || "1"
      });
      setImg(d.image_url || "");
      const loadedGroups: Group[] = [];
      const loadedComponents: any[] = [];
      if (d.groups && Array.isArray(d.groups)) {
        for (const g of d.groups) {
          const groupIdx = loadedGroups.length;
          loadedGroups.push({
            id: g.id,
            group_label: g.group_label || "",
            pick_count: g.pick_count ?? 1,
            min_pick: g.min_pick ?? 1,
            max_pick: g.max_pick ?? 1,
            sort_order: g.sort_order ?? groupIdx,
            _origId: g.id
          });
          if (g.components && Array.isArray(g.components)) {
            for (const c of g.components) {
              loadedComponents.push({
                id: c.id,
                menu_item_id: String(c.menu_item_id || ""),
                cat_filter: "",
                default_quantity: c.default_quantity ?? 1,
                sort_order: c.sort_order ?? 0,
                bundle_group_id: groupIdx
              });
            }
          }
        }
      }
      // Build id->index map from real DB group IDs to array indices
      const groupIdToIndex = new Map<number, number>();
      loadedGroups.forEach((g, i) => {
        if (g._origId) groupIdToIndex.set(g._origId, i);
      });
      if (d.components && Array.isArray(d.components)) {
        for (const c of d.components) {
          if (!loadedComponents.some((lc: any) => lc.id === c.id)) {
            loadedComponents.push({
              id: c.id,
              menu_item_id: String(c.menu_item_id || ""),
              cat_filter: "",
              default_quantity: c.default_quantity ?? 1,
              sort_order: c.sort_order ?? 0,
              bundle_group_id: c.bundle_group_id != null && groupIdToIndex.has(c.bundle_group_id) ? groupIdToIndex.get(c.bundle_group_id) : null
            });
          }
        }
      }
      setGroups(loadedGroups);
      setComponents(loadedComponents);
      const x: Record<string, string> = {};
      for (const lc of LOCALES) {
        if (lc.code === "en") continue;
        try {
          const rt = await api.getRaw<{
            items: {
              id: number;
              translation_key: string;
              translated_text: string;
            }[];
          }>(`/admin/translations?table_name=bundle_products&record_id=${id}&locale=${lc.code}&per_page=50`);
          if (rt?.items) for (const t of rt.items) {
            const f = t.translation_key.split(".").pop() || "";
            x[`${lc.code}:${f}`] = t.translated_text || "";
          }
        } catch (e) {
          console.error(e);
        }
      }
      setTr(x);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [id]);
  const handleUpload = async () => {
    const f = fileRef.current?.files?.[0];
    if (!f) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const j = await api.upload("/upload/image", fd);
      const url = j.url || j.filename || "";
      setForm({
        ...form,
        image_url: url
      });
      setImg(url);
    } catch (e) {
      console.error(e);
    } finally {
      setUploading(false);
    }
  };
  const handleSave = async () => {
    const isPickX = form.bundle_type === "pick_x";
    const isMultiCourse = form.bundle_type === "multi_course";
    if (!form.title) {
      setError("Title is required");
      return;
    }
    if (!form.bundle_price || Number(form.bundle_price) <= 0) {
      setError("Valid bundle price is required");
      return;
    }
    if (isMultiCourse) {
      if (groups.length === 0) {
        setError("At least one group is required");
        return;
      }
      for (const [gi, g] of groups.entries()) {
        if (!g.group_label.trim()) {
          setError("All groups must have a label");
          return;
        }
        if (!g.pick_count || g.pick_count < 1) {
          setError(`Group "${g.group_label}" needs a pick count >= 1`);
          return;
        }
        if (groupComponents(gi).length === 0) {
          setError(`Group "${g.group_label}" must have at least one component`);
          return;
        }
      }
    } else if (isPickX) {
      const pc = Number(form.pick_count);
      if (!pc || pc < 1) {
        setError("Pick count must be at least 1");
        return;
      }
      if (!form.allow_duplicates && components.length < pc) {
        setError(`Need at least ${pc} items in the pool`);
        return;
      }
      if (form.allow_duplicates && components.length < 1) {
        setError("At least one item required in the pool");
        return;
      }
    } else {
      if (components.length === 0) {
        setError("At least one component is required");
        return;
      }
    }
    for (let i = 0; i < components.length; i++) {
      const c = components[i];
      if (!c || !c.menu_item_id) {
        setError(`Item ${i + 1}: select a menu item`);
        return;
      }
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        title: form.title,
        description: form.description || "",
        bundle_price: Number(form.bundle_price) || 0,
        bundle_type: form.bundle_type,
        image_url: form.image_url || undefined,
        is_active: form.is_active,
        display_order: form.display_order ?? 0,
        max_per_order: Number(form.max_per_order) || 1
      };
      if (isPickX) {
        payload.pick_count = Number(form.pick_count);
        payload.allow_duplicates = form.allow_duplicates;
      } else {
        payload.pick_count = null;
        payload.allow_duplicates = false;
      }
      payload.components = components.filter(c => !!c.menu_item_id).map(c => {
        const entry: any = {
          menu_item_id: Number(c.menu_item_id),
          default_quantity: c.default_quantity,
          sort_order: c.sort_order,
          modifier_overrides: []
        };
        if (isMultiCourse && c.bundle_group_id !== null && c.bundle_group_id !== undefined) {
          entry.bundle_group_id = c.bundle_group_id;
        }
        return entry;
      });
      if (isMultiCourse) {
        payload.groups = groups.map((g, gi) => ({
          group_label: g.group_label,
          pick_count: g.pick_count,
          min_pick: g.min_pick,
          max_pick: g.max_pick,
          sort_order: gi
        }));
      }
      await api.patch(`/admin/menu/bundle-products/${id}`, payload);
      setSuccessMsg("Saved");
      setTimeout(() => setSuccessMsg(""), 2000);
    } catch (e: unknown) {
      setError(parseApiError(e, "Save failed"));
    } finally {
      setSaving(false);
    }
  };
  const addGroup = () => {
    const gidx = groups.length;
    setGroups([...groups, {
      group_label: "",
      pick_count: 1,
      min_pick: 1,
      max_pick: 1,
      sort_order: gidx
    }]);
  };
  const removeGroup = (gidx: number) => {
    setGroups(groups.filter((_, i) => i !== gidx));
    setComponents(components.map(c => {
      if ((c.bundle_group_id ?? null) === gidx) return {
        ...c,
        bundle_group_id: null
      };
      if ((c.bundle_group_id ?? null) !== null && (c.bundle_group_id ?? 0) > gidx) return {
        ...c,
        bundle_group_id: (c.bundle_group_id ?? 0) - 1
      };
      return c;
    }));
  };
  const updateGroup = (gidx: number, field: string, value: any) => {
    setGroups(groups.map((g, i) => {
      if (i !== gidx) return g;
      const next = {
        ...g,
        [field]: value
      };
      if (field === "pick_count") {
        next.min_pick = value;
        next.max_pick = value;
      }
      return next;
    }));
  };
  const addComponent = (groupIdx?: number) => {
    const c: any = {
      menu_item_id: "",
      cat_filter: "",
      default_quantity: 1,
      sort_order: components.length
    };
    if (groupIdx !== undefined) c.bundle_group_id = groupIdx;
    setComponents([...components, c]);
  };
  const groupComponents = (gidx: number) => components.filter((c: any) => (c.bundle_group_id ?? null) === gidx);
  const removeComponent = (idx: number) => setComponents(components.filter((_, i) => i !== idx));
  const moveComponent = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= components.length) return;
    const next = [...components];
    [next[idx], next[target]] = [next[target]!, next[idx]!];
    const sorted = next.map((c, i) => ({
      ...c,
      sort_order: i
    }));
    setComponents(sorted);
  };
  const handleDelete = async () => {
    if (!confirm("Delete this bundle product? This cannot be undone.")) return;
    try {
      await api.del(`/admin/menu/bundle-products/${id}`);
      r.push("/menu/bundle-products");
    } catch (e: unknown) {
      setError(parseApiError(e, "Failed to delete bundle"));
    }
  };
  const updateComponent = (idx: number, field: string, value: any) => {
    setComponents(components.map((c, i) => {
      if (i !== idx) return c;
      const next = {
        ...c,
        [field]: value
      };
      if (field === "cat_filter") next.menu_item_id = "";
      return next;
    }));
  };
  const upsertTr = async (field: string, locale: string, src: string, text: string) => {
    const all = await api.getRaw<{
      items: {
        id: number;
        translation_key?: string;
        translated_text?: string;
      }[];
    }>(`/admin/translations?table_name=bundle_products&record_id=${id}&column_name=${field}&locale=${locale}&per_page=1`);
    if (all?.items?.[0]) {
      await api.put(`/admin/translations/${all.items[0].id}`, {
        translated_text: text
      });
    } else {
      await api.post("/admin/translations", {
        translation_key: `bundle_products.${id}.${field}`,
        locale,
        namespace: "bundle",
        translated_text: text,
        source_text: src,
        table_name: "bundle_products",
        record_id: Number(id),
        column_name: field
      });
    }
  };
  const regenAll = async (locale: string) => {
    setRegen(true);
    try {
      const results: {
        field: string;
        text: string;
      }[] = [];
      for (const f of TR_FIELDS) {
        const src = (form[f.key] || "").trim();
        if (!src) continue;
        try {
          const r = await api.post<{
            translated_text?: string;
          }>("/admin/translations/translate", {
            text: src,
            target_locale: locale,
            source_locale: "en"
          });
          if (r?.translated_text) {
            results.push({
              field: f.key,
              text: r.translated_text
            });
            setTr(prev => ({
              ...prev,
              [`${locale}:${f.key}`]: r.translated_text!
            }));
          }
        } catch (e) {
          console.error(e);
        }
      }
      for (const r of results) {
        try {
          await upsertTr(r.field, locale, (form[r.field] || "").trim(), r.text);
        } catch (e) {
          console.error(e);
        }
      }
      setSuccessMsg(results.length > 0 ? `Regenerated ${results.length} translations` : "No translatable content");
      setTimeout(() => setSuccessMsg(""), 2500);
    } finally {
      setRegen(false);
    }
  };
  const saveAllTr = async (locale: string) => {
    setSavingTr(true);
    try {
      for (const f of TR_FIELDS) {
        const key = `${locale}:${f.key}`;
        const text = tr[key] || "";
        if (text.trim()) await upsertTr(f.key, locale, form[f.key] || "", text);
      }
      setSuccessMsg(`Saved`);
      setTimeout(() => setSuccessMsg(""), 2000);
    } finally {
      setSavingTr(false);
    }
  };
  if (loading) return <div style={{
    padding: 32
  }}><p>{t("menu_bundle-products_[id].loading")}</p></div>;
  return <div style={{
    padding: 32,
    height: "100%",
    overflow: "auto"
  }}>
      <div style={{
      display: "flex",
      alignItems: "center",
      gap: 12,
      marginBottom: 20
    }}>
        <button onClick={() => r.push("/menu/bundle-products")} className="btn btn-ghost btn-sm"><ArrowLeft size={18} /></button>
        <div><h1 className="page-title" style={{
          margin: 0
        }}>{form.title || "Bundle Product"}</h1><p className="page-subtitle" style={{
          marginTop: 2
        }}>{t("menu_bundle-products_[id].edit_details_translations")}</p></div>
      </div>
      {error && <div className="alert alert-error" style={{
      marginBottom: 12
    }}>{error}</div>}
      {successMsg && <div className="alert alert-success" style={{
      marginBottom: 12
    }}>{successMsg}</div>}

      <div style={{
      display: "flex",
      gap: 4,
      marginBottom: 20,
      borderBottom: "2px solid var(--color-border-light)",
      paddingBottom: 0
    }}>
        {LOCALES.map(l => <button key={l.code} onClick={() => setLoc(l.code)} style={{
        padding: "10px 20px",
        fontSize: 13,
        fontWeight: loc === l.code ? 700 : 400,
        border: "none",
        borderBottom: loc === l.code ? "3px solid var(--color-primary)" : "3px solid transparent",
        background: loc === l.code ? "rgba(59,74,26,0.05)" : "transparent",
        cursor: "pointer",
        color: loc === l.code ? "var(--color-primary)" : "var(--color-text-muted)",
        borderRadius: "4px 4px 0 0"
      }}>{l.flag} {l.label}</button>)}
      </div>

      {loc === "en" && <div className="card" style={{
      padding: "24px 24px 400px 24px",
      maxWidth: 800
    }}>
        <h3 style={{
        marginBottom: 20
      }}>{t("menu_bundle-products_[id].english_source_content")}</h3>
        <div className="df-grid">
          <div className="df-field" style={{
          gridColumn: "1/-1"
        }}><label className="df-label">{t("menu_bundle-products_[id].title")}</label><input required value={form.title} onChange={e => setForm({
            ...form,
            title: e.target.value
          })} /></div>
          <div className="df-field"><label className="df-label">{t("menu_bundle-products_[id].bundle_type")}</label><select value={form.bundle_type} onChange={e => setForm({
            ...form,
            bundle_type: e.target.value
          })}><option value="combo">{t("menu_bundle-products_[id].combo")}</option><option value="value_meal">{t("menu_bundle-products_[id].value_meal")}</option><option value="family_meal">{t("menu_bundle-products_[id].family_meal")}</option><option value="breakfast_set">{t("menu_bundle-products_[id].breakfast_set")}</option><option value="promotional">{t("menu_bundle-products_[id].promotional")}</option><option value="pick_x">{t("menu_bundle-products_[id].pick_x_build_your_own")}</option><option value="multi_course">{t("menu_bundle-products_[id].multi_course")}</option></select></div>
          <div className="df-field"><label className="df-label">{t("menu_bundle-products_[id].bundle_price")}{symbol}) *</label><input type="number" step="0.01" min="0" required value={form.bundle_price} onChange={e => setForm({
            ...form,
            bundle_price: e.target.value
          })} /></div>

          {form.bundle_type === "pick_x" && <>
              <div className="df-field">
                <label className="df-label">{t("menu_bundle-products_[id].pick_count")}</label>
                <input type="number" min={1} step={1} required value={form.pick_count || ""} onChange={e => setForm({
              ...form,
              pick_count: e.target.value
            })} placeholder={t("menu_bundle-products_[id].e_g_3")} />
                <span style={{
              fontSize: 11,
              color: "var(--color-text-muted)"
            }}>{t("menu_bundle-products_[id].number_of_items_the_customer_must")}</span>
              </div>
              <div className="df-field">
                <label className="df-label" style={{
              display: "flex",
              alignItems: "center",
              gap: 8
            }}>
                  <input type="checkbox" checked={form.allow_duplicates || false} onChange={e => setForm({
                ...form,
                allow_duplicates: e.target.checked
              })} />{t("menu_bundle-products_[id].allow_duplicate_picks")}</label>
                <span style={{
              fontSize: 11,
              color: "var(--color-text-muted)"
            }}>{t("menu_bundle-products_[id].customer_can_pick_the_same_item")}</span>
                {form.allow_duplicates && <span style={{
              fontSize: 11,
              color: "var(--color-text-muted)",
              display: "block",
              marginTop: 2
            }}>{t("menu_bundle-products_[id].max_quantity_per_item_pick_count")}{form.pick_count || "?"})
                  </span>}
              </div>
            </>}
          {form.bundle_type === "pick_x" && components.filter((c: any) => c.menu_item_id).length > 0 && <div className="df-field" style={{
          gridColumn: "1/-1"
        }}>
              <div style={{
            background: "var(--color-warning-light, #FDF5E6)",
            border: "1px solid var(--color-warning, #C9A84C)",
            borderRadius: "var(--radius-sm, 6px)",
            padding: "8px 12px",
            fontSize: 12,
            color: "var(--color-text-secondary)",
            marginBottom: 8
          }}>
                {(() => {
              const pickN = Number(form.pick_count) || 1;
              const prices = components.filter((c: any) => c.menu_item_id).map((c: any) => {
                const mi = menuItems.find((m: any) => m.id === Number(c.menu_item_id));
                return mi ? mi.base_price : 0;
              }).sort((a: number, b: number) => a - b);
              const cheapestSum = prices.slice(0, Math.min(pickN, prices.length)).reduce((s: number, p: number) => s + p, 0);
              return `Cheapest ${pickN} items total ${symbol} ${cheapestSum.toFixed(2)}. Set bundle price ≤ ${symbol} ${cheapestSum.toFixed(2)} for the deal to always apply.`;
            })()}
              </div>
            </div>}
          <div className="df-field" style={{
          gridColumn: "1/-1"
        }}><label className="df-label">{t("menu_bundle-products_[id].description")}</label><textarea rows={3} maxLength={500} value={form.description} onChange={e => setForm({
            ...form,
            description: e.target.value
          })} /></div>
          <div className="df-field" style={{
          gridColumn: "1/-1"
        }}>
            <label className="df-label">{t("menu_bundle-products_[id].image")}</label>
            <div style={{
            display: "flex",
            gap: 12,
            alignItems: "center"
          }}><input ref={fileRef} type="file" accept="image/*" onChange={handleUpload} style={{
              display: "none"
            }} /><button type="button" onClick={() => fileRef.current?.click()} className="btn btn-sm btn-outline" disabled={uploading}><Upload size={14} /> {uploading ? "Uploading..." : "Upload Image"}</button>{img && <><img src={img} alt="" style={{
                width: 48,
                height: 48,
                borderRadius: 6,
                objectFit: "cover"
              }} /><button type="button" onClick={() => {
                setForm({
                  ...form,
                  image_url: ""
                });
                setImg("");
              }} className="btn btn-ghost btn-sm" style={{
                color: "var(--color-error)"
              }}>{t("menu_bundle-products_[id].clear")}</button></>}</div>
          </div>
          <div className="df-field"><label className="df-label">{t("menu_bundle-products_[id].display_order")}</label><input type="number" min="0" value={form.display_order} onChange={e => setForm({
            ...form,
            display_order: Number(e.target.value)
          })} /></div>
          <div className="df-field"><label className="df-label">{t("menu_bundle-products_[id].max_per_order")}</label><input type="number" min="1" step="1" value={form.max_per_order} onChange={e => setForm({
            ...form,
            max_per_order: e.target.value
          })} /></div>
          <div className="df-field"><label className="df-label" style={{
            display: "flex",
            alignItems: "center",
            gap: 8
          }}><input type="checkbox" checked={form.is_active} onChange={e => setForm({
              ...form,
              is_active: e.target.checked
            })} />{t("menu_bundle-products_[id].active")}</label></div>
        </div>

        {form.bundle_type === "multi_course" ? <div style={{
        marginTop: 24
      }}>
            <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12
        }}>
              <h3 style={{
            fontSize: 15,
            fontWeight: 700,
            margin: 0
          }}>{t("menu_bundle-products_[id].groups")}</h3>
              <button type="button" onClick={addGroup} className="btn btn-sm btn-outline" style={{
            display: "flex",
            alignItems: "center",
            gap: 4
          }}><Plus size={14} />{t("menu_bundle-products_[id].add_group")}</button>
            </div>
            {groups.length === 0 && <p style={{
          fontSize: 13,
          color: "var(--color-text-muted)",
          marginBottom: 16
        }}>{t("menu_bundle-products_[id].no_groups_defined_click_add_group")}</p>}
            {groups.map((g, gi) => <div key={gi} style={{
          background: "var(--color-bg-muted)",
          borderRadius: 12,
          padding: 16,
          marginBottom: 16,
          border: "1px solid var(--color-border-light)"
        }}>
                <div style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            marginBottom: 12,
            flexWrap: "wrap"
          }}>
                  <input value={g.group_label} onChange={e => updateGroup(gi, "group_label", e.target.value)} placeholder={t("menu_bundle-products_[id].group_label_e_g_choose_your")} style={{
              flex: 1,
              minWidth: 200,
              padding: "6px 10px",
              fontSize: 13,
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--color-border-light)"
            }} />
                  <label style={{
              fontSize: 12,
              display: "flex",
              alignItems: "center",
              gap: 4,
              whiteSpace: "nowrap"
            }}>{t("menu_bundle-products_[id].pick")}<input type="number" min={1} step={1} value={g.pick_count} onChange={e => updateGroup(gi, "pick_count", Number(e.target.value))} style={{
                width: 55,
                padding: "4px 6px",
                fontSize: 12,
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--color-border-light)"
              }} /></label>
                  <label style={{
              fontSize: 12,
              display: "flex",
              alignItems: "center",
              gap: 4,
              whiteSpace: "nowrap"
            }}>{t("menu_bundle-products_[id].max")}<input type="number" min={1} step={1} value={g.max_pick} onChange={e => updateGroup(gi, "max_pick", Number(e.target.value))} style={{
                width: 55,
                padding: "4px 6px",
                fontSize: 12,
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--color-border-light)"
              }} /></label>
                  <button type="button" onClick={() => removeGroup(gi)} className="btn btn-ghost btn-sm" style={{
              color: "var(--color-error)"
            }}><Trash2 size={14} /></button>
                </div>
                {g.max_pick > g.pick_count && <p style={{
            fontSize: 11,
            color: "var(--color-info)",
            margin: "0 0 8px"
          }}>{t("menu_bundle-products_[id].extras_allowed_up_to")}{g.max_pick}{t("menu_bundle-products_[id].items_extra_items_are_charged_at")}</p>}
                <div style={{
            borderTop: "1px solid var(--color-border-light)",
            paddingTop: 8
          }}>
                  <div style={{
              fontSize: 12,
              fontWeight: 600,
              marginBottom: 8,
              color: "var(--color-text-muted)"
            }}>{t("menu_bundle-products_[id].group_items")}</div>
                  {groupComponents(gi).map((c, i) => {
              const {
                t
              } = useTranslation();
              const ci = components.indexOf(c);
              return <div key={i} style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                marginBottom: 6
              }}>
                        <select value={c.cat_filter || ""} onChange={e => updateComponent(ci, "cat_filter", e.target.value)} style={{
                  width: 130,
                  padding: "4px 8px",
                  fontSize: 12,
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--color-border-light)"
                }}>
                          <option value="">{t("menu_bundle-products_[id].all_categories")}</option>
                          {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.category_name}</option>)}
                        </select>
                        <select value={c.menu_item_id} onChange={e => updateComponent(ci, "menu_item_id", e.target.value)} style={{
                  flex: 1,
                  padding: "4px 8px",
                  fontSize: 12,
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--color-border-light)"
                }} required>
                          <option value="">{t("menu_bundle-products_[id].select_item")}</option>
                          {itemsForComponent(c.cat_filter || "").map(m => <option key={m.id} value={m.id}>{m.item_name} ({format(m.base_price)})</option>)}
                        </select>
                        <label style={{
                  fontSize: 12,
                  display: "flex",
                  alignItems: "center",
                  gap: 4
                }}>{t("menu_bundle-products_[id].qty")}<input type="number" min={1} value={c.default_quantity} onChange={e => updateComponent(ci, "default_quantity", Number(e.target.value))} style={{
                    width: 50,
                    padding: "4px 6px",
                    fontSize: 12,
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--color-border-light)"
                  }} /></label>
                        <button type="button" onClick={() => removeComponent(ci)} className="btn btn-ghost btn-sm" style={{
                  color: "var(--color-error)"
                }}><Trash2 size={14} /></button>
                      </div>;
            })}
                  <button type="button" onClick={() => addComponent(gi)} className="btn btn-ghost btn-sm" style={{
              fontSize: 12,
              paddingLeft: 0
            }}><Plus size={12} />{t("menu_bundle-products_[id].add_item_to")}{g.group_label || "this group"}</button>
                </div>
              </div>)}
          </div> : <>
            <div style={{
          marginTop: 24,
          marginBottom: 8,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }}>
              <h3 style={{
            fontSize: 15,
            fontWeight: 700,
            margin: 0
          }}>{form.bundle_type === "pick_x" ? "Selectable Items Pool" : "Components"}</h3>
              <button type="button" onClick={() => addComponent()} className="btn btn-sm btn-outline" style={{
            display: "flex",
            alignItems: "center",
            gap: 4
          }}><Plus size={14} />{t("menu_bundle-products_[id].add")}</button>
            </div>
            {components.length === 0 && <p style={{
          fontSize: 13,
          color: "var(--color-text-muted)",
          marginBottom: 8
        }}>{form.bundle_type === "pick_x" ? "No items in pool. Click &quot;Add&quot; to include selectable items." : "No components added. Click &quot;Add&quot; to include menu items in this bundle."}</p>}
            {components.map((c, i) => <div key={i} style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          marginBottom: 8,
          padding: "8px 12px",
          background: "var(--color-bg-muted)",
          borderRadius: "var(--radius-md)",
          flexWrap: "wrap"
        }}>
                <select value={c.cat_filter || ""} onChange={e => updateComponent(i, "cat_filter", e.target.value)} style={{
            width: 130,
            padding: "6px 10px",
            fontSize: 12,
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--color-border-light)"
          }}>
                  <option value="">{t("menu_bundle-products_[id].all_categories_2")}</option>
                  {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.category_name}</option>)}
                </select>
                <select value={c.menu_item_id} onChange={e => updateComponent(i, "menu_item_id", e.target.value)} style={{
            flex: 1,
            minWidth: 160,
            padding: "6px 10px",
            fontSize: 13,
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--color-border-light)"
          }} required>
                  <option value="">{t("menu_bundle-products_[id].select_item_2")}</option>
                  {itemsForComponent(c.cat_filter || "").map(m => <option key={m.id} value={m.id}>{m.item_name} ({format(m.base_price)})</option>)}
                </select>
                <label style={{
            fontSize: 12,
            display: "flex",
            alignItems: "center",
            gap: 4
          }}>{t("menu_bundle-products_[id].qty_2")}<input type="number" min={1} value={c.default_quantity} onChange={e => updateComponent(i, "default_quantity", Number(e.target.value))} style={{
              width: 50,
              padding: "4px 6px",
              fontSize: 12,
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--color-border-light)"
            }} /></label>
                <button type="button" onClick={() => moveComponent(i, -1)} disabled={i === 0} className="btn btn-ghost btn-sm" style={{
            padding: "4px",
            opacity: i === 0 ? 0.3 : 1
          }} aria-label={t("menu_bundle-products_[id].move_up")}><ChevronUp size={14} /></button>
                <button type="button" onClick={() => moveComponent(i, 1)} disabled={i === components.length - 1} className="btn btn-ghost btn-sm" style={{
            padding: "4px",
            opacity: i === components.length - 1 ? 0.3 : 1
          }} aria-label={t("menu_bundle-products_[id].move_down")}><ChevronDown size={14} /></button>
                <button type="button" onClick={() => removeComponent(i)} className="btn btn-ghost btn-sm" style={{
            color: "var(--color-error)"
          }}><Trash2 size={14} /></button>
              </div>)}
          </>}

        <div className="df-actions" style={{
        marginTop: 20
      }}><button type="button" onClick={() => r.push("/menu/bundle-products")} className="btn btn-ghost">{t("menu_bundle-products_[id].cancel")}</button><button type="button" onClick={handleDelete} className="btn btn-ghost" style={{
          color: "var(--color-error)",
          marginLeft: "auto",
          marginRight: 8
        }}>{t("menu_bundle-products_[id].delete_bundle")}</button><button onClick={handleSave} disabled={saving} className="btn btn-primary"><Save size={16} /> {saving ? "Saving..." : "Save Changes"}</button></div>
      </div>}

      {loc !== "en" && <div className="card" style={{
      padding: 24,
      maxWidth: 720
    }}>
        <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 20
      }}><h3 style={{
          margin: 0,
          fontSize: 16
        }}>{LOCALES.find(l => l.code === loc)?.flag} {LOCALES.find(l => l.code === loc)?.label}{t("menu_bundle-products_[id].translation")}</h3><button onClick={() => regenAll(loc)} disabled={regen} className="btn btn-primary btn-sm" style={{
          fontSize: 12,
          padding: "8px 16px"
        }}><RefreshCw size={14} /> {regen ? "Generating..." : "Regenerate All"}</button></div>
        <div className="df-grid">
          {TR_FIELDS.map(f => {
          const {
            t: _t
          } = useTranslation();
          const k = `${loc}:${f.key}`;
          const t = tr[k] || "";
          const s = form[f.key] || "";
          const isLong = f.key === "description";
          return <div className="df-field" key={f.key} style={isLong ? {
            gridColumn: "1/-1"
          } : {}}><label style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--color-text-muted)",
              display: "flex",
              justifyContent: "space-between"
            }}><span>{f.label}</span><span style={{
                fontWeight: 400,
                fontStyle: "italic"
              }}>{_t("menu_bundle-products_[id].en")}{s?.slice(0, 30) || "—"}</span></label>{isLong ? <textarea rows={3} value={t} onChange={e => setTr(prev => ({
              ...prev,
              [k]: e.target.value
            }))} style={{
              width: "100%",
              padding: "8px 10px",
              fontSize: 13,
              border: t ? "1px solid var(--color-border-light)" : "2px solid #FCD34D",
              borderRadius: "var(--radius-sm)",
              background: t ? "var(--color-bg-white)" : "#FFFBEB"
            }} placeholder={t ? "" : "—"} /> : <input value={t} onChange={e => setTr(prev => ({
              ...prev,
              [k]: e.target.value
            }))} style={{
              width: "100%",
              padding: "8px 10px",
              fontSize: 13,
              border: t ? "1px solid var(--color-border-light)" : "2px solid #FCD34D",
              borderRadius: "var(--radius-sm)",
              background: t ? "var(--color-bg-white)" : "#FFFBEB"
            }} placeholder={t ? "" : "—"} />}</div>;
        })}
        </div>
        <div style={{
        marginTop: 20
      }}><button onClick={() => saveAllTr(loc)} disabled={savingTr} className="btn btn-primary" style={{
          fontSize: 13,
          padding: "10px 24px"
        }}><Save size={16} /> {savingTr ? "Saving..." : "Save All Translations"}</button></div>
      </div>}
    </div>;
}