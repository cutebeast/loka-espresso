"use client";

import { ProviderSettingsPage, ProviderSpec } from "../provider-page";

const SPEC: ProviderSpec = {
  id: "hitpay",
  enabledKey: "hitpay.enabled",
  modeKey: "hitpay.mode",
  liveKeys: [
    { key: "hitpay.api_key", label: "API Key", type: "password" },
    { key: "hitpay.salt", label: "Webhook Salt", type: "password" },
    { key: "hitpay.api_base_url", label: "API Base URL", type: "text", hint: "Live API base URL (default https://api.hitpay.com.my)" },
  ],
  sandboxKeys: [
    { key: "hitpay.sandbox_api_key", label: "Sandbox API Key (sandbox_…)", type: "password" },
    { key: "hitpay.sandbox_salt", label: "Sandbox Webhook Salt", type: "password" },
    { key: "hitpay.sandbox_api_base_url", label: "Sandbox API Base URL", type: "text", hint: "Sandbox API base URL (default https://api.sandbox.hit-pay.com)" },
  ],
  sharedKeys: [],
  methodKey: "hitpay.payment_methods",
  methodOptions: ["duitnow", "touch_n_go", "paynow_online", "boost", "shopee_pay", "fpx", "card"],
  methodHelp: "Recommended for Malaysia/Singapore local methods (DuitNow, TnG, Boost, ShopeePay). The active mode (Live/Sandbox) picks which credential set is used; webhooks from either environment are accepted.",
};

export default function HitPayGatewayPage() {
  return <ProviderSettingsPage spec={SPEC} />;
}
