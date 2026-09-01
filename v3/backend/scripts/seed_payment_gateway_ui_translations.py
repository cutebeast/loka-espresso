"""Seed admin-ui translation keys for the split Payment Gateway pages.

The payment-gateway settings page was split into an overview hub + one page
per provider (stripe / eghl / hitpay) with Live + Sandbox credential cards.

Upserts (namespace, translation_key, locale) with DO NOTHING — never
overwrites existing rows (Translations-page edits are manual and sacred).

Run:  python3 scripts/seed_payment_gateway_ui_translations.py --yes --force-prod
"""

from __future__ import annotations

import asyncio

from sqlalchemy import text

from _db_utils import get_db

KEYS: dict[str, dict[str, str]] = {
    # Sidebar nav
    "admin.nav.settings.paymentGatewayStripe": {"en": "Stripe", "zh": "Stripe"},
    "admin.nav.settings.paymentGatewayEghl": {"en": "eGHL", "zh": "eGHL"},
    "admin.nav.settings.paymentGatewayHitpay": {"en": "HitPay", "zh": "HitPay"},
    # Overview hub (settings_payment-gateway namespace)
    "settings_payment-gateway.providers": {"en": "Payment Providers", "zh": "支付提供商"},
    "settings_payment-gateway.subtitle_2": {
        "en": "Configure Stripe, eGHL and HitPay — each provider has separate live & sandbox credentials",
        "zh": "配置 Stripe、eGHL 和 HitPay — 每个提供商均有独立的生产与沙盒凭据",
    },
    "settings_payment-gateway.enabled": {"en": "Enabled", "zh": "已启用"},
    "settings_payment-gateway.disabled": {"en": "Disabled", "zh": "已停用"},
    "settings_payment-gateway.mode_live": {"en": "Live mode", "zh": "生产模式"},
    "settings_payment-gateway.mode_sandbox": {"en": "Sandbox mode", "zh": "沙盒模式"},
    "settings_payment-gateway.save_settings": {"en": "Save Settings", "zh": "保存设置"},
}

_PROVIDER_PAGES = {
    "stripe": {
        "zh_title": "Stripe",
        "zh_subtitle": "Stripe 支付网关 — 生产与沙盒凭据",
        "zh_enabled": "启用 Stripe",
        "zh_save": "保存 Stripe 设置",
    },
    "eghl": {
        "zh_title": "eGHL",
        "zh_subtitle": "eGHL 支付网关 — 生产与沙盒凭据",
        "zh_enabled": "启用 eGHL",
        "zh_save": "保存 eGHL 设置",
    },
    "hitpay": {
        "zh_title": "HitPay",
        "zh_subtitle": "HitPay 支付网关 — 生产与沙盒凭据",
        "zh_enabled": "启用 HitPay",
        "zh_save": "保存 HitPay 设置",
    },
}

for provider, labels in _PROVIDER_PAGES.items():
    ns = f"settings_payment-gateway_{provider}"
    KEYS[f"{ns}.title"] = {"en": provider.title() if provider != "hitpay" else "HitPay", "zh": labels["zh_title"]}
    KEYS[f"{ns}.subtitle"] = {
        "en": f"{provider.title()} payment gateway — live & sandbox credentials",
        "zh": labels["zh_subtitle"],
    }
    KEYS[f"{ns}.live"] = {"en": "Live credentials", "zh": "生产凭据"}
    KEYS[f"{ns}.sandbox"] = {"en": "Sandbox credentials", "zh": "沙盒凭据"}
    KEYS[f"{ns}.shared"] = {"en": "Gateway settings", "zh": "网关设置"}
    KEYS[f"{ns}.mode"] = {"en": "Active Mode", "zh": "激活模式"}
    KEYS[f"{ns}.mode_live_hint"] = {
        "en": "Live mode uses the production credentials. Real charges apply.",
        "zh": "生产模式使用正式凭据，将产生真实扣款。",
    }
    KEYS[f"{ns}.mode_sandbox_hint"] = {
        "en": "Sandbox mode uses the test credentials — payments are simulated.",
        "zh": "沙盒模式使用测试凭据 — 支付为模拟，不产生真实扣款。",
    }
    KEYS[f"{ns}.active"] = {"en": "Active", "zh": "激活"}
    KEYS[f"{ns}.inactive"] = {"en": "Inactive", "zh": "未激活"}
    KEYS[f"{ns}.enabled"] = {"en": f"Enable {provider.title()}", "zh": labels["zh_enabled"]}
    KEYS[f"{ns}.sandbox_note"] = {
        "en": "Sandbox credentials are used only when Active Mode is Sandbox. Webhook events from either environment are accepted at the same webhook URL.",
        "zh": "仅当激活模式为沙盒时使用沙盒凭据。两个环境的 Webhook 事件均可在同一 Webhook 地址接收。",
    }
    KEYS[f"{ns}.save"] = {"en": f"Save {provider.title()} Settings", "zh": labels["zh_save"]}

UPSERT = text(
    """
    INSERT INTO translations (namespace, translation_key, locale, translated_text, source_text, is_auto_translated)
    VALUES (:namespace, :key, :locale, :translated_text, :source_text, false)
    ON CONFLICT (namespace, translation_key, locale)
    DO NOTHING
    """
)


async def main() -> None:
    rows = 0
    async with get_db() as db:
        for key, locales in KEYS.items():
            source = locales["en"]
            for locale in ("en", "zh"):
                await db.execute(UPSERT, {
                    "namespace": "admin-ui",
                    "key": key,
                    "locale": locale,
                    "translated_text": locales.get(locale, source),
                    "source_text": source,
                })
                rows += 1
    print(f"Upserted {rows} translation rows ({len(KEYS)} keys x en/zh)")


if __name__ == "__main__":
    asyncio.run(main())
