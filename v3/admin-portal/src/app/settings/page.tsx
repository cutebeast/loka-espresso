"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Save } from "lucide-react";

interface ConfigItem {
  id: number; config_key: string; config_value: string;
  value_type: string; is_sensitive: boolean; is_editable: boolean;
}

const SECTIONS: { title: string; description: string; prefix: string }[] = [
  { title: "App", description: "Brand identity & contact", prefix: "app." },
  { title: "OTP / Authentication", description: "OTP bypass, expiry, rate limits", prefix: "otp." },
  { title: "Orders", description: "Auto-confirm, preparation time", prefix: "order." },
  { title: "Notifications", description: "Retention and delivery settings", prefix: "notifications." },
  { title: "Upload", description: "File upload limits", prefix: "upload." },
  { title: "Reservation", description: "SMS/WhatsApp confiration & default duration", prefix: "reservation." },
];

export default function SettingsPage() {
  const [configs, setConfigs] = useState<ConfigItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updateMsg, setUpdateMsg] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    api.get<ConfigItem[]>("/admin/config")
      .then(d => setConfigs(Array.isArray(d) ? d : []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (item: ConfigItem, newValue: string) => {
    setSaving(item.config_key); setUpdateMsg("");
    try {
      const qs = new URLSearchParams({ key: item.config_key, value: newValue });
      await api.put(`/admin/config?${qs.toString()}`);
      setUpdateMsg(`${item.config_key} updated`);
      api.get<ConfigItem[]>("/admin/config").then(d => setConfigs(Array.isArray(d) ? d : [])).catch(() => {});
      setTimeout(() => setUpdateMsg(""), 3000);
    } catch (err: any) { setError(err.message); }
    finally { setSaving(null); }
  };

  const getConfigs = (prefix: string) => configs.filter(c => c.config_key.startsWith(prefix));

  const renderRow = (item: ConfigItem) => (
    <tr key={item.config_key}>
      <td style={{ fontSize: 13, fontFamily: "monospace" }}>{item.config_key.split(".").slice(1).join(".")}</td>
      <td>
        {item.is_editable ? (
          item.value_type === "boolean" ? (
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
              <input type="checkbox" defaultChecked={item.config_value === "true"} onChange={e => handleSave(item, String(e.target.checked))} />
              {item.config_value === "true" ? "Enabled" : "Disabled"}
            </label>
          ) : (
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <input
                type={item.value_type === "integer" || item.value_type === "decimal" ? "number" : "text"}
                step={item.value_type === "decimal" ? "0.1" : "1"}
                defaultValue={item.config_value}
                onBlur={e => { if (e.target.value !== item.config_value) handleSave(item, e.target.value); }}
                onKeyDown={e => { if (e.key === "Enter") handleSave(item, (e.target as HTMLInputElement).value); }}
                style={{ border: "1px solid var(--color-border-light)", borderRadius: "var(--radius-sm)", padding: "4px 8px", fontSize: 13, width: item.value_type === "boolean" ? 80 : 200 }}
              />
              <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{item.value_type}</span>
            </div>
          )
        ) : (
          <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
            {item.is_sensitive ? "••••••••" : item.config_value}
          </span>
        )}
      </td>
      <td>
        {item.is_editable && (
          <button onClick={() => {}} disabled={saving === item.config_key} className="btn btn-sm btn-outline" style={{ fontSize: 11 }}>
            <Save size={11} /> {saving === item.config_key ? "..." : "Save"}
          </button>
        )}
      </td>
    </tr>
  );

  return (
    <div style={{ padding: 32 }}>
      <div className="page-header">
        <div><h1 className="page-title">Settings</h1><p className="page-subtitle">Platform configuration — all settings stored in database, editable in real-time</p></div>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      {updateMsg && <div className="alert alert-success">{updateMsg}</div>}

      {loading ? (
        <div style={{ textAlign: "center", padding: 48, color: "var(--color-text-muted)" }}>Loading settings...</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {SECTIONS.map(section => {
            const items = getConfigs(section.prefix);
            if (items.length === 0) return null;
            return (
              <div key={section.title} className="card" style={{ padding: "16px 20px" }}>
                <div style={{ marginBottom: 12 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 600 }}>{section.title}</h3>
                  <p style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{section.description}</p>
                </div>
                <table className="data-table" style={{ margin: 0 }}>
                  <thead><tr>
                    <th style={{ width: "40%" }}>Key</th>
                    <th>Value</th>
                    <th style={{ width: 80 }}></th>
                  </tr></thead>
                  <tbody>
                    {items.map(renderRow)}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
