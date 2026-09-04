"use client";

import { useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { Order } from "@/lib/api";
import { Truck, X } from "lucide-react";

const PROVIDERS = [
  { value: "lalamove", labelKey: "orders.provider_lalamove" },
  { value: "grab_express", labelKey: "orders.provider_grabexpress" },
  { value: "foodpanda", labelKey: "orders.provider_foodpanda" },
  { value: "in_house", labelKey: "orders.provider_in_house" },
  { value: "third_party", labelKey: "orders.provider_third_party" },
];

interface Props {
  order: Order;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (provider: string, externalRef: string, trackingUrl?: string) => void;
}

/**
 * Manual delivery dispatch — staff key the order into an external delivery
 * system (Lalamove etc.) and record the booking reference here. This closes
 * the gap until a delivery-provider API integration lands.
 */
export default function DeliveryDispatchDialog({
  order,
  saving,
  error,
  onClose,
  onSubmit,
}: Props) {
  const { t } = useTranslation();
  const [provider, setProvider] = useState(
    order.delivery_provider || PROVIDERS[0]?.value || "lalamove"
  );
  const [externalRef, setExternalRef] = useState(
    order.delivery_provider_order_id || ""
  );
  const [trackingUrl, setTrackingUrl] = useState(order.delivery_tracking_url || "");

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 90,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--color-bg-white, #fff)",
          borderRadius: 12,
          padding: 20,
          width: "min(92vw, 420px)",
          boxShadow: "0 10px 40px rgba(0,0,0,0.25)",
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="flex items-center gap-2 font-semibold">
            <Truck size={18} />
            {t("orders.dispatch_title")}
          </h3>
          <button type="button" onClick={onClose} aria-label={t("common.close")}>
            <X size={18} />
          </button>
        </div>
        <p className="text-sm text-gray-600 mb-4">
          {order.order_number} · {t("orders.dispatch_hint")}
        </p>

        <label className="block text-sm mb-1">{t("orders.dispatch_provider")}</label>
        <select
          value={provider}
          onChange={e => setProvider(e.target.value)}
          style={{
            width: "100%",
            padding: "10px 12px",
            border: "1px solid var(--color-border, #d1d5db)",
            borderRadius: 8,
            marginBottom: 12,
            background: "var(--color-bg-white, #fff)",
          }}
        >
          {PROVIDERS.map(p => (
            <option key={p.value} value={p.value}>
              {t(p.labelKey)}
            </option>
          ))}
        </select>

        <label className="block text-sm mb-1">{t("orders.dispatch_ref")}</label>
        <input
          value={externalRef}
          onChange={e => setExternalRef(e.target.value)}
          placeholder={t("orders.dispatch_ref_placeholder")}
          maxLength={100}
          style={{
            width: "100%",
            padding: "10px 12px",
            border: "1px solid var(--color-border, #d1d5db)",
            borderRadius: 8,
            marginBottom: 12,
          }}
        />

        <label className="block text-sm mb-1">{t("orders.dispatch_tracking_url")}</label>
        <input
          value={trackingUrl}
          onChange={e => setTrackingUrl(e.target.value)}
          placeholder={t("orders.dispatch_tracking_url_placeholder")}
          maxLength={500}
          style={{
            width: "100%",
            padding: "10px 12px",
            border: "1px solid var(--color-border, #d1d5db)",
            borderRadius: 8,
            marginBottom: 12,
          }}
        />

        {error && <p className="text-sm text-red-600 mb-2">{error}</p>}

        <div className="flex gap-2 justify-end">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={saving || !provider || externalRef.trim().length === 0}
            onClick={() => onSubmit(provider, externalRef.trim(), trackingUrl.trim() || undefined)}
          >
            {saving ? t("common.saving") : t("orders.dispatch_save")}
          </button>
        </div>
      </div>
    </div>
  );
}
