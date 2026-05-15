"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Save } from "lucide-react";

interface ConfigItem { id: number; config_key: string; config_value: string; value_type: string; is_editable: boolean; }

const KEYS = [
  "store.default_pickup_lead_minutes",
  "store.default_delivery_radius_km", 
  "store.default_base_delivery_fee",
  "store.default_minimum_order_amount",
  "store.tax_registration",
  "integration.pos_provider",
  "integration.delivery_provider",
];

export default function StoreSettingsPage() {
  const [configs, setConfigs] = useState<Record<string, ConfigItem>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => { 
    api.get<ConfigItem[]>("/admin/config").then(d => {
      const map: Record<string, ConfigItem> = {};
      (Array.isArray(d) ? d : []).forEach((c: any) => { map[c.config_key] = c; });
      setConfigs(map);
    }).catch(()=>{}).finally(() => setLoading(false));
  }, []);

  const save = async (key: string, value: string) => {
    setSaving(key);
    try {
      const qs = new URLSearchParams({ key, value });
      await api.put(`/admin/config?${qs.toString()}`);
      setMsg(`${key} updated`);
      setTimeout(() => setMsg(""), 2000);
    } catch (e: any) { setMsg(e.message); }
    finally { setSaving(""); }
  };

  const get = (key: string) => configs[key];

  return (
    <div style={{ padding: 32 }}>
      <h1 className="page-title">Store Settings</h1>
      <p className="page-subtitle" style={{ marginBottom: 24 }}>Global defaults for all store locations</p>
      {msg && <div className="alert alert-success">{msg}</div>}
      {loading ? <p>Loading...</p> : (
        <div className="card" style={{ maxWidth: 600 }}>
          <table className="data-table">
            <thead><tr><th>Setting</th><th style={{ width: 200 }}>Value</th><th style={{ width: 80 }}></th></tr></thead>
            <tbody>
              {KEYS.map(key => {
                const c = get(key);
                if (!c) return null;
                const label = key.replace("store.default_","").replace("integration.","").replace(/_/g," ");
                return (
                  <tr key={key}>
                    <td style={{ textTransform: "capitalize" }}>{label}</td>
                    <td>
                      <input
                        type={c.value_type === "integer" || c.value_type === "decimal" ? "number" : "text"}
                        step={c.value_type === "decimal" ? "0.1" : "1"}
                        defaultValue={c.config_value}
                        onBlur={e => { if (e.target.value !== c.config_value) save(key, e.target.value); }}
                        onKeyDown={e => { if (e.key === "Enter") save(key, (e.target as HTMLInputElement).value); }}
                        style={{ border: "1px solid var(--color-border-light)", borderRadius: "var(--radius-sm)", padding: "4px 8px", fontSize: 13, width: "100%" }}
                      />
                    </td>
                    <td>
                      {saving === key ? "..." : <button onClick={() => save(key, (document.querySelector(`input[data-key="${key}"]`) as HTMLInputElement)?.value || get(key)?.config_value || "")} className="btn btn-sm btn-primary"><Save size={12}/> Save</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
