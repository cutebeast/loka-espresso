"use client";

import { useTranslation } from "@/lib/i18n";
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ArrowLeft, Save, Trash2 } from "lucide-react";
import { logError } from "@/lib/logger";

const AUDIENCES = ["admin", "staff", "customer"] as const;

interface HelpArticle {
  id: number;
  slug: string;
  title: string;
  audience: "admin" | "staff" | "customer";
  category: string | null;
  body_text: string | null;
  position: number;
  is_active: boolean;
}

export default function EditHelpArticlePage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState<Partial<HelpArticle>>({});

  const load = useCallback(async () => {
    try {
      const d = await api.get<HelpArticle>(`/admin/help-articles/${id}`);
      setForm(d);
    } catch (e) {
      logError("Failed to load help article", e);
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      await api.patch(`/admin/help-articles/${id}`, {
        ...form,
        category: form.category || null,
      });
      // Stay on the item so the editor can see the update landed
      setMsg(t("admin.common.saved"));
      setTimeout(() => setMsg(""), 2000);
    } catch (e) {
      console.error(e);
      alert(t("help.save_failed"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(t("common.confirm_delete"))) return;
    try {
      await api.del(`/admin/help-articles/${id}`);
      router.push("/help-articles");
    } catch (e: any) { console.error(e); }
  };

  if (notFound) {
    return (
      <div style={{ padding: 32, textAlign: "center" }}>
        <p style={{ marginBottom: 16, color: "var(--color-text-muted)" }}>{t("admin.common.noData")}</p>
        <button onClick={() => router.back()} className="btn btn-outline btn-sm">{t("admin.common.back")}</button>
      </div>
    );
  }

  if (loading) {
    return <div style={{ padding: 32 }}>{t("common.loading")}</div>;
  }

  return (
    <div style={{ padding: 32 }}>
      {msg && <div className="alert alert-success" style={{ marginBottom: 16 }}>{msg}</div>}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={() => router.push("/help-articles")} className="btn btn-ghost btn-sm">
          <ArrowLeft size={18} />
        </button>
        <h1 className="page-title" style={{ margin: 0 }}>{form.title || t("help.edit_article")}</h1>
      </div>
      <div className="card" style={{ padding: 24, maxWidth: 800 }}>
        <div className="df-grid">
          <div className="df-field">
            <label className="df-label">{t("help.slug")} *</label>
            <input
              value={form.slug || ""}
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
            />
          </div>
          <div className="df-field">
            <label className="df-label">{t("help.title")} *</label>
            <input
              value={form.title || ""}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <div className="df-field">
            <label className="df-label">{t("help.audience")} *</label>
            <select
              value={form.audience || "admin"}
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
              value={form.category || ""}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            />
          </div>
          <div className="df-field">
            <label className="df-label">{t("help.position")}</label>
            <input
              type="number"
              value={form.position ?? 0}
              onChange={(e) => setForm({ ...form, position: Number(e.target.value) })}
            />
          </div>
          <div className="df-field" style={{ gridColumn: "1/-1" }}>
            <label className="df-label">{t("help.body")}</label>
            <textarea
              rows={16}
              value={form.body_text || ""}
              onChange={(e) => setForm({ ...form, body_text: e.target.value })}
            />
          </div>
          <div className="df-field" style={{ gridColumn: "1/-1" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={form.is_active ?? true}
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
          <button onClick={handleDelete} className="btn btn-danger" style={{ marginLeft: "auto" }}>
            <Trash2 size={16} /> {t("common.delete")}
          </button>
        </div>
      </div>
    </div>
  );
}
