"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useTranslation } from "@/lib/i18n";
import { AlertCircle, CheckCircle2, ChevronRight, CreditCard, Globe, Save, Wallet } from "lucide-react";
import {
  ConfigCard,
  GatewayField,
  parseBoolean,
  useGatewayConfigs,
} from "./gateway-shared";

const PROVIDERS = [
  { id: "stripe", enabledKey: "stripe.enabled", modeKey: "stripe.mode", href: "/settings/payment-gateway/stripe", icon: CreditCard },
  { id: "eghl", enabledKey: "eghl.enabled", modeKey: "eghl.mode", href: "/settings/payment-gateway/eghl", icon: CreditCard },
  { id: "hitpay", enabledKey: "hitpay.enabled", modeKey: "hitpay.mode", href: "/settings/payment-gateway/hitpay", icon: Wallet },
] as const;

const PUBLIC_URL_KEYS = [
  { key: "app.public_url", label: "Customer App Public URL", type: "text" },
  { key: "admin.public_url", label: "Admin Portal Public URL", type: "text" },
  { key: "staff.public_url", label: "Staff Portal Public URL", type: "text" },
];

export default function PaymentGatewayOverviewPage() {
  const { t } = useTranslation();
  const {
    configs,
    values,
    visibleSecrets,
    setValues,
    setVisibleSecrets,
    loading,
    saving,
    msg,
    isError,
    hasChanges,
    saveAll,
  } = useGatewayConfigs();
  const [attempted, setAttempted] = useState(false);

  const { validationErrors, invalidKeys } = useMemo(() => {
    const errors: string[] = [];
    const invalid = new Set<string>();
    for (const cfg of PUBLIC_URL_KEYS) {
      if (!(values[cfg.key] || "").trim()) {
        invalid.add(cfg.key);
        errors.push(`${cfg.label} is required`);
      }
    }
    return { validationErrors: errors, invalidKeys: invalid };
  }, [values]);

  if (loading) {
    return (
      <div style={{ padding: 32 }}>
        <h1 className="page-title">{t("settings_payment-gateway.payment_gateway")}</h1>
        <p style={{ color: "var(--color-text-muted)" }}>{t("settings_payment-gateway.loading_settings")}</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 32 }}>
      <div className="page-header" style={{ marginBottom: 24 }}>
        <div>
          <h1 className="page-title">{t("settings_payment-gateway.payment_gateway_2")}</h1>
          <p className="page-subtitle">{t("settings_payment-gateway.subtitle_2")}</p>
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
        {/* Provider hub */}
        <div className="card" style={{ padding: 24 }}>
          <h2 style={{ fontSize: 17, fontWeight: 600, margin: "0 0 16px" }}>{t("settings_payment-gateway.providers")}</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {PROVIDERS.map((p) => {
              const Icon = p.icon;
              const enabled = parseBoolean(values[p.enabledKey] || "false");
              const mode = values[p.modeKey] === "sandbox" ? "sandbox" : "live";
              return (
                <Link
                  key={p.id}
                  href={p.href}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "14px 16px",
                    border: "1px solid var(--color-border-light, #e5e7eb)",
                    borderRadius: "var(--radius-md, 8px)",
                    textDecoration: "none",
                    color: "var(--color-text, #374151)",
                    background: "var(--color-bg-white, #fff)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <Icon size={20} />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{p.id === "eghl" ? "eGHL" : p.id === "hitpay" ? "HitPay" : "Stripe"}</div>
                      <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                        {enabled
                          ? `${t("settings_payment-gateway.enabled")} · ${mode === "sandbox" ? t("settings_payment-gateway.mode_sandbox") : t("settings_payment-gateway.mode_live")}`
                          : t("settings_payment-gateway.disabled")}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        padding: "3px 10px",
                        borderRadius: 999,
                        background: enabled ? "var(--color-success-soft, #ecfdf5)" : "var(--color-bg-soft, #f9fafb)",
                        color: enabled ? "var(--color-success, #16a34a)" : "var(--color-text-muted)",
                      }}
                    >
                      {enabled ? t("settings_payment-gateway.enabled") : t("settings_payment-gateway.disabled")}
                    </span>
                    <ChevronRight size={16} style={{ color: "var(--color-text-muted)" }} />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Public URLs */}
        <ConfigCard icon={<Globe size={22} />} title={t("settings_payment-gateway.public_urls")}>
          {PUBLIC_URL_KEYS.map((cfg) => (
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
          <p style={{ fontSize: 12, color: "var(--color-text-muted)", margin: 0 }}>
            {t("settings_payment-gateway.update_these_before_moving_to_a")}
          </p>
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
            {saving ? "Saving..." : t("settings_payment-gateway.save_settings")}
          </button>
          {!hasChanges && (
            <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>{t("settings_payment-gateway.no_changes")}</span>
          )}
        </div>
      </div>
    </div>
  );
}
