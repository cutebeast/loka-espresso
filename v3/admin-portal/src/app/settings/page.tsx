"use client";

import { useTranslation } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Save } from "lucide-react";
interface ConfigItem {
  id: number;
  config_key: string;
  config_value: string | null;
  value_type: string;
  is_sensitive: boolean;
  is_editable: boolean;
}
const SECTIONS: {
  titleKey: string;
  descriptionKey: string;
  prefix: string;
}[] = [{
  titleKey: "settings.section_app",
  descriptionKey: "settings.section_app_desc",
  prefix: "app."
}, {
  titleKey: "settings.section_otp",
  descriptionKey: "settings.section_otp_desc",
  prefix: "otp."
}, {
  titleKey: "settings.section_orders",
  descriptionKey: "settings.section_orders_desc",
  prefix: "order."
}, {
  titleKey: "settings.section_notifications",
  descriptionKey: "settings.section_notifications_desc",
  prefix: "notifications."
}, {
  titleKey: "settings.section_upload",
  descriptionKey: "settings.section_upload_desc",
  prefix: "upload."
}, {
  titleKey: "settings.section_reservation",
  descriptionKey: "settings.section_reservation_desc",
  prefix: "reservation."
}, {
  titleKey: "settings.section_payments",
  descriptionKey: "settings.section_payments_desc",
  prefix: "stripe."
}];
function ConfigRow({
  item,
  onSave,
  saving
}: {
  item: ConfigItem;
  onSave: (item: ConfigItem, newValue: string) => void;
  saving: string | null;
}) {
  const [editValue, setEditValue] = useState(item.is_sensitive ? "" : item.config_value ?? "");
  // Sensitive values arrive masked ("********") — keep the input empty with a
  // masked placeholder and never submit an untouched/empty sensitive value.
  const trySave = (v: string) => {
    if (item.is_sensitive && !v) return;
    onSave(item, v);
  };
  return <tr>
      <td style={{
      fontSize: 13,
      fontFamily: "monospace"
    }}>{item.config_key.split(".").slice(1).join(".")}</td>
      <td>
        {item.is_editable ? item.value_type === "boolean" ? <label style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        cursor: "pointer",
        fontSize: 13
      }}>
              <input type="checkbox" checked={editValue === "true"} onChange={e => {
          const val = String(e.target.checked);
          setEditValue(val);
          trySave(val);
        }} />
              {editValue === "true" ? "Enabled" : "Disabled"}
            </label> : <div style={{
        display: "flex",
        gap: 4,
        alignItems: "center"
      }}>
              <input type={item.is_sensitive ? "password" : item.value_type === "integer" || item.value_type === "decimal" ? "number" : "text"} step={item.value_type === "decimal" ? "0.1" : "1"} value={editValue} placeholder={item.is_sensitive ? "••••••••" : undefined} onChange={e => setEditValue(e.target.value)} onBlur={e => {
          if (item.is_sensitive ? e.target.value : e.target.value !== (item.config_value ?? "")) trySave(e.target.value);
        }} onKeyDown={e => {
          if (e.key === "Enter") trySave((e.target as HTMLInputElement).value);
        }} style={{
          border: "1px solid var(--color-border-light)",
          borderRadius: "var(--radius-sm)",
          padding: "4px 8px",
          fontSize: 13,
          width: item.value_type === "boolean" ? 80 : 200
        }} />
              <span style={{
          fontSize: 11,
          color: "var(--color-text-muted)"
        }}>{item.value_type}</span>
            </div> : <span style={{
        fontSize: 13,
        color: "var(--color-text-muted)"
      }}>
            {item.is_sensitive ? "••••••••" : item.config_value}
          </span>}
      </td>
      <td>
        {item.is_editable && item.value_type !== "boolean" && <button onClick={() => trySave(editValue)} disabled={saving === item.config_key || (item.is_sensitive ? !editValue : editValue === item.config_value)} className="btn btn-sm btn-outline" style={{
        fontSize: 11
      }}>
            <Save size={11} /> {saving === item.config_key ? "..." : "Save"}
          </button>}
      </td>
    </tr>;
}
export default function SettingsPage() {
  const {
    t
  } = useTranslation();
  const [configs, setConfigs] = useState<ConfigItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updateMsg, setUpdateMsg] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  useEffect(() => {
    api.get<ConfigItem[]>("/admin/config").then(d => setConfigs(Array.isArray(d) ? d : [])).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, []);
  const handleSave = async (item: ConfigItem, newValue: string) => {
    setSaving(item.config_key);
    setUpdateMsg("");
    setConfigs(prev => prev.map(c => c.config_key === item.config_key ? {
      ...c,
      config_value: newValue
    } : c));
    try {
      await api.put("/admin/config", {
        key: item.config_key,
        value: newValue
      });
      setUpdateMsg(`${item.config_key} updated`);
      setTimeout(() => setUpdateMsg(""), 3000);
    } catch (err: any) {
      setError(err.message);
      api.get<ConfigItem[]>("/admin/config").then(d => setConfigs(Array.isArray(d) ? d : [])).catch(e => { console.error('reload configs:', e); setError(e.message || t("admin.errors.loadFailed")); });
    } finally {
      setSaving(null);
    }
  };
  const getConfigs = (prefix: string) => configs.filter(c => c.config_key.startsWith(prefix));
  return <div style={{
    padding: 32
  }}>
      <div className="page-header">
        <div><h1 className="page-title">{t("settings.settings")}</h1><p className="page-subtitle">{t("settings.platform_configuration_all_settings_stored_in")}</p></div>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      {updateMsg && <div className="alert alert-success">{updateMsg}</div>}

      {loading ? <div style={{
      textAlign: "center",
      padding: 48,
      color: "var(--color-text-muted)"
    }}>{t("settings.loading_settings")}</div> : <div style={{
      display: "flex",
      flexDirection: "column",
      gap: 20
    }}>
          {SECTIONS.map(section => {
        const items = getConfigs(section.prefix);
        if (items.length === 0) return null;
        return <div key={section.prefix} className="card" style={{
          padding: "16px 20px"
        }}>
                <div style={{
            marginBottom: 12
          }}>
                  <h3 style={{
              fontSize: 15,
              fontWeight: 600
            }}>{t(section.titleKey)}</h3>
                  <p style={{
              fontSize: 12,
              color: "var(--color-text-muted)"
            }}>{t(section.descriptionKey)}</p>
                </div>
                <table className="data-table" style={{
            fontSize: 13
          }}>
                  <thead>
                    <tr>
                      <th>{t("settings.key")}</th>
                      <th>{t("settings.value")}</th>
                      <th style={{
                  width: 80
                }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(item => <ConfigRow key={item.config_key} item={item} onSave={handleSave} saving={saving} />)}
                  </tbody>
                </table>
              </div>;
      })}
        </div>}
    </div>;
}