"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "@/lib/i18n";
import { AlertCircle, CheckCircle2, CreditCard, Save, Wallet } from "lucide-react";
import {
  ConfigCard,
  FieldSpec,
  GatewayField,
  MethodChips,
  WebhookHint,
  parseBoolean,
  useGatewayConfigs,
} from "./gateway-shared";

export interface ProviderSpec {
  id: "stripe" | "eghl" | "hitpay";
  enabledKey: string;
  modeKey: string;
  liveKeys: FieldSpec[];
  sandboxKeys: FieldSpec[];
  sharedKeys: FieldSpec[];
  methodKey: string;
  methodOptions: string[];
  methodLabelKey?: string;
  methodHelp?: string;
}

const MODE_OPTIONS = [
  { value: "live", label: "Live (production)" },
  { value: "sandbox", label: "Sandbox (test)" },
];

export function ProviderSettingsPage({ spec }: { spec: ProviderSpec }) {
  const { t } = useTranslation();
  const ns = `settings_payment-gateway_${spec.id}`;
  const {
    configs,
    values,
    methodValues,
    visibleSecrets,
    setValues,
    setMethodValues,
    setVisibleSecrets,
    loading,
    saving,
    msg,
    isError,
    hasChanges,
    saveAll,
  } = useGatewayConfigs();
  const [attempted, setAttempted] = useState(false);

  const labelMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const cfg of [...spec.liveKeys, ...spec.sandboxKeys, ...spec.sharedKeys]) {
      map[cfg.key] = cfg.label;
    }
    return map;
  }, [spec]);

  const { validationErrors, invalidKeys } = useMemo(() => {
    const errors: string[] = [];
    const invalid = new Set<string>();
    const required: string[] = [];
    if (parseBoolean(values[spec.enabledKey] || "false")) {
      const mode = values[spec.modeKey] === "sandbox" ? "sandbox" : "live";
      const credKeys = mode === "sandbox" ? spec.sandboxKeys : spec.liveKeys;
      for (const cfg of credKeys) {
        if (cfg.type !== "boolean" && !cfg.optional) required.push(cfg.key);
      }
      if (!methodValues[spec.methodKey]?.length) {
        invalid.add(spec.methodKey);
        errors.push("Select at least one payment method");
      }
    }
    for (const key of required) {
      if (!(values[key] || "").trim()) {
        invalid.add(key);
        errors.push(`${labelMap[key] || key} is required for the active mode`);
      }
    }
    return { validationErrors: errors, invalidKeys: invalid };
  }, [values, methodValues, spec, labelMap]);

  if (loading) {
    return (
      <div style={{ padding: 32 }}>
        <h1 className="page-title">{t(`${ns}.title`)}</h1>
        <p style={{ color: "var(--color-text-muted)" }}>{t("settings_payment-gateway.loading_settings")}</p>
      </div>
    );
  }

  const Icon = spec.id === "hitpay" ? Wallet : CreditCard;
  const mode = values[spec.modeKey] === "sandbox" ? "sandbox" : "live";
  const modeSpec: FieldSpec = {
    key: spec.modeKey,
    label: t(`${ns}.mode`),
    type: "select",
    options: MODE_OPTIONS,
    hint:
      mode === "sandbox"
        ? t(`${ns}.mode_sandbox_hint`)
        : t(`${ns}.mode_live_hint`),
  };

  return (
    <div style={{ padding: 32 }}>
      <div className="page-header" style={{ marginBottom: 24 }}>
        <div>
          <h1 className="page-title">{t(`${ns}.title`)}</h1>
          <p className="page-subtitle">{t(`${ns}.subtitle`)}</p>
        </div>
      </div>

      {msg && (
        <div
          className={`alert ${isError ? "alert-error" : "alert-success"}`}
          style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}
        >
          {isError ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
          {msg}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 720 }}>
        <ConfigCard
          icon={<Icon size={22} />}
          title={t(`${ns}.live`)}
          badge={
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                padding: "3px 10px",
                borderRadius: 999,
                background: mode === "live" ? "var(--color-primary-soft, #eff6ff)" : "var(--color-bg-soft, #f9fafb)",
                color: mode === "live" ? "var(--color-primary, #2563eb)" : "var(--color-text-muted)",
              }}
            >
              {mode === "live" ? t(`${ns}.active`) : t(`${ns}.inactive`)}
            </span>
          }
        >
          {spec.liveKeys.map((cfg) => (
            <GatewayField
              key={cfg.key}
              cfg={cfg}
              configs={configs}
              values={values}
              setValues={setValues}
              visibleSecrets={visibleSecrets}
              setVisibleSecrets={setVisibleSecrets}
              invalidKeys={invalidKeys}
            />
          ))}
        </ConfigCard>

        <ConfigCard
          icon={<Icon size={22} />}
          title={t(`${ns}.sandbox`)}
          badge={
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                padding: "3px 10px",
                borderRadius: 999,
                background: mode === "sandbox" ? "var(--color-primary-soft, #eff6ff)" : "var(--color-bg-soft, #f9fafb)",
                color: mode === "sandbox" ? "var(--color-primary, #2563eb)" : "var(--color-text-muted)",
              }}
            >
              {mode === "sandbox" ? t(`${ns}.active`) : t(`${ns}.inactive`)}
            </span>
          }
        >
          {spec.sandboxKeys.map((cfg) => (
            <GatewayField
              key={cfg.key}
              cfg={cfg}
              configs={configs}
              values={values}
              setValues={setValues}
              visibleSecrets={visibleSecrets}
              setVisibleSecrets={setVisibleSecrets}
              invalidKeys={invalidKeys}
            />
          ))}
          <p style={{ fontSize: 12, color: "var(--color-text-muted)", margin: 0 }}>{t(`${ns}.sandbox_note`)}</p>
        </ConfigCard>

        <ConfigCard icon={<Icon size={22} />} title={t(`${ns}.shared`)}>
          <GatewayField
            cfg={{ key: spec.enabledKey, label: t(`${ns}.enabled`), type: "boolean" }}
            configs={configs}
            values={values}
            setValues={setValues}
            visibleSecrets={visibleSecrets}
            setVisibleSecrets={setVisibleSecrets}
            invalidKeys={invalidKeys}
          />
          <GatewayField
            cfg={modeSpec}
            configs={configs}
            values={values}
            setValues={setValues}
            visibleSecrets={visibleSecrets}
            setVisibleSecrets={setVisibleSecrets}
            invalidKeys={invalidKeys}
          />
          {spec.sharedKeys.map((cfg) => (
            <GatewayField
              key={cfg.key}
              cfg={cfg}
              configs={configs}
              values={values}
              setValues={setValues}
              visibleSecrets={visibleSecrets}
              setVisibleSecrets={setVisibleSecrets}
              invalidKeys={invalidKeys}
              checkoutModeHint={cfg.key === "stripe.checkout_mode"}
            />
          ))}
          <div>
            <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 8 }}>
              {t(spec.methodLabelKey || "settings_payment-gateway.payment_methods_2")}
            </label>
            <MethodChips
              options={spec.methodOptions}
              selected={methodValues[spec.methodKey] || []}
              onChange={(v) => setMethodValues((prev) => ({ ...prev, [spec.methodKey]: v }))}
            />
            {spec.methodHelp && (
              <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 8 }}>{spec.methodHelp}</p>
            )}
          </div>
          <WebhookHint provider={spec.id} />
        </ConfigCard>

        {attempted && validationErrors.length > 0 && (
          <div className="alert alert-error" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <AlertCircle size={18} />
              <strong>{t("settings_payment-gateway.please_complete_all_required_fields_before")}</strong>
            </div>
            <ul style={{ margin: 0, paddingLeft: 24, fontSize: 13 }}>
              {validationErrors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={async () => {
              setAttempted(true);
              await saveAll(validationErrors);
            }}
            disabled={saving || !hasChanges}
          >
            <Save size={16} style={{ marginRight: 6 }} />
            {saving ? "Saving..." : t(`${ns}.save`)}
          </button>
          {!hasChanges && (
            <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
              {t("settings_payment-gateway.no_changes")}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
