"use client";

import { useTranslation } from "@/lib/i18n";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { parseApiError } from "@/lib/errors";
import { CreditCard, Wallet, Globe, Save, AlertCircle, CheckCircle2, Eye, EyeOff } from "lucide-react";
interface ConfigItem {
  id: number;
  config_key: string;
  config_value: unknown;
  value_type: string;
  is_sensitive: boolean;
  is_editable: boolean;
}
const STRIPE_KEYS = [{
  key: "stripe.enabled",
  label: "Enable Stripe",
  type: "boolean"
}, {
  key: "stripe.automatic_tax_enabled",
  label: "Enable Stripe Automatic Tax",
  type: "boolean"
}, {
  key: "stripe.secret_key",
  label: "Secret Key",
  type: "password"
}, {
  key: "stripe.publishable_key",
  label: "Publishable Key",
  type: "password"
}, {
  key: "stripe.webhook_secret",
  label: "Webhook Secret",
  type: "password"
}, {
  key: "stripe.checkout_success_url",
  label: "Checkout Success URL",
  type: "text"
}, {
  key: "stripe.checkout_cancel_url",
  label: "Checkout Cancel URL",
  type: "text"
}];
const HITPAY_KEYS = [{
  key: "hitpay.enabled",
  label: "Enable HitPay",
  type: "boolean"
}, {
  key: "hitpay.api_key",
  label: "API Key",
  type: "password"
}, {
  key: "hitpay.salt",
  label: "Webhook Salt",
  type: "password"
}, {
  key: "hitpay.api_base_url",
  label: "API Base URL",
  type: "text"
}];
const PUBLIC_URL_KEYS = [{
  key: "app.public_url",
  label: "Customer App Public URL",
  type: "text"
}, {
  key: "admin.public_url",
  label: "Admin Portal Public URL",
  type: "text"
}, {
  key: "staff.public_url",
  label: "Staff Portal Public URL",
  type: "text"
}];
const STRIPE_METHOD_OPTIONS = ["card", "fpx", "grabpay", "alipay", "wechat_pay"];
const HITPAY_METHOD_OPTIONS = ["duitnow", "touch_n_go", "paynow_online", "boost", "shopee_pay", "grabpay", "fpx", "card"];
const LABEL_MAP: Record<string, string> = Object.fromEntries([...STRIPE_KEYS, ...HITPAY_KEYS, ...PUBLIC_URL_KEYS].map(cfg => [cfg.key, cfg.label]));
function normalizeValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return JSON.stringify(value);
}
function parseBoolean(value: string): boolean {
  return value.toLowerCase() === "true" || value === "1" || value.toLowerCase() === "yes";
}
function Toggle({
  checked,
  onChange,
  label
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return <label style={{
    display: "flex",
    alignItems: "center",
    gap: 10,
    cursor: "pointer"
  }}>
      <span onClick={() => onChange(!checked)} style={{
      position: "relative",
      width: 44,
      height: 24,
      borderRadius: 12,
      backgroundColor: checked ? "var(--color-primary, #2563eb)" : "var(--color-border, #d1d5db)",
      transition: "background-color 0.2s"
    }}>
        <span style={{
        position: "absolute",
        top: 2,
        left: checked ? 22 : 2,
        width: 20,
        height: 20,
        borderRadius: "50%",
        backgroundColor: "white",
        transition: "left 0.2s"
      }} />
      </span>
      <span style={{
      fontSize: 14,
      fontWeight: 500
    }}>{label}</span>
    </label>;
}
function WebhookHint({
  provider
}: {
  provider: "stripe" | "hitpay";
}) {
  const {
    t
  } = useTranslation();
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }
  }, []);
  const isStripe = provider === "stripe";
  return <div style={{
    background: "var(--color-bg-soft, #f9fafb)",
    borderRadius: "var(--radius-sm)",
    padding: 12,
    fontSize: 13
  }}>
      <strong>{t("settings_payment-gateway.webhook_url")}</strong>
      <code style={{
      display: "block",
      marginTop: 4,
      wordBreak: "break-all"
    }}>
        {origin}{t("settings_payment-gateway.api_webhooks")}{provider}
      </code>
      <p style={{
      fontSize: 12,
      color: "var(--color-text-muted)",
      marginTop: 6
    }}>
        {isStripe ? "Register this URL in your Stripe dashboard under Developers → Webhook Endpoints. Subscribe to: payment_intent.succeeded, payment_intent.payment_failed, payment_intent.canceled, checkout.session.completed, checkout.session.async_payment_succeeded, checkout.session.async_payment_failed, checkout.session.expired, charge.refunded, charge.dispute.created." : "Register this URL in your HitPay dashboard under Developers → Webhook Endpoints."}
      </p>
    </div>;
}
function MethodChips({
  options,
  selected,
  onChange
}: {
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  return <div style={{
    display: "flex",
    flexWrap: "wrap",
    gap: 8
  }}>
      {options.map(method => {
      const isSelected = selected.includes(method);
      return <button key={method} type="button" onClick={() => {
        const next = isSelected ? selected.filter(m => m !== method) : [...selected, method];
        onChange(next);
      }} style={{
        padding: "6px 12px",
        borderRadius: "var(--radius-md, 6px)",
        border: `1px solid ${isSelected ? "var(--color-primary, #2563eb)" : "var(--color-border-light, #e5e7eb)"}`,
        backgroundColor: isSelected ? "var(--color-primary-soft, #eff6ff)" : "white",
        color: isSelected ? "var(--color-primary, #2563eb)" : "var(--color-text, #374151)",
        fontSize: 13,
        cursor: "pointer"
      }}>
            {method}
          </button>;
    })}
    </div>;
}
export default function PaymentGatewaySettingsPage() {
  const {
    t
  } = useTranslation();
  const [configs, setConfigs] = useState<Record<string, ConfigItem>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [methodValues, setMethodValues] = useState<Record<string, string[]>>({});
  const [visibleSecrets, setVisibleSecrets] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [isError, setIsError] = useState(false);
  useEffect(() => {
    api.get<ConfigItem[]>("/admin/config").then(data => {
      const list = Array.isArray(data) ? data : [];
      const map: Record<string, ConfigItem> = {};
      const initialValues: Record<string, string> = {};
      const initialMethods: Record<string, string[]> = {};
      list.forEach(item => {
        map[item.config_key] = item;
        if (item.config_key === "stripe.payment_method_types" || item.config_key === "hitpay.payment_methods") {
          initialMethods[item.config_key] = Array.isArray(item.config_value) ? item.config_value.map(String) : [];
        } else if (item.is_sensitive && normalizeValue(item.config_value) === "***") {
          initialValues[item.config_key] = "";
        } else {
          initialValues[item.config_key] = normalizeValue(item.config_value);
        }
      });
      setConfigs(map);
      setValues(initialValues);
      setMethodValues(initialMethods);
    }).catch(e => showMsg(e.message, true)).finally(() => setLoading(false));
  }, []);
  const hasChanges = useMemo(() => {
    for (const key of Object.keys(values)) {
      if (values[key] !== normalizeValue(configs[key]?.config_value)) return true;
    }
    for (const key of Object.keys(methodValues)) {
      const selected = methodValues[key] ?? [];
      const original = Array.isArray(configs[key]?.config_value) ? configs[key].config_value.map(String) : [];
      if (selected.length !== original.length || selected.some((m, i) => m !== original[i])) return true;
    }
    return false;
  }, [values, methodValues, configs]);
  const {
    validationErrors,
    invalidKeys
  } = useMemo(() => {
    const errors: string[] = [];
    const invalid = new Set<string>();
    const required: string[] = ["app.public_url", "admin.public_url", "staff.public_url"];
    if (parseBoolean(values["stripe.enabled"] || "false")) {
      required.push("stripe.secret_key", "stripe.publishable_key", "stripe.webhook_secret");
      if (!methodValues["stripe.payment_method_types"]?.length) {
        invalid.add("stripe.payment_method_types");
        errors.push("Select at least one Stripe payment method");
      }
    }
    if (parseBoolean(values["hitpay.enabled"] || "false")) {
      required.push("hitpay.api_key", "hitpay.salt", "hitpay.api_base_url");
      if (!methodValues["hitpay.payment_methods"]?.length) {
        invalid.add("hitpay.payment_methods");
        errors.push("Select at least one HitPay payment method");
      }
    }
    for (const key of required) {
      if (!(values[key] || "").trim()) {
        invalid.add(key);
        errors.push(`${LABEL_MAP[key] || key} is required`);
      }
    }
    return {
      validationErrors: errors,
      invalidKeys: invalid
    };
  }, [values, methodValues]);
  const showMsg = (text: string, error = false) => {
    setMsg(text);
    setIsError(error);
    setTimeout(() => setMsg(""), 4000);
  };
  const saveAll = async () => {
    if (validationErrors.length > 0) {
      showMsg(`Please complete all required fields before saving`, true);
      return;
    }
    setSaving(true);
    setIsError(false);
    try {
      const updates: {
        key: string;
        value: string;
      }[] = [];
      for (const [key, val] of Object.entries(values)) {
        const item = configs[key];
        const rawOriginal = normalizeValue(item?.config_value);
        // If the backend redacted a sensitive value, we cannot tell whether it changed,
        // so avoid overwriting it with an empty value.
        const original = item?.is_sensitive && rawOriginal === "***" ? val : rawOriginal;
        if (val !== original) {
          updates.push({
            key,
            value: val
          });
        }
      }
      for (const [key, methods] of Object.entries(methodValues)) {
        const original = Array.isArray(configs[key]?.config_value) ? configs[key].config_value : [];
        if (methods.length !== original.length || methods.some((m, i) => m !== original[i])) {
          updates.push({
            key,
            value: JSON.stringify(methods)
          });
        }
      }
      for (const {
        key,
        value
      } of updates) {
        await api.put("/admin/config", {
          key,
          value
        });
      }

      // Refresh state from server so any type-cast values match
      const refreshed = await api.get<ConfigItem[]>("/admin/config");
      const list = Array.isArray(refreshed) ? refreshed : [];
      const map: Record<string, ConfigItem> = {};
      const refreshedValues: Record<string, string> = {};
      const refreshedMethods: Record<string, string[]> = {};
      list.forEach(item => {
        map[item.config_key] = item;
        if (item.config_key === "stripe.payment_method_types" || item.config_key === "hitpay.payment_methods") {
          refreshedMethods[item.config_key] = Array.isArray(item.config_value) ? item.config_value.map(String) : [];
        } else {
          refreshedValues[item.config_key] = normalizeValue(item.config_value);
        }
      });
      setConfigs(map);
      setValues(refreshedValues);
      setMethodValues(refreshedMethods);
      showMsg(`${updates.length} setting(s) saved`);
    } catch (err: unknown) {
      showMsg(parseApiError(err, "Failed to save settings"), true);
    } finally {
      setSaving(false);
    }
  };
  const renderField = (cfg: {
    key: string;
    label: string;
    type: string;
  }) => {
    const item = configs[cfg.key];
    if (!item) return null;
    if (cfg.type === "boolean") {
      return <Toggle checked={parseBoolean(values[cfg.key] || "false")} onChange={v => setValues(prev => ({
        ...prev,
        [cfg.key]: v ? "true" : "false"
      }))} label={cfg.label} />;
    }
    const isSecret = cfg.type === "password" || item.is_sensitive;
    const visible = visibleSecrets[cfg.key];
    return <div style={{
      display: "flex",
      flexDirection: "column",
      gap: 6
    }}>
        <label style={{
        fontSize: 13,
        fontWeight: 500
      }}>{cfg.label}</label>
        <div style={{
        display: "flex",
        gap: 8,
        alignItems: "center"
      }}>
          <input type={isSecret && !visible ? "password" : "text"} value={values[cfg.key] || ""} onChange={e => setValues(prev => ({
          ...prev,
          [cfg.key]: e.target.value
        }))} style={{
          flex: 1,
          border: `1px solid ${invalidKeys.has(cfg.key) ? "var(--color-error, #ef4444)" : "var(--color-border-light)"}`,
          borderRadius: "var(--radius-sm)",
          padding: "8px 10px",
          fontSize: 13
        }} />
          {isSecret && <button type="button" onClick={() => setVisibleSecrets(prev => ({
          ...prev,
          [cfg.key]: !prev[cfg.key]
        }))} className="btn btn-sm btn-outline" style={{
          padding: "6px 8px"
        }} title={visible ? "Hide" : "Show"}>
              {visible ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>}
        </div>
      </div>;
  };
  if (loading) {
    return <div style={{
      padding: 32
    }}>
        <h1 className="page-title">{t("settings_payment-gateway.payment_gateway")}</h1>
        <p style={{
        color: "var(--color-text-muted)"
      }}>{t("settings_payment-gateway.loading_settings")}</p>
      </div>;
  }
  return <div style={{
    padding: 32
  }}>
      <div className="page-header" style={{
      marginBottom: 24
    }}>
        <div>
          <h1 className="page-title">{t("settings_payment-gateway.payment_gateway_2")}</h1>
          <p className="page-subtitle">{t("settings_payment-gateway.manage_stripe_and_hitpay_credentials_enabled")}</p>
        </div>
      </div>

      {msg && <div className={`alert ${isError ? "alert-error" : "alert-success"}`} style={{
      marginBottom: 16,
      display: "flex",
      alignItems: "center",
      gap: 8
    }}>
          {isError ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
          {msg}
        </div>}

      <div style={{
      display: "flex",
      flexDirection: "column",
      gap: 24,
      maxWidth: 720
    }}>
        {/* Stripe */}
        <div className="card" style={{
        padding: 24
      }}>
          <div style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 20
        }}>
            <CreditCard size={22} />
            <h2 style={{
            fontSize: 17,
            fontWeight: 600
          }}>{t("settings_payment-gateway.stripe")}</h2>
          </div>
          <div style={{
          display: "flex",
          flexDirection: "column",
          gap: 16
        }}>
            {STRIPE_KEYS.map(cfg => <div key={cfg.key}>{renderField(cfg)}</div>)}
            <div>
              <label style={{
              fontSize: 13,
              fontWeight: 500,
              display: "block",
              marginBottom: 8
            }}>{t("settings_payment-gateway.payment_methods")}</label>
              <MethodChips options={STRIPE_METHOD_OPTIONS} selected={methodValues["stripe.payment_method_types"] || []} onChange={v => setMethodValues(prev => ({
              ...prev,
              "stripe.payment_method_types": v
            }))} />
              <p style={{
              fontSize: 12,
              color: "var(--color-text-muted)",
              marginTop: 8
            }}>{t("settings_payment-gateway.select_the_stripe_enabled_methods_for")}</p>
              <WebhookHint provider="stripe" />
            </div>
          </div>
        </div>

        {/* Public URLs */}
        <div className="card" style={{
        padding: 24
      }}>
          <div style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 20
        }}>
            <Globe size={22} />
            <h2 style={{
            fontSize: 17,
            fontWeight: 600
          }}>{t("settings_payment-gateway.public_urls")}</h2>
          </div>
          <div style={{
          display: "flex",
          flexDirection: "column",
          gap: 16
        }}>
            {PUBLIC_URL_KEYS.map(cfg => <div key={cfg.key}>{renderField(cfg)}</div>)}
          </div>
          <p style={{
          fontSize: 12,
          color: "var(--color-text-muted)",
          marginTop: 16
        }}>{t("settings_payment-gateway.update_these_before_moving_to_a")}</p>
        </div>

        {/* HitPay */}
        <div className="card" style={{
        padding: 24
      }}>
          <div style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 20
        }}>
            <Wallet size={22} />
            <h2 style={{
            fontSize: 17,
            fontWeight: 600
          }}>{t("settings_payment-gateway.hitpay")}</h2>
          </div>
          <div style={{
          display: "flex",
          flexDirection: "column",
          gap: 16
        }}>
            {HITPAY_KEYS.map(cfg => <div key={cfg.key}>{renderField(cfg)}</div>)}
            <div>
              <label style={{
              fontSize: 13,
              fontWeight: 500,
              display: "block",
              marginBottom: 8
            }}>{t("settings_payment-gateway.payment_methods_2")}</label>
              <MethodChips options={HITPAY_METHOD_OPTIONS} selected={methodValues["hitpay.payment_methods"] || []} onChange={v => setMethodValues(prev => ({
              ...prev,
              "hitpay.payment_methods": v
            }))} />
              <p style={{
              fontSize: 12,
              color: "var(--color-text-muted)",
              marginTop: 8
            }}>{t("settings_payment-gateway.recommended_for_malaysia_singapore_local_methods")}</p>
            </div>
            <WebhookHint provider="hitpay" />
          </div>
        </div>

        {validationErrors.length > 0 && <div className="alert alert-error" style={{
        display: "flex",
        flexDirection: "column",
        gap: 6
      }}>
            <div style={{
          display: "flex",
          alignItems: "center",
          gap: 8
        }}>
              <AlertCircle size={18} />
              <strong>{t("settings_payment-gateway.please_complete_all_required_fields_before")}</strong>
            </div>
            <ul style={{
          margin: 0,
          paddingLeft: 24,
          fontSize: 13
        }}>
              {validationErrors.map((err, i) => <li key={i}>{err}</li>)}
            </ul>
          </div>}

        <div style={{
        display: "flex",
        gap: 12,
        alignItems: "center"
      }}>
          <button type="button" className="btn btn-primary" onClick={saveAll} disabled={saving || !hasChanges}>
            <Save size={16} style={{
            marginRight: 6
          }} />
            {saving ? "Saving..." : "Save Payment Gateway Settings"}
          </button>
          {!hasChanges && <span style={{
          fontSize: 13,
          color: "var(--color-text-muted)"
        }}>{t("settings_payment-gateway.no_changes")}</span>}
        </div>
      </div>
    </div>;
}