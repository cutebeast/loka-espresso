"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { parseApiError } from "@/lib/errors";

export default function CheckinSettingsPage() {
  const [config, setConfig] = useState<Record<string, string>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    api.get<any[]>("/admin/config?prefix=checkin")
      .then(d => {
        const m: Record<string, string> = {};
        (Array.isArray(d) ? d : []).forEach((c: any) => {
          m[c.config_key] = c.config_value;
        });
        setConfig(m);
        setValues(m);
      })
      .catch((e) => { console.error('checkin config:', e); })
      .finally(() => setLoading(false));
  }, []);

  const saveAll = async () => {
    setSaving(true);
    setIsError(false);
    try {
      for (const [key, val] of Object.entries(values)) {
        if (val !== config[key]) {
          await api.put("/admin/config", { key, value: val });
        }
      }
      setConfig({ ...values });
      showMsg("Settings saved");
    } catch (e: unknown) {
      showMsg(parseApiError(e, "Failed to save settings"), true);
    } finally { setSaving(false); }
  };

  const showMsg = (text: string, error = false) => {
    setMsg(text);
    setIsError(error);
    setTimeout(() => setMsg(""), 3000);
  };

  const rules = [
    { k: "checkin.daily_base_points",  l: "Daily Base Points" },
    { k: "checkin.streak_increment",   l: "Streak Increment (per day)" },
    { k: "checkin.streak_7day_bonus",  l: "7-Day Streak Bonus" },
    { k: "checkin.max_streak_days",    l: "Max Streak Days" },
  ];

  return (
    <div style={{ padding: 32 }}>
      <h1 className="page-title">Check-in Settings</h1>
      <p className="page-subtitle" style={{ marginBottom: 24 }}>
        Configure daily check-in rewards and streak bonuses
      </p>
      {msg && <div className={`alert ${isError ? "alert-error" : "alert-success"}`}>{msg}</div>}

      {loading ? (
        <p>Loading...</p>
      ) : (
        <div className="card" style={{ maxWidth: 500 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Rule</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              {rules.map(r => (
                <tr key={r.k}>
                  <td>{r.l}</td>
                  <td>
                    <input
                      type="number"
                      value={values[r.k] || "0"}
                      onChange={e => setValues(prev => ({ ...prev, [r.k]: e.target.value }))}
                      style={{
                        border: "1px solid var(--color-border-light)",
                        borderRadius: "var(--radius-sm)",
                        padding: "4px 8px",
                        fontSize: 13,
                        width: 100,
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 16 }}>
            <button type="button" className="btn btn-primary" onClick={saveAll} disabled={saving}>
              {saving ? "Saving..." : "Save Settings"}
            </button>
          </div>
          <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 8 }}>
            Example: 10 base + 10 increment × day → Day 1=10, Day 2=20, Day 3=30 ... Day 7=70 + 100 bonus = 170 total
          </p>
        </div>
      )}
    </div>
  );
}
