"use client";

import { useTranslation } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

const CHANNELS = ["in_app", "push_notification", "sms", "whatsapp"];
const PRIORITIES = ["low", "normal", "high", "urgent"];

interface EventMeta {
  event_key: string;
  label: string;
  category: string;
  variables: string[];
}

interface Props {
  form: Record<string, any>;
  setForm: (f: Record<string, any>) => void;
  previewSample: Record<string, string>;
}

/** Transactional engine fields for the template editor (event picker,
 *  channels, priority, action URL, variables + live preview). */
export default function TransactionalTemplateFields({ form, setForm, previewSample }: Props) {
  const { t } = useTranslation();
  const [events, setEvents] = useState<EventMeta[]>([]);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    api.getRaw<any>("/admin/notifications/events").then((d) => {
      setEvents(Array.isArray(d) ? d : d?.items || d?.data || []);
    }).catch(() => {});
  }, []);

  const selected = events.find((e) => e.event_key === form.event_key);
  const variables = selected?.variables || [];

  const renderPreview = (text: string) => {
    let out = text || "";
    for (const v of variables) {
      out = out.replaceAll(`{${v}}`, previewSample[v] || `{${v}}`);
    }
    return out;
  };

  const toggleChannel = (c: string) => {
    const cur = new Set(form.channels || ["in_app"]);
    if (cur.has(c)) {
      if (c === "in_app") return; // inbox is always implied
      cur.delete(c);
    } else {
      cur.add(c);
    }
    setForm({ ...form, channels: Array.from(cur) });
  };

  return (
    <>
      <div className="df-field" style={{ gridColumn: "1/-1" }}>
        <label className="df-label">{t("notifications_templates_new.event")}</label>
        <select
          value={form.event_key || ""}
          onChange={(e) =>
            setForm({ ...form, event_key: e.target.value || null, variables: [] })
          }
        >
          <option value="">{t("notifications_templates_new.manual_only")}</option>
          {events.map((ev) => (
            <option key={ev.event_key} value={ev.event_key}>
              {ev.label} ({ev.event_key})
            </option>
          ))}
        </select>
        {selected && (
          <p style={{ fontSize: 12, color: "var(--color-text-muted)", margin: "6px 0 0" }}>
            {t("notifications_templates_new.auto_send_hint")}
          </p>
        )}
      </div>

      {selected && (
        <>
          <div className="df-field" style={{ gridColumn: "1/-1" }}>
            <label className="df-label">{t("notifications_templates_new.enabled")}</label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={form.is_enabled !== false}
                onChange={(e) => setForm({ ...form, is_enabled: e.target.checked })}
              />
              <span>{t("notifications_templates_new.send_automatically")}</span>
            </label>
          </div>

          <div className="df-field" style={{ gridColumn: "1/-1" }}>
            <label className="df-label">{t("notifications_templates_new.channels")}</label>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {CHANNELS.map((c) => (
                <label key={c} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={(form.channels || ["in_app"]).includes(c)}
                    disabled={c === "in_app"}
                    onChange={() => toggleChannel(c)}
                  />
                  <span>{c === "in_app" ? "Inbox (always)" : c.replace("_", " ")}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="df-field">
            <label className="df-label">{t("notifications_templates_new.priority")}</label>
            <select
              value={form.priority || "normal"}
              onChange={(e) => setForm({ ...form, priority: e.target.value })}
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          <div className="df-field" style={{ gridColumn: "1/-1" }}>
            <label className="df-label">{t("notifications_templates_new.action_url")}</label>
            <input
              value={form.action_url_template || ""}
              placeholder="#orders"
              onChange={(e) => setForm({ ...form, action_url_template: e.target.value })}
            />
          </div>

          <div className="df-field" style={{ gridColumn: "1/-1" }}>
            <label className="df-label">{t("notifications_templates_new.variables")}</label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {variables.map((v) => (
                <code key={v} style={{ background: "var(--color-bg-light)", padding: "2px 8px", borderRadius: 6, fontSize: 12 }}>
                  {"{" + v + "}"}
                </code>
              ))}
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ marginTop: 8 }}
              onClick={() => setShowPreview((s) => !s)}
            >
              {t("notifications_templates_new.preview")}
            </button>
            {showPreview && (
              <div style={{ background: "#FDF8EE", border: "1px dashed var(--color-border-light)", borderRadius: 8, padding: 12, marginTop: 8 }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>{renderPreview(form.title) || "—"}</div>
                <div style={{ fontSize: 13, color: "var(--color-text-muted)", whiteSpace: "pre-wrap" }}>
                  {renderPreview(form.body) || "—"}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
