"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { parseApiError } from "@/lib/errors";
import { useTranslation } from "@/lib/i18n";
import { Eye, EyeOff, Save } from "lucide-react";

interface ConfigField {
  key: string;
  labelKey: string;
  sensitive: boolean;
  valueType?: "string" | "boolean";
}

const FIELDS: ConfigField[] = [
  { key: "integration.twilio_verify_account_sid", labelKey: "admin.twilioVerify.accountSid", sensitive: false },
  { key: "integration.twilio_verify_auth_token", labelKey: "admin.twilioVerify.authToken", sensitive: true },
  { key: "integration.twilio_verify_service_sid", labelKey: "admin.twilioVerify.serviceSid", sensitive: false },
  { key: "integration.twilio_verify_use_test_credentials", labelKey: "admin.twilioVerify.useTestCredentials", sensitive: false, valueType: "boolean" },
  { key: "integration.twilio_verify_test_account_sid", labelKey: "admin.twilioVerify.testAccountSid", sensitive: false },
  { key: "integration.twilio_verify_test_auth_token", labelKey: "admin.twilioVerify.testAuthToken", sensitive: true },
];

export default function TwilioVerifySettingsPage() {
  const { t } = useTranslation();
  const [config, setConfig] = useState<Record<string, string>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [isError, setIsError] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  useEffect(() => {
    api.get<any[]>("/admin/config")
      .then((d) => {
        const m: Record<string, string> = {};
        (Array.isArray(d) ? d : []).forEach((c: any) => {
          if (c.config_key.startsWith("integration.twilio_verify")) {
            m[c.config_key] = String(c.config_value ?? "");
          }
        });
        setConfig(m);
        setValues({ ...m });
      })
      .catch((e) => { console.error("twilio verify settings:", e); })
      .finally(() => setLoading(false));
  }, []);

  const save = async (field: ConfigField) => {
    const val = values[field.key] ?? "";
    setSaving(field.key);
    setIsError(false);
    try {
      const qs = new URLSearchParams({ key: field.key, value: val });
      await api.put(`/admin/config?${qs.toString()}`);
      setConfig((prev) => ({ ...prev, [field.key]: val }));
      showMsg(t("admin.twilioVerify.saved"));
    } catch (e: unknown) {
      showMsg(parseApiError(e, t("admin.twilioVerify.saveFailed")), true);
    } finally {
      setSaving(null);
    }
  };

  const showMsg = (text: string, error = false) => {
    setMsg(text);
    setIsError(error);
    setTimeout(() => setMsg(""), 3000);
  };

  const renderInput = (field: ConfigField) => {
    const val = values[field.key] ?? config[field.key] ?? "";
    if (field.valueType === "boolean") {
      return (
        <select
          value={val}
          onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
          style={{
            border: "1px solid var(--color-border-light)",
            borderRadius: "var(--radius-sm)",
            padding: "6px 10px",
            fontSize: 13,
            minWidth: 200,
          }}
        >
          <option value="false">{t("admin.common.no")}</option>
          <option value="true">{t("admin.common.yes")}</option>
        </select>
      );
    }
    return (
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          type={field.sensitive && !showSecret ? "password" : "text"}
          value={val}
          onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
          placeholder={field.sensitive ? "••••••••••••••••" : t(field.labelKey)}
          style={{
            border: "1px solid var(--color-border-light)",
            borderRadius: "var(--radius-sm)",
            padding: "6px 10px",
            fontSize: 13,
            fontFamily: field.sensitive ? "monospace" : "inherit",
            width: field.sensitive ? 300 : 280,
          }}
        />
        {field.sensitive && (
          <button type="button" onClick={() => setShowSecret(!showSecret)} className="btn btn-ghost btn-sm" title={showSecret ? t("admin.common.hide") : t("admin.common.show")}>
            {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        )}
      </div>
    );
  };

  return (
    <div style={{ padding: 32 }}>
      <h1 className="page-title">{t("admin.twilioVerify.title")}</h1>
      <p className="page-subtitle" style={{ marginBottom: 24 }}>
        {t("admin.twilioVerify.subtitle")}
      </p>
      {msg && <div className={`alert ${isError ? "alert-error" : "alert-success"}`}>{msg}</div>}

      {loading ? (
        <p>{t("admin.common.loading")}</p>
      ) : (
        <div className="card" style={{ maxWidth: 700 }}>
          <div style={{ marginBottom: 12, padding: 10, background: "var(--color-bg-muted)", borderRadius: "var(--radius-sm)", fontSize: 12, color: "var(--color-text-muted)" }}>
            <strong>ℹ️</strong> {t("admin.twilioVerify.helpText")}
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("admin.twilioVerify.setting")}</th>
                <th>{t("admin.twilioVerify.value")}</th>
                <th style={{ width: 70 }}></th>
              </tr>
            </thead>
            <tbody>
              {FIELDS.map((field) => (
                <tr key={field.key}>
                  <td style={{ fontWeight: 600 }}>{t(field.labelKey)}</td>
                  <td>{renderInput(field)}</td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      onClick={() => save(field)}
                      disabled={saving !== null}
                    >
                      <Save size={12} /> {saving === field.key ? "..." : t("admin.common.save")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 16, padding: 10, background: "var(--color-warning-light)", borderRadius: "var(--radius-sm)", fontSize: 12, color: "var(--color-text-muted)" }}>
            <strong>⚠️</strong> {t("admin.twilioVerify.warning")}
          </div>
        </div>
      )}
    </div>
  );
}
