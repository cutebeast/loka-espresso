"use client";

import { ProviderSettingsPage, ProviderSpec } from "../provider-page";

const SPEC: ProviderSpec = {
  id: "eghl",
  enabledKey: "eghl.enabled",
  modeKey: "eghl.mode",
  liveKeys: [
    { key: "eghl.merchant_code", label: "Merchant Code", type: "text" },
    { key: "eghl.merchant_key", label: "Merchant Key (HMAC-SHA512 signing key)", type: "password" },
    { key: "eghl.base_url", label: "Base URL", type: "text", hint: "ADAPTIS {BaseURL} from the merchant-approval email (no trailing path — e.g. https://pay.e-ghl.com)" },
  ],
  sandboxKeys: [
    { key: "eghl.sandbox_merchant_code", label: "Sandbox Merchant Code", type: "text" },
    { key: "eghl.sandbox_merchant_key", label: "Sandbox Merchant Key", type: "password" },
    { key: "eghl.sandbox_base_url", label: "Sandbox Base URL", type: "text", hint: "ADAPTIS test base URL (e.g. https://test2pay.ghl.com)" },
  ],
  sharedKeys: [],
  methodKey: "eghl.payment_methods",
  methodOptions: ["card", "fpx", "boost", "tng", "shopeepay", "setel", "maybank_payqr"],
  methodHelp: "Preferred Malaysia gateway (hosted page: card + FPX online banking). The active mode (Live/Sandbox) picks which credential set is used; callbacks from either environment are accepted.",
};

export default function EghlGatewayPage() {
  return <ProviderSettingsPage spec={SPEC} />;
}
