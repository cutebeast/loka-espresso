"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { parseApiError } from "@/lib/errors";
import { useTranslation } from "@/lib/i18n";
import { Eye, EyeOff } from "lucide-react";

interface ConfigItem {
  id: number;
  config_key: string;
  config_value: unknown;
  value_type: string;
  is_sensitive: boolean;
  is_editable: boolean;
}

function normalizeValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return JSON.stringify(value);
}

export function parseBoolean(value: string): boolean {
  return value.toLowerCase() === "true" || value === "1" || value.toLowerCase() === "yes";
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
      <span
        onClick={() => onChange(!checked)}
        style={{
          position: "relative",
          width: 44,
          height: 24,
          borderRadius: 12,
          backgroundColor: checked ? "var(--color-primary, #2563eb)" : "var(--color-border, #d1d5db)",
          transition: "background-color 0.2s",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 2,
            left: checked ? 22 : 2,
            width: 20,
            height: 20,
            borderRadius: "50%",
            backgroundColor: "white",
            transition: "left 0.2s",
          }}
        />
      </span>
      <span style={{ fontSize: 14, fontWeight: 500 }}>{label}</span>
    </label>
  );
}

export function MethodChips({
  options,
  selected,
  onChange,
}: {
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {options.map((method) => {
        const isSelected = selected.includes(method);
        return (
          <button
            key={method}
            type="button"
            onClick={() => {
              const next = isSelected ? selected.filter((m) => m !== method) : [...selected, method];
              onChange(next);
            }}
            style={{
              padding: "6px 12px",
              borderRadius: "var(--radius-md, 6px)",
              border: `1px solid ${isSelected ? "var(--color-primary, #2563eb)" : "var(--color-border-light, #e5e7eb)"}`,
              backgroundColor: isSelected ? "var(--color-primary-soft, #eff6ff)" : "white",
              color: isSelected ? "var(--color-primary, #2563eb)" : "var(--color-text, #374151)",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            {method}
          </button>
        );
      })}
    </div>
  );
}

export function WebhookHint({ provider }: { provider: "stripe" | "hitpay" | "eghl" }) {
  const { t } = useTranslation();
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(process.env.NEXT_PUBLIC_ADMIN_DOMAIN || window.location.origin);
    }
  }, []);
  const hintText =
    provider === "stripe"
      ? "Register this URL in your Stripe dashboard under Developers → Webhook Endpoints. Subscribe to: payment_intent.succeeded, payment_intent.payment_failed, payment_intent.canceled, checkout.session.completed, checkout.session.async_payment_succeeded, checkout.session.async_payment_failed, checkout.session.expired, charge.refunded, charge.dispute.created."
      : provider === "hitpay"
        ? "Register this URL in your HitPay dashboard under Developers → Webhook Endpoints. Both your LIVE and SANDBOX webhook endpoints can post to this same URL."
        : "Configure this as the Backend URL (success JSON post) and Response URL (browser return) in your eGHL merchant portal (ADAPTIS). The browser return URL is configured automatically — no action needed.";
  return (
    <div style={{ background: "var(--color-bg-soft, #f9fafb)", borderRadius: "var(--radius-sm)", padding: 12, fontSize: 13 }}>
      <strong>{t("settings_payment-gateway.webhook_url")}</strong>
      <code style={{ display: "block", marginTop: 4, wordBreak: "break-all" }}>
        {origin}
        {t("settings_payment-gateway.api_webhooks")}
        {provider}
      </code>
      <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 6 }}>{hintText}</p>
    </div>
  );
}

export interface FieldSpec {
  key: string;
  label: string;
  type: string;
  options?: { value: string; label: string }[];
  hint?: string;
  optional?: boolean;
}

export function GatewayField({
  cfg,
  configs,
  values,
  setValues,
  visibleSecrets,
  setVisibleSecrets,
  invalidKeys,
  checkoutModeHint,
}: {
  cfg: FieldSpec;
  configs: Record<string, ConfigItem>;
  values: Record<string, string>;
  setValues: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  visibleSecrets: Record<string, boolean>;
  setVisibleSecrets: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  invalidKeys: Set<string>;
  checkoutModeHint?: boolean;
}) {
  const item = configs[cfg.key];
  if (!item) return null;
  if (cfg.type === "boolean") {
    return (
      <Toggle
        checked={parseBoolean(values[cfg.key] || "false")}
        onChange={(v) => setValues((prev) => ({ ...prev, [cfg.key]: v ? "true" : "false" }))}
        label={cfg.label}
      />
    );
  }
  if (cfg.type === "select" && cfg.options) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label style={{ fontSize: 13, fontWeight: 500 }}>{cfg.label}</label>
        <select
          value={values[cfg.key] || cfg.options[0]?.value || ""}
          onChange={(e) => setValues((prev) => ({ ...prev, [cfg.key]: e.target.value }))}
          style={{
            border: "1px solid var(--color-border-light)",
            borderRadius: "var(--radius-sm)",
            padding: "8px 10px",
            fontSize: 13,
            background: "var(--color-bg-white, #fff)",
          }}
        >
          {cfg.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {checkoutModeHint && values[cfg.key] === "simulator" && (
          <p style={{ fontSize: 12, color: "var(--color-warning-dark, #8A6D1F)", margin: 0 }}>
            Hosted checkouts (wallet top-up, pay links) open the local simulated checkout page. No real payments are made.
          </p>
        )}
        {cfg.hint && <p style={{ fontSize: 12, color: "var(--color-text-muted)", margin: 0 }}>{cfg.hint}</p>}
      </div>
    );
  }
  const isSecret = cfg.type === "password" || item.is_sensitive;
  const visible = visibleSecrets[cfg.key];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ fontSize: 13, fontWeight: 500 }}>{cfg.label}</label>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          type={isSecret && !visible ? "password" : "text"}
          value={values[cfg.key] || ""}
          onChange={(e) => setValues((prev) => ({ ...prev, [cfg.key]: e.target.value }))}
          style={{
            flex: 1,
            border: `1px solid ${invalidKeys.has(cfg.key) ? "var(--color-error, #ef4444)" : "var(--color-border-light)"}`,
            borderRadius: "var(--radius-sm)",
            padding: "8px 10px",
            fontSize: 13,
          }}
        />
        {isSecret && (
          <button
            type="button"
            onClick={() => setVisibleSecrets((prev) => ({ ...prev, [cfg.key]: !prev[cfg.key] }))}
            className="btn btn-sm btn-outline"
            style={{ padding: "6px 8px" }}
            title={visible ? "Hide" : "Show"}
          >
            {visible ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        )}
      </div>
    </div>
  );
}

const METHOD_KEYS = ["stripe.payment_method_types", "hitpay.payment_methods", "eghl.payment_methods"];

interface GatewayState {
  configs: Record<string, ConfigItem>;
  values: Record<string, string>;
  methodValues: Record<string, string[]>;
  visibleSecrets: Record<string, boolean>;
  loading: boolean;
  saving: boolean;
  msg: string;
  isError: boolean;
  hasChanges: boolean;
  setValues: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setMethodValues: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
  setVisibleSecrets: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  saveAll: (validationErrors: string[]) => Promise<number>;
}

export function useGatewayConfigs(): GatewayState {
  const [configs, setConfigs] = useState<Record<string, ConfigItem>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [methodValues, setMethodValues] = useState<Record<string, string[]>>({});
  const [visibleSecrets, setVisibleSecrets] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [isError, setIsError] = useState(false);

  const load = async () => {
    try {
      const data = await api.get<ConfigItem[]>("/admin/config");
      const list = Array.isArray(data) ? data : [];
      const map: Record<string, ConfigItem> = {};
      const initialValues: Record<string, string> = {};
      const initialMethods: Record<string, string[]> = {};
      list.forEach((item) => {
        map[item.config_key] = item;
        if (METHOD_KEYS.includes(item.config_key)) {
          initialMethods[item.config_key] = Array.isArray(item.config_value) ? item.config_value.map(String) : [];
        } else if (item.is_sensitive && normalizeValue(item.config_value) === "********") {
          initialValues[item.config_key] = "";
        } else {
          initialValues[item.config_key] = normalizeValue(item.config_value);
        }
      });
      setConfigs(map);
      setValues(initialValues);
      setMethodValues(initialMethods);
    } catch (e) {
      const err = e as { message?: string };
      showMsg(err.message || "Failed to load settings", true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
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

  const showMsg = (text: string, error = false) => {
    setMsg(text);
    setIsError(error);
    window.setTimeout(() => setMsg(""), 4000);
  };

  const saveAll = async (validationErrors: string[]): Promise<number> => {
    if (validationErrors.length > 0) {
      showMsg("Please complete all required fields before saving", true);
      return 0;
    }
    setSaving(true);
    setIsError(false);
    try {
      const updates: { key: string; value: string }[] = [];
      for (const [key, val] of Object.entries(values)) {
        const item = configs[key];
        const rawOriginal = normalizeValue(item?.config_value);
        // If the backend redacted a sensitive value, we cannot tell whether it changed,
        // so avoid overwriting it with an empty value.
        const original = item?.is_sensitive && rawOriginal === "********" ? val : rawOriginal;
        if (val !== original) {
          updates.push({ key, value: val });
        }
      }
      for (const [key, methods] of Object.entries(methodValues)) {
        const original = Array.isArray(configs[key]?.config_value) ? configs[key].config_value : [];
        if (methods.length !== original.length || methods.some((m, i) => m !== original[i])) {
          updates.push({ key, value: JSON.stringify(methods) });
        }
      }
      for (const { key, value } of updates) {
        await api.put("/admin/config", { key, value });
      }
      await load();
      showMsg(`${updates.length} setting(s) saved`);
      return updates.length;
    } catch (err: unknown) {
      showMsg(parseApiError(err, "Failed to save settings"), true);
      return 0;
    } finally {
      setSaving(false);
    }
  };

  return {
    configs,
    values,
    methodValues,
    visibleSecrets,
    loading,
    saving,
    msg,
    isError,
    hasChanges,
    setValues,
    setMethodValues,
    setVisibleSecrets,
    saveAll,
  };
}

export function ConfigCard({
  icon,
  title,
  badge,
  children,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="card" style={{ padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {icon}
          <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>{title}</h2>
        </div>
        {badge}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>{children}</div>
    </div>
  );
}
