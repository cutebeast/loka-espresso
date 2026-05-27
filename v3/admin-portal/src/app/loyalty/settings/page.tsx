"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Save } from "lucide-react";

interface ConfigItem { id: number; config_key: string; config_value: string; value_type: string; is_editable: boolean; }

const KEYS = [
  "loyalty.points_per_currency",
  "loyalty.welcome_bonus",
];

export default function LoyaltySettingsPage() {
  const [configs, setConfigs] = useState<Record<string, ConfigItem>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => { 
    api.get<ConfigItem[]>("/admin/config").then(d => {
      const map: Record<string, ConfigItem> = {};
      (Array.isArray(d) ? d : []).forEach((c: any) => { map[c.config_key] = c; });
      setConfigs(map);
    }).catch((e)=>{console.error('loyalty config:',e)}).finally(() => setLoading(false));
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
      <h1 className="page-title">Loyalty Settings</h1>
      <p className="page-subtitle" style={{ marginBottom: 24 }}>Points earning rules & welcome bonus</p>
      {msg && <div className="alert alert-success">{msg}</div>}
      {loading ? <p>Loading...</p> : (
        <div className="card" style={{ maxWidth: 500 }}>
          <table className="data-table">
            <thead><tr><th>Setting</th><th style={{ width: 150 }}>Value</th><th style={{ width: 80 }}></th></tr></thead>
            <tbody>
              {KEYS.map(key => {
                const c = get(key);
                if (!c) return null;
                return (
                  <tr key={key}>
                    <td style={{ textTransform: "capitalize" }}>{key.replace("loyalty.","").replace(/_/g," ")}</td>
                    <td>
                      <input
                        type="number"
                        defaultValue={c.config_value}
                        onBlur={e => { if (e.target.value !== c.config_value) save(key, e.target.value); }}
                        style={{ border: "1px solid var(--color-border-light)", borderRadius: "var(--radius-sm)", padding: "4px 8px", fontSize: 13, width: 100 }}
                      />
                    </td>
                    <td>
                      {saving === key ? "..." : <button onClick={() => {}} className="btn btn-sm btn-primary" title="Auto-saves on blur"><Save size={12}/> Save</button>}
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
