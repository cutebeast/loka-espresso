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
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [isError, setIsError] = useState(false);

  useEffect(() => { 
    api.get<ConfigItem[]>("/admin/config").then(d => {
      const map: Record<string, ConfigItem> = {};
      const vals: Record<string, string> = {};
      (Array.isArray(d) ? d : []).forEach((c: any) => {
        map[c.config_key] = c;
        vals[c.config_key] = c.config_value;
      });
      setConfigs(map);
      setValues(vals);
    }).catch((e)=>{console.error('loyalty config:',e)}).finally(() => setLoading(false));
  }, []);

  const save = async (key: string, value: string) => {
    setSaving(key);
    setIsError(false);
    try {
      const qs = new URLSearchParams({ key, value });
      await api.put(`/admin/config?${qs.toString()}`);
      setConfigs(prev => ({ ...prev, [key]: { ...prev[key], config_value: value } as ConfigItem }));
      showMsg(`${key} updated`);
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      showMsg(detail || "Failed to save", true);
    } finally { setSaving(null); }
  };

  const showMsg = (text: string, error = false) => {
    setMsg(text);
    setIsError(error);
    setTimeout(() => setMsg(""), 3000);
  };

  return (
    <div style={{ padding: 32 }}>
      <h1 className="page-title">Loyalty Settings</h1>
      <p className="page-subtitle" style={{ marginBottom: 24 }}>Points earning rules & welcome bonus</p>
      {msg && <div className={`alert ${isError ? "alert-error" : "alert-success"}`}>{msg}</div>}
      {loading ? <p>Loading...</p> : (
        <div className="card" style={{ maxWidth: 500 }}>
          <table className="data-table">
            <thead><tr><th>Setting</th><th style={{ width: 150 }}>Value</th><th style={{ width: 80 }}></th></tr></thead>
            <tbody>
              {KEYS.map(key => {
                const c = configs[key];
                if (!c) return null;
                const val = values[key] ?? c.config_value;
                return (
                  <tr key={key}>
                    <td style={{ textTransform: "capitalize" }}>{key.replace("loyalty.","").replace(/_/g," ")}</td>
                    <td>
                      <input
                        type="number"
                        value={val}
                        onChange={e => setValues(prev => ({ ...prev, [key]: e.target.value }))}
                        style={{ border: "1px solid var(--color-border-light)", borderRadius: "var(--radius-sm)", padding: "4px 8px", fontSize: 13, width: 100 }}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        onClick={() => save(key, values[key] ?? c.config_value)}
                        disabled={saving !== null}
                      >
                        <Save size={12}/> {saving === key ? "..." : "Save"}
                      </button>
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
