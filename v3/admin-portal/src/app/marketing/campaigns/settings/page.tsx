"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { parseApiError } from "@/lib/errors";
import { Eye, EyeOff, Save } from "lucide-react";

const KEYS = [
  { k: "integration.twilio_account_sid",     l: "Twilio Account SID",    section: "Twilio SMS & WhatsApp", sensitive: false },
  { k: "integration.twilio_auth_token",      l: "Twilio Auth Token",     section: "Twilio SMS & WhatsApp", sensitive: true },
  { k: "integration.twilio_from_number",     l: "Twilio SMS From Number",section: "Twilio SMS & WhatsApp", sensitive: false },
  { k: "integration.twilio_whatsapp_from",   l: "Twilio WhatsApp From",  section: "Twilio SMS & WhatsApp", sensitive: false },
  { k: "integration.resend_api_key",         l: "Resend API Key",        section: "Resend Email", sensitive: true },
  { k: "integration.resend_from_email",      l: "Resend From Email",     section: "Resend Email", sensitive: false },
  { k: "integration.deepl_api_key",          l: "DeepL API Key",         section: "Translation APIs", sensitive: true },
  { k: "integration.deepl_api_url",          l: "DeepL API URL",         section: "Translation APIs", sensitive: false },
  { k: "integration.deepseek_api_key",       l: "DeepSeek API Key",      section: "Translation APIs", sensitive: true },
  { k: "integration.deepseek_model",         l: "DeepSeek Model",        section: "Translation APIs", sensitive: false },
];

export default function CampaignSettingsPage() {
  const [config, setConfig] = useState<Record<string, string>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [isError, setIsError] = useState(false);
  const [showToken, setShowToken] = useState(false);

  useEffect(() => {
    api.get<any[]>("/admin/config")
      .then(d => {
        const m: Record<string, string> = {};
        (Array.isArray(d) ? d : []).forEach((c: any) => {
          if (c.config_key.startsWith("integration.")) {
            m[c.config_key] = c.config_value;
          }
        });
        setConfig(m);
        setValues({ ...m });
      })
      .catch((e) => { console.error('campaign settings:', e); })
      .finally(() => setLoading(false));
  }, []);

  const save = async (key: string, val: string) => {
    setSaving(key);
    setIsError(false);
    try {
      const qs = new URLSearchParams({ key, value: val });
      await api.put(`/admin/config?${qs.toString()}`);
      setConfig(prev => ({ ...prev, [key]: val }));
      showMsg(`${key.replace("integration.", "")} updated`);
    } catch (e: unknown) {
      showMsg(parseApiError(e, "Failed to save"), true);
    } finally { setSaving(null); }
  };

  const showMsg = (text: string, error = false) => {
    setMsg(text);
    setIsError(error);
    setTimeout(() => setMsg(""), 3000);
  };

  return (
    <div style={{ padding: 32 }}>
      <h1 className="page-title">Campaign Settings</h1>
      <p className="page-subtitle" style={{ marginBottom: 24 }}>
        Configure Twilio (SMS) and Resend (Email) API credentials for campaign delivery
      </p>
      {msg && <div className={`alert ${isError ? "alert-error" : "alert-success"}`}>{msg}</div>}

      {loading ? (
        <p>Loading...</p>
      ) : (
        <div className="card" style={{ maxWidth: 700 }}>
          {(["Twilio SMS & WhatsApp", "Resend Email", "Translation APIs"] as string[]).map(section => (
            <div key={section} style={{ marginBottom: 24 }}>
              <h3 style={{ marginBottom: 12, fontSize: 15, fontWeight: 700 }}>{section}</h3>
              {section === "Twilio SMS & WhatsApp" && (
                <div style={{ marginBottom: 12, padding: 10, background: "var(--color-bg-muted)", borderRadius: "var(--radius-sm)", fontSize: 12, color: "var(--color-text-muted)" }}>
                  <strong>ℹ️</strong> Twilio sends SMS and WhatsApp campaigns. Get keys from{" "}
                  <a href="https://console.twilio.com" target="_blank" rel="noopener" style={{ color: "var(--color-info)" }}>Twilio Console</a>.
                  WhatsApp sender must be approved in Twilio&rsquo;s WhatsApp sandbox or business profile.
                  Format: <code>whatsapp:+14155238886</code>
                </div>
              )}
              {section === "Resend Email" && (
                <div style={{ marginBottom: 12, padding: 10, background: "var(--color-bg-muted)", borderRadius: "var(--radius-sm)", fontSize: 12, color: "var(--color-text-muted)" }}>
                  <strong>ℹ️</strong> Resend sends email campaigns. Get API key from{" "}
                  <a href="https://resend.com/api-keys" target="_blank" rel="noopener" style={{ color: "var(--color-info)" }}>Resend Dashboard</a>.
                  From email must be verified in Resend first.
                </div>
              )}
              {section === "Translation APIs" && (
                <div style={{ marginBottom: 12, padding: 10, background: "var(--color-bg-muted)", borderRadius: "var(--radius-sm)", fontSize: 12, color: "var(--color-text-muted)" }}>
                  <strong>ℹ️</strong> DeepL translates zh + tr. DeepSeek v4 Pro handles all other locales (ms, ta) as fallback.
                </div>
              )}
              <table className="data-table">
                <thead><tr><th>Setting</th><th>Value</th><th style={{width:70}}></th></tr></thead>
                <tbody>
                  {KEYS.filter(r => r.section === section).map(r => {
                    const val = values[r.k] ?? config[r.k] ?? "";
                    return (
                      <tr key={r.k}>
                        <td style={{ fontWeight: 600 }}>{r.l}</td>
                        <td>
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <input
                              type={r.sensitive && !showToken ? "password" : "text"}
                              value={val}
                              onChange={e => setValues(prev => ({ ...prev, [r.k]: e.target.value }))}
                              placeholder={r.sensitive ? "••••••••••••••••" : r.l}
                              style={{
                                border: "1px solid var(--color-border-light)",
                                borderRadius: "var(--radius-sm)",
                                padding: "6px 10px",
                                fontSize: 13,
                                fontFamily: r.sensitive ? "monospace" : "inherit",
                                width: r.sensitive ? 300 : 280,
                              }}
                            />
                            {r.sensitive && (
                              <button type="button" onClick={() => setShowToken(!showToken)} className="btn btn-ghost btn-sm" title={showToken ? "Hide" : "Show"}>
                                {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
                              </button>
                            )}
                          </div>
                        </td>
                        <td>
                          <button type="button" className="btn btn-sm btn-primary" onClick={() => save(r.k, val)} disabled={saving !== null}>
                            <Save size={12}/> {saving === r.k ? "..." : "Save"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
          <div style={{ padding: 10, background: "var(--color-warning-light)", borderRadius: "var(--radius-sm)", fontSize: 12, color: "var(--color-text-muted)" }}>
            <strong>⚠️</strong> After saving, send a test campaign to verify delivery. Check provider dashboards for logs.
          </div>
        </div>
      )}
    </div>
  );
}
