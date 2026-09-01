"use client";

import { ProviderSettingsPage, ProviderSpec } from "../provider-page";

const SPEC: ProviderSpec = {
  id: "stripe",
  enabledKey: "stripe.enabled",
  modeKey: "stripe.mode",
  liveKeys: [
    { key: "stripe.secret_key", label: "Secret Key", type: "password" },
    { key: "stripe.publishable_key", label: "Publishable Key", type: "password" },
    { key: "stripe.webhook_secret", label: "Webhook Secret", type: "password" },
    { key: "stripe.checkout_success_url", label: "Checkout Success URL", type: "text", optional: true },
    { key: "stripe.checkout_cancel_url", label: "Checkout Cancel URL", type: "text", optional: true },
  ],
  sandboxKeys: [
    { key: "stripe.sandbox_secret_key", label: "Sandbox Secret Key (sk_test_…)", type: "password" },
    { key: "stripe.sandbox_publishable_key", label: "Sandbox Publishable Key (pk_test_…)", type: "password" },
    { key: "stripe.sandbox_webhook_secret", label: "Sandbox Webhook Secret (whsec_…)", type: "password" },
  ],
  sharedKeys: [
    { key: "stripe.checkout_mode", label: "Checkout Mode", type: "select", options: [
      { value: "stripe", label: "Stripe (live checkout)" },
      { value: "simulator", label: "Simulator (local test page)" },
    ]},
    { key: "stripe.automatic_tax_enabled", label: "Enable Stripe Automatic Tax", type: "boolean" },
  ],
  methodKey: "stripe.payment_method_types",
  methodOptions: ["card", "fpx", "alipay", "wechat_pay"],
  methodHelp: "Card + FPX online banking. The active mode (Live/Sandbox) picks which credential set is used; webhooks from either environment are accepted.",
};

export default function StripeGatewayPage() {
  return <ProviderSettingsPage spec={SPEC} />;
}
