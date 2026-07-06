"use client";

import { useTranslation } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { parseApiError } from "@/lib/errors";
import { Eye, EyeOff, Save } from "lucide-react";
type SettingDef = {
  k: string;
  l: string;
  section: string;
  sensitive?: boolean;
  type?: "text" | "toggle";
};

const KEYS: SettingDef[] = [{
  k: "integration.twilio_use_test_credentials",
  l: "Use Twilio Test Credentials",
  section: "Twilio SMS & WhatsApp",
  type: "toggle"
}, {
  k: "integration.twilio_account_sid",
  l: "Twilio Live Account SID",
  section: "Twilio SMS & WhatsApp",
  sensitive: false
}, {
  k: "integration.twilio_auth_token",
  l: "Twilio Live Auth Token",
  section: "Twilio SMS & WhatsApp",
  sensitive: true
}, {
  k: "integration.twilio_from_number",
  l: "Twilio Live SMS From Number",
  section: "Twilio SMS & WhatsApp",
  sensitive: false
}, {
  k: "integration.twilio_whatsapp_from",
  l: "Twilio Live WhatsApp From",
  section: "Twilio SMS & WhatsApp",
  sensitive: false
}, {
  k: "integration.twilio_test_account_sid",
  l: "Twilio Test Account SID",
  section: "Twilio SMS & WhatsApp",
  sensitive: false
}, {
  k: "integration.twilio_test_auth_token",
  l: "Twilio Test Auth Token",
  section: "Twilio SMS & WhatsApp",
  sensitive: true
}, {
  k: "integration.twilio_test_from_number",
  l: "Twilio Test SMS From Number",
  section: "Twilio SMS & WhatsApp",
  sensitive: false
}, {
  k: "integration.twilio_test_whatsapp_from",
  l: "Twilio Test WhatsApp From",
  section: "Twilio SMS & WhatsApp",
  sensitive: false
}, {
  k: "integration.resend_use_test_credentials",
  l: "Use Resend Test Credentials",
  section: "Resend Email",
  type: "toggle"
}, {
  k: "integration.resend_api_key",
  l: "Resend Live API Key",
  section: "Resend Email",
  sensitive: true
}, {
  k: "integration.resend_from_email",
  l: "Resend Live From Email",
  section: "Resend Email",
  sensitive: false
}, {
  k: "integration.resend_test_api_key",
  l: "Resend Test API Key",
  section: "Resend Email",
  sensitive: true
}, {
  k: "integration.resend_test_from_email",
  l: "Resend Test From Email",
  section: "Resend Email",
  sensitive: false
}, {
  k: "integration.deepl_api_key",
  l: "DeepL API Key",
  section: "Translation APIs",
  sensitive: true
}, {
  k: "integration.deepl_api_url",
  l: "DeepL API URL",
  section: "Translation APIs",
  sensitive: false
}, {
  k: "integration.deepseek_api_key",
  l: "DeepSeek API Key",
  section: "Translation APIs",
  sensitive: true
}, {
  k: "integration.deepseek_model",
  l: "DeepSeek Model",
  section: "Translation APIs",
  sensitive: false
}];
export default function CampaignSettingsPage() {
  const {
    t
  } = useTranslation();
  const [config, setConfig] = useState<Record<string, string>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [isError, setIsError] = useState(false);
  const [showToken, setShowToken] = useState(false);
  useEffect(() => {
    api.get<any[]>("/admin/config").then(d => {
      const m: Record<string, string> = {};
      (Array.isArray(d) ? d : []).forEach((c: any) => {
        if (c.config_key.startsWith("integration.")) {
          m[c.config_key] = c.is_sensitive && c.config_value === "***" ? "" : c.config_value;
        }
      });
      setConfig(m);
      setValues({
        ...m
      });
    }).catch(e => {
      console.error('campaign settings:', e);
    }).finally(() => setLoading(false));
  }, []);
  const save = async (key: string, val: string) => {
    setSaving(key);
    setIsError(false);
    try {
      // Avoid overwriting a redacted secret with an empty value.
      if (val === "" && config[key] === "") {
        showMsg(`${key.replace("integration.", "")} unchanged`);
        setSaving(null);
        return;
      }
      await api.put("/admin/config", {
        key,
        value: val
      });
      setConfig(prev => ({
        ...prev,
        [key]: val
      }));
      showMsg(`${key.replace("integration.", "")} updated`);
    } catch (e: unknown) {
      showMsg(parseApiError(e, "Failed to save"), true);
    } finally {
      setSaving(null);
    }
  };
  const showMsg = (text: string, error = false) => {
    setMsg(text);
    setIsError(error);
    setTimeout(() => setMsg(""), 3000);
  };
  return <div style={{
    padding: 32
  }}>
      <h1 className="page-title">{t("marketing_campaigns_settings.campaign_settings")}</h1>
      <p className="page-subtitle" style={{
      marginBottom: 24
    }}>{t("marketing_campaigns_settings.configure_twilio_sms_and_resend_email")}</p>
      {msg && <div className={`alert ${isError ? "alert-error" : "alert-success"}`}>{msg}</div>}

      {loading ? <p>{t("marketing_campaigns_settings.loading")}</p> : <div className="card" style={{
      maxWidth: 700
    }}>
          {(["Twilio SMS & WhatsApp", "Resend Email", "Translation APIs"] as string[]).map(section => <div key={section} style={{
        marginBottom: 24
      }}>
              <h3 style={{
          marginBottom: 12,
          fontSize: 15,
          fontWeight: 700
        }}>{section}</h3>
              {section === "Twilio SMS & WhatsApp" && <div style={{
          marginBottom: 12,
          padding: 10,
          background: "var(--color-bg-muted)",
          borderRadius: "var(--radius-sm)",
          fontSize: 12,
          color: "var(--color-text-muted)"
        }}>
                  <strong>ℹ️</strong>{t("marketing_campaigns_settings.twilio_sends_sms_and_whatsapp_campaigns")}{" "}
                  <a href="https://console.twilio.com" target="_blank" rel="noopener" style={{
            color: "var(--color-info)"
          }}>{t("marketing_campaigns_settings.twilio_console")}</a>{t("marketing_campaigns_settings.whatsapp_sender_must_be_approved_in")}<code>{t("marketing_campaigns_settings.whatsapp_14155238886")}</code>
                </div>}
              {section === "Resend Email" && <div style={{
          marginBottom: 12,
          padding: 10,
          background: "var(--color-bg-muted)",
          borderRadius: "var(--radius-sm)",
          fontSize: 12,
          color: "var(--color-text-muted)"
        }}>
                  <strong>ℹ️</strong>{t("marketing_campaigns_settings.resend_sends_email_campaigns_get_api")}{" "}
                  <a href="https://resend.com/api-keys" target="_blank" rel="noopener" style={{
            color: "var(--color-info)"
          }}>{t("marketing_campaigns_settings.resend_dashboard")}</a>{t("marketing_campaigns_settings.from_email_must_be_verified_in")}</div>}
              {section === "Translation APIs" && <div style={{
          marginBottom: 12,
          padding: 10,
          background: "var(--color-bg-muted)",
          borderRadius: "var(--radius-sm)",
          fontSize: 12,
          color: "var(--color-text-muted)"
        }}>
                  <strong>ℹ️</strong>{t("marketing_campaigns_settings.deepl_translates_zh_tr_deepseek_v4")}</div>}
              <table className="data-table">
                <thead><tr><th>{t("marketing_campaigns_settings.setting")}</th><th>{t("marketing_campaigns_settings.value")}</th><th style={{
                width: 70
              }}></th></tr></thead>
                <tbody>
                  {KEYS.filter(r => r.section === section).map(r => {
              const val = values[r.k] ?? config[r.k] ?? "";
              return <tr key={r.k}>
                        <td style={{
                  fontWeight: 600
                }}>{r.l}</td>
                        <td>
                          <div style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center"
                  }}>
                            {r.type === "toggle" ? <input type="checkbox" checked={String(val).toLowerCase() === "true"} onChange={e => setValues(prev => ({
                      ...prev,
                      [r.k]: e.target.checked ? "true" : "false"
                    }))} style={{
                      width: 18,
                      height: 18
                    }} /> : <input type={r.sensitive && !showToken ? "password" : "text"} value={val} onChange={e => setValues(prev => ({
                      ...prev,
                      [r.k]: e.target.value
                    }))} placeholder={r.sensitive ? "••••••••••••••••" : r.l} style={{
                      border: "1px solid var(--color-border-light)",
                      borderRadius: "var(--radius-sm)",
                      padding: "6px 10px",
                      fontSize: 13,
                      fontFamily: r.sensitive ? "monospace" : "inherit",
                      width: r.sensitive ? 300 : 280
                    }} />}
                            {r.sensitive && r.type !== "toggle" && <button type="button" onClick={() => setShowToken(!showToken)} className="btn btn-ghost btn-sm" title={showToken ? "Hide" : "Show"}>
                                {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
                              </button>}
                          </div>
                        </td>
                        <td>
                          <button type="button" className="btn btn-sm btn-primary" onClick={() => save(r.k, val)} disabled={saving !== null}>
                            <Save size={12} /> {saving === r.k ? "..." : "Save"}
                          </button>
                        </td>
                      </tr>;
            })}
                </tbody>
              </table>
            </div>)}
          <div style={{
        padding: 10,
        background: "var(--color-warning-light)",
        borderRadius: "var(--radius-sm)",
        fontSize: 12,
        color: "var(--color-text-muted)"
      }}>
            <strong>⚠️</strong>{t("marketing_campaigns_settings.after_saving_send_a_test_campaign")}</div>
        </div>}
    </div>;
}