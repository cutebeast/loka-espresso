"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Save, Eye, EyeOff } from "lucide-react";

const KEYS = [
  { k: "integration.twilio_account_sid",     l: "Twilio Account SID",    section: "Twilio SMS & WhatsApp", sensitive: false },
  { k: "integration.twilio_auth_token",      l: "Twilio Auth Token",     section: "Twilio SMS & WhatsApp", sensitive: true },
  { k: "integration.twilio_from_number",     l: "Twilio SMS From Number",section: "Twilio SMS & WhatsApp", sensitive: false },
  { k: "integration.twilio_whatsapp_from",   l: "Twilio WhatsApp From",  section: "Twilio SMS & WhatsApp", sensitive: false },
  { k: "integration.resend_api_key",         l: "Resend API Key",        section: "Resend Email", sensitive: true },
  { k: "integration.resend_from_email",      l: "Resend From Email",     section: "Resend Email", sensitive: false },
  { k: "integration.deepl_api_key",          l: "DeepL API Key",         section: "Translation APIs", sensitive: true },
  { k: "integration.deepl_api_url",          l: "DeepL API URL",         section: "Translation APIs", sensitive: false },
  { k: "integration.minimax_api_key",        l: "MiniMax API Key",       section: "Translation APIs", sensitive: true },
  { k: "integration.deepseek_api_key",       l: "DeepSeek API Key",      section: "Translation APIs", sensitive: true },
  { k: "integration.deepseek_model",         l: "DeepSeek Model",        section: "Translation APIs", sensitive: false },
];

export default function CampaignSettingsPage() {
  const [config, setConfig] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [showToken, setShowToken] = useState(false);

  useEffect(() => {
    api.get<any[]>("/admin/config")
      .then(d => {
        const m: Record<string, string> = {};
        (Array.isArray(d) ? d : []).forEach((c: any) => {
          if (
            c.config_key.startsWith("integration.twilio") ||
            c.config_key.startsWith("integration.resend") ||
            c.config_key.startsWith("integration.deepl") ||
            c.config_key.startsWith("integration.minimax") ||
            c.config_key.startsWith("integration.deepseek")
          ) {
            m[c.config_key] = c.config_value;
          }
        });
        setConfig(m);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const save = async (key: string, val: string) => {
    const qs = new URLSearchParams({ key, value: val });
    await api.put(`/admin/config?${qs.toString()}`);
    setConfig(prev => ({ ...prev, [key]: val }));
    setMsg(`${key.replace("integration.twilio_", "")} updated`);
    setTimeout(() => setMsg(""), 2000);
  };

  return (
    <div style={{ padding: 32 }}>
      <h1 className="page-title">Campaign Settings</h1>
      <p className="page-subtitle" style={{ marginBottom: 24 }}>
        Configure Twilio (SMS) and Resend (Email) API credentials for campaign delivery
      </p>
      {msg && <div className="alert alert-success">{msg}</div>}

      {loading ? (
        <p>Loading...</p>
      ) : (
        <div className="card" style={{ maxWidth: 600 }}>
          {(["Twilio SMS & WhatsApp", "Resend Email", "Translation APIs"] as string[]).map(section => (
            <div key={section} style={{ marginBottom: 24 }}>
              <h3 style={{ marginBottom: 12, fontSize: 15, fontWeight: 700 }}>{section}</h3>
              {section === "Twilio SMS & WhatsApp" && (
                <div style={{ marginBottom: 12, padding: 10, background: "var(--color-bg-muted)", borderRadius: "var(--radius-sm)", fontSize: 12, color: "var(--color-text-muted)" }}>
                  <strong>ℹ️</strong> Twilio sends SMS and WhatsApp campaigns. Get keys from{" "}
                  <a href="https://console.twilio.com" target="_blank" rel="noopener" style={{ color: "var(--color-info)" }}>Twilio Console</a>.
                  WhatsApp sender must be approved in Twilio's WhatsApp sandbox or business profile.
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
                  <strong>ℹ️</strong> MiniMax M2.7-highspeed (primary) translates all content. DeepL (zh,tr) and DeepSeek (ms,ta) are fallbacks.
                </div>
              )}
              <table className="data-table">
                <thead><tr><th>Setting</th><th>Value</th></tr></thead>
                <tbody>
                  {KEYS.filter(r => r.section === section).map(r => (
                    <tr key={r.k}>
                      <td style={{ fontWeight: 600 }}>{r.l}</td>
                      <td>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <input
                            type={r.sensitive && !showToken ? "password" : "text"}
                            defaultValue={config[r.k] || ""}
                            onBlur={e => save(r.k, e.target.value)}
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
                            <button
                              type="button"
                              onClick={() => setShowToken(!showToken)}
                              className="btn btn-ghost btn-sm"
                              title={showToken ? "Hide" : "Show"}
                            >
                              {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          <div style={{ padding: 10, background: "#FEF3C7", borderRadius: "var(--radius-sm)", fontSize: 12, color: "#92400E" }}>
            <strong>⚠️</strong> After saving, send a test campaign to verify delivery. Check provider dashboards for logs.
          </div>
        </div>
      )}
    </div>
  );
}
