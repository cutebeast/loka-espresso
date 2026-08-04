"use client";

import { useTranslation } from "@/lib/i18n";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ArrowLeft, Save } from "lucide-react";
export default function NewEventCategoryPage() {
  const {
    t
  } = useTranslation();
  const r = useRouter();
  const [f, setF] = useState({
    name: "",
    slug: "",
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
      const x: any = await api.post("/admin/event-categories", f);
      const id = x?.data?.id || x?.id;
      if (id) r.push(`/events/categories/${id}`);
    } catch (e: any) {
      console.error(e);
      setErr(e.message || t("admin.errors.saveFailed"));
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
        <button onClick={() => r.push("/events/categories")} className="btn btn-ghost btn-sm"><ArrowLeft size={18} /></button>
        <h1 className="page-title" style={{
        margin: 0
      }}>{t("events_categories_new.new_event_category")}</h1>
      </div>
      <form onSubmit={submit}>
        {err && <div className="alert alert-error" style={{ marginBottom: 16, maxWidth: 500 }}>{err}</div>}
        <div className="card" style={{
        padding: 24,
        maxWidth: 500
      }}>
          <div className="df-grid">
            <div className="df-field">
              <label className="form-label">{t("events_categories_new.name")}</label>
              <input required className="w-full border rounded px-3 py-2 text-sm" value={f.name} onChange={e => setF({
              ...f,
              name: e.target.value
            })} />
            </div>
            <div className="df-field">
              <label className="form-label">{t("events_categories_new.slug")}</label>
              <input required className="w-full border rounded px-3 py-2 text-sm" value={f.slug} onChange={e => setF({
              ...f,
              slug: e.target.value
            })} />
            </div>
            <div className="df-field">
              <label className="form-label">{t("events_categories_new.display_order")}</label>
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
              })} />{t("events_categories_new.active")}</label>
            </div>
          </div>
          <div className="df-actions">
            <button type="button" onClick={() => r.push("/events/categories")} className="btn btn-ghost">{t("events_categories_new.cancel")}</button>
            <button type="submit" disabled={saving} className="btn btn-primary"><Save size={16} /> {saving ? t("admin.common.creating") : t("admin.common.create")}</button>
          </div>
        </div>
      </form>
    </div>;
}
