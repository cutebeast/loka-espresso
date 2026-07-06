"use client";

import { useTranslation } from "@/lib/i18n";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ArrowLeft, Save } from "lucide-react";
export default function NewCategoryPage() {
  const {
    t
  } = useTranslation();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    category_name: "",
    slug: "",
    description: "",
    is_active: true
  });
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form
      };
      if (!payload.slug) payload.slug = payload.category_name.toLowerCase().replace(/[^a-z0-9]/g, "-");
      const r: any = await api.post("/admin/inventory/categories", payload);
      const id = r?.id;
      if (id) router.push(`/inventory/categories/${id}`);else router.push("/inventory/categories");
    } catch (err: any) {
      setError(err.message);
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
        <button onClick={() => router.push("/inventory/categories")} className="btn btn-ghost btn-sm"><ArrowLeft size={18} /></button>
        <h1 className="page-title" style={{
        margin: 0
      }}>{t("inventory_categories_new.new_category")}</h1>
      </div>
      {error && <div className="alert alert-error" style={{
      marginBottom: 16
    }}>{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="card" style={{
        padding: 24,
        maxWidth: 500
      }}>
          <div className="df-grid">
            <div className="df-field"><label className="form-label">{t("inventory_categories_new.name")}</label><input required className="w-full border rounded px-3 py-2 text-sm" value={form.category_name} onChange={e => setForm({
              ...form,
              category_name: e.target.value
            })} /></div>
            <div className="df-field"><label className="form-label">{t("inventory_categories_new.slug")}</label><input className="w-full border rounded px-3 py-2 text-sm" value={form.slug} onChange={e => setForm({
              ...form,
              slug: e.target.value
            })} placeholder={t("inventory_categories_new.auto_generated")} /></div>
            <div className="df-field" style={{
            gridColumn: "1/-1"
          }}><label className="form-label">{t("inventory_categories_new.description")}</label><input className="w-full border rounded px-3 py-2 text-sm" value={form.description} onChange={e => setForm({
              ...form,
              description: e.target.value
            })} /></div>
            <div className="df-field"><label style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 13
            }}><input type="checkbox" checked={form.is_active} onChange={e => setForm({
                ...form,
                is_active: e.target.checked
              })} />{t("inventory_categories_new.active")}</label></div>
          </div>
          <div className="df-actions"><button type="button" onClick={() => router.push("/inventory/categories")} className="btn btn-ghost">{t("inventory_categories_new.cancel")}</button><button type="submit" disabled={saving} className="btn btn-primary"><Save size={16} /> {saving ? "Saving..." : "Create"}</button></div>
        </div>
      </form>
    </div>;
}