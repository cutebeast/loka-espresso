"use client";

import { useTranslation } from "@/lib/i18n";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ArrowLeft, Save } from "lucide-react";
const MECHANICS = [{
  value: "combo",
  label: "Fixed Set (combo)"
}, {
  value: "pick_x",
  label: "Pick & Choose (pick_x)"
}, {
  value: "multi_course",
  label: "Multi-Course"
}];
export default function NewBundleTypePage() {
  const {
    t
  } = useTranslation();
  const r = useRouter();
  const [f, setF] = useState({
    type_key: "",
    name: "",
    description: "",
    mechanic: "combo",
    display_order: 0,
    is_active: true
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErr("");
    try {
      const x: any = await api.post("/admin/bundle-types", {
        ...f,
        description: f.description || undefined
      });
      const id = x?.data?.id || x?.id;
      if (id) r.push(`/menu/bundle-types/${id}`);
    } catch (e: any) {
      console.error(e);
      const m = String(e?.message || "");
      const dup = m.includes("409") || /duplicate|already exists/i.test(m);
      setErr(dup ? t("menu_bundle-types_new.duplicate_key") : m || t("admin.errors.saveFailed"));
    } finally {
      setSaving(false);
    }
  };
  return <div style={{
    padding: 32
  }}>
      <div style={{
      display: "flex",
      alignItems: "center",
      gap: 12,
      marginBottom: 20
    }}>
        <button onClick={() => r.push("/menu/bundle-types")} className="btn btn-ghost btn-sm"><ArrowLeft size={18} /></button>
        <div><h1 className="page-title" style={{
          margin: 0
        }}>{t("menu_bundle-types_new.new_bundle_type")}</h1><p className="page-subtitle" style={{
          marginTop: 2
        }}>{t("menu_bundle-types.subtitle")}</p></div>
      </div>
      <form onSubmit={submit}>
        {err && <div className="alert alert-error" style={{ marginBottom: 16, maxWidth: 500 }}>{err}</div>}
        <div className="card" style={{
        padding: 24,
        maxWidth: 500
      }}>
          <div className="df-grid">
            <div className="df-field">
              <label className="form-label">{t("menu_bundle-types_new.name")}</label>
              <input required className="w-full border rounded px-3 py-2 text-sm" value={f.name} onChange={e => setF({
              ...f,
              name: e.target.value
            })} />
            </div>
            <div className="df-field">
              <label className="form-label">{t("menu_bundle-types_new.type_key")}</label>
              <input required className="w-full border rounded px-3 py-2 text-sm" value={f.type_key} onChange={e => setF({
              ...f,
              type_key: e.target.value
            })} placeholder="e.g. tasting_menu" />
            </div>
            <div className="df-field">
              <label className="form-label">{t("menu_bundle-types_new.mechanic")}</label>
              <select required className="w-full border rounded px-3 py-2 text-sm" value={f.mechanic} onChange={e => setF({
              ...f,
              mechanic: e.target.value
            })}>{MECHANICS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}</select>
            </div>
            <div className="df-field">
              <label className="form-label">{t("menu_bundle-types_new.description")}</label>
              <textarea rows={2} className="w-full border rounded px-3 py-2 text-sm" value={f.description} onChange={e => setF({
              ...f,
              description: e.target.value
            })} />
            </div>
            <div className="df-field">
              <label className="form-label">{t("menu_bundle-types_new.display_order")}</label>
              <input type="number" min="0" className="w-full border rounded px-3 py-2 text-sm" value={f.display_order} onChange={e => setF({
              ...f,
              display_order: Number(e.target.value)
            })} />
            </div>
            <div className="df-field">
              <label style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 13
            }}><input type="checkbox" checked={f.is_active} onChange={e => setF({
                ...f,
                is_active: e.target.checked
              })} />{t("menu_bundle-types_new.active")}</label>
            </div>
          </div>
          <div className="df-actions">
            <button type="button" onClick={() => r.push("/menu/bundle-types")} className="btn btn-ghost">{t("menu_bundle-types_new.cancel")}</button>
            <button type="submit" disabled={saving} className="btn btn-primary"><Save size={16} /> {saving ? t("admin.common.creating") : t("admin.common.create")}</button>
          </div>
        </div>
      </form>
    </div>;
}
