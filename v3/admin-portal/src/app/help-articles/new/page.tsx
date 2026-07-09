"use client";

import { useTranslation } from "@/lib/i18n";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ArrowLeft, Save } from "lucide-react";

const AUDIENCES = ["admin", "staff", "customer"] as const;

export default function NewHelpArticlePage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    slug: "",
    title: "",
    audience: "admin" as "admin" | "staff" | "customer",
    category: "",
    body_text: "",
    position: 0,
    is_active: true,
  });

  const save = async () => {
    setSaving(true);
    try {
      await api.post("/admin/help-articles", {
        ...form,
        category: form.category || null,
      });
      router.push("/help-articles");
    } catch (e) {
      console.error(e);
      alert(t("help.save_failed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={() => router.push("/help-articles")} className="btn btn-ghost btn-sm">
          <ArrowLeft size={18} />
        </button>
        <h1 className="page-title" style={{ margin: 0 }}>{t("help.new_article")}</h1>
      </div>
      <div className="card" style={{ padding: 24, maxWidth: 800 }}>
        <div className="df-grid">
          <div className="df-field">
            <label className="df-label">{t("help.slug")} *</label>
            <input
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
              placeholder={t("help.slug_placeholder")}
            />
          </div>
          <div className="df-field">
            <label className="df-label">{t("help.title")} *</label>
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <div className="df-field">
            <label className="df-label">{t("help.audience")} *</label>
            <select
              value={form.audience}
              onChange={(e) => setForm({ ...form, audience: e.target.value as any })}
            >
              {AUDIENCES.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
          <div className="df-field">
            <label className="df-label">{t("help.category")}</label>
            <input
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              placeholder={t("help.category_placeholder")}
            />
          </div>
          <div className="df-field">
            <label className="df-label">{t("help.position")}</label>
            <input
              type="number"
              value={form.position}
              onChange={(e) => setForm({ ...form, position: Number(e.target.value) })}
            />
          </div>
          <div className="df-field" style={{ gridColumn: "1/-1" }}>
            <label className="df-label">{t("help.body")}</label>
            <textarea
              rows={16}
              value={form.body_text}
              onChange={(e) => setForm({ ...form, body_text: e.target.value })}
              placeholder={t("help.body_placeholder")}
            />
          </div>
          <div className="df-field" style={{ gridColumn: "1/-1" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              />
              {t("help.is_active")}
            </label>
          </div>
        </div>
        <div style={{ marginTop: 24, display: "flex", gap: 12 }}>
          <button onClick={save} disabled={saving} className="btn btn-primary">
            <Save size={16} /> {saving ? t("common.saving") : t("common.save")}
          </button>
          <button onClick={() => router.push("/help-articles")} className="btn btn-outline">
            {t("common.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
