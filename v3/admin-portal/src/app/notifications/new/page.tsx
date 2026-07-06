"use client";

import { useTranslation } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ArrowLeft, Save } from "lucide-react";
import { useAudienceSegments } from "@/lib/useAudienceSegments";
const TYPES = ["general", "order", "reward", "wallet", "loyalty", "promo", "info", "event"];
interface Template {
  id: number;
  name: string;
  title: string;
  body?: string;
  notification_type: string;
  audience_segment: string;
}
export default function NotificationNewPage() {
  const {
    t
  } = useTranslation();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [templates, setTemplates] = useState<Template[]>([]);
  const {
    allSegments: AUDIENCES
  } = useAudienceSegments();
  const [form, setForm] = useState({
    title: "",
    body: "",
    notification_type: "general",
    audience_segment: "all_users",
    image_url: "",
    action_url: "",
    scheduled_at: "",
    status: "draft"
  });
  useEffect(() => {
    api.get<{
      items: Template[];
    }>("/admin/notifications/templates/list").then(d => setTemplates(Array.isArray(d) ? d : d.items || [])).catch(e => {
      console.error('templates:', e);
    });
  }, []);
  const [selTemplate, setSelTemplate] = useState("");
  const applyTemplate = () => {
    const t = templates.find(x => x.id === Number(selTemplate));
    if (t) setForm({
      ...form,
      title: t.title,
      body: t.body || "",
      notification_type: t.notification_type,
      audience_segment: t.audience_segment
    });
  };
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/admin/notifications", form);
      router.push("/notifications");
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
    }}><button onClick={() => router.push("/notifications")} className="btn btn-ghost btn-sm"><ArrowLeft size={18} /></button><div><h1 className="page-title" style={{
          margin: 0
        }}>{t("notifications_new.new_notification")}</h1></div></div>
      {error && <div className="alert alert-error" style={{
      marginBottom: 16
    }}>{error}</div>}

      {templates.length > 0 && <div style={{
      marginBottom: 16,
      padding: 10,
      background: "var(--color-bg-muted)",
      borderRadius: "var(--radius-sm)"
    }}>
          <div style={{
        fontSize: 12,
        fontWeight: 600,
        marginBottom: 6
      }}>{t("notifications_new.quick_fill_from_template")}</div>
          <div style={{
        marginBottom: 16,
        padding: 12,
        background: "var(--color-bg-muted)",
        borderRadius: "var(--radius-sm)",
        display: "flex",
        alignItems: "center",
        gap: 8
      }}>
            <label htmlFor="apply-template" style={{
          fontSize: 12,
          fontWeight: 600,
          whiteSpace: "nowrap"
        }}>{t("notifications_new.apply_template")}</label>
            <select id="apply-template" value={selTemplate} onChange={e => setSelTemplate(e.target.value)} style={{
          flex: 1,
          padding: "6px 10px",
          fontSize: 12,
          borderRadius: "var(--radius-sm)",
          border: "1px solid var(--color-border-light)"
        }}>
              <option value="">{t("notifications_new.select_a_template")}</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            {selTemplate && <button type="button" onClick={applyTemplate} className="btn btn-sm btn-primary" style={{
          fontSize: 11
        }}>{t("notifications_new.apply")}</button>}
          </div>
          <div style={{
        marginBottom: 16,
        fontSize: 11,
        color: "var(--color-text-muted)",
        fontStyle: "italic"
      }}>{t("notifications_new.tip_create_templates_for_reusable_messages")}</div>
        </div>}

      <div className="card" style={{
      padding: 24,
      maxWidth: 700
    }}>
        <form onSubmit={handleSubmit}><div className="df-grid">
          <div className="df-field" style={{
            gridColumn: "1/-1"
          }}><label className="df-label">{t("notifications_new.title")}</label><input required value={form.title} onChange={e => setForm({
              ...form,
              title: e.target.value
            })} /></div>
          <div className="df-field"><label className="df-label">{t("notifications_new.type")}</label><select value={form.notification_type} onChange={e => setForm({
              ...form,
              notification_type: e.target.value
            })}>{TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
          <div className="df-field"><label className="df-label">{t("notifications_new.audience")}</label><select value={form.audience_segment} onChange={e => setForm({
              ...form,
              audience_segment: e.target.value
            })}>{AUDIENCES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}</select></div>
          <div className="df-field" style={{
            gridColumn: "1/-1"
          }}><label className="df-label">{t("notifications_new.body")}</label><textarea rows={4} value={form.body} onChange={e => setForm({
              ...form,
              body: e.target.value
            })} placeholder={t("notifications_new.notification_message")} /></div>
          <div className="df-field" style={{
            gridColumn: "1/-1"
          }}><label className="df-label">{t("notifications_new.image_url_optional")}</label><input value={form.image_url} onChange={e => setForm({
              ...form,
              image_url: e.target.value
            })} placeholder={t("notifications_new.https")} /></div>
          <div className="df-field" style={{
            gridColumn: "1/-1"
          }}><label className="df-label">{t("notifications_new.action_url_optional")}</label><input value={form.action_url} onChange={e => setForm({
              ...form,
              action_url: e.target.value
            })} placeholder={t("notifications_new.deep_link")} /></div>
          <div className="df-field"><label className="df-label">{t("notifications_new.schedule")}</label><input type="datetime-local" value={form.scheduled_at} onChange={e => setForm({
              ...form,
              scheduled_at: e.target.value
            })} /><div className="df-hint">{t("notifications_new.leave_empty_for_draft")}</div></div>
          <div className="df-field"><label className="df-label">{t("notifications_new.status")}</label><select value={form.status} onChange={e => setForm({
              ...form,
              status: e.target.value
            })}><option value="draft">{t("notifications_new.draft")}</option><option value="scheduled">{t("notifications_new.scheduled")}</option></select></div>
        </div><div className="df-actions" style={{
          marginTop: 20
        }}><button type="button" onClick={() => router.push("/notifications")} className="btn btn-ghost">{t("notifications_new.cancel")}</button><button type="submit" className="btn btn-primary" disabled={saving}><Save size={16} />{saving ? "Creating..." : "Create Notification"}</button></div></form>
      </div>
    </div>;
}