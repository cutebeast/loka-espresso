"""Unit tests for the mode-aware (live/sandbox) payment-provider getters."""

import pytest

from app.services.payment import (
    _get_stripe_publishable_key,
    _get_stripe_secret_key,
    _get_stripe_webhook_secret,
    get_stripe_webhook_secrets_all,
)
from app.services.eghl import _get_base_url, _get_credential_pairs_all, _get_merchant_code, _get_merchant_key
from app.services.hitpay import _get_api_key, _get_salts_all
from app.services.platform_config import PlatformConfigService


def _patch_config(monkeypatch, config: dict[str, str]):
    async def fake_get_str(self, key: str, default: str = "") -> str:
        return config.get(key, default)

    async def fake_get_many(self, keys, environment=None) -> dict:
        return {k: v for k, v in config.items() if k in keys}

    monkeypatch.setattr(PlatformConfigService, "get_str", fake_get_str)
    monkeypatch.setattr(PlatformConfigService, "get_many", fake_get_many)


def _settings():
    return type(
        "S",
        (),
        {
            "stripe_secret_key": None,
            "stripe_publishable_key": None,
            "stripe_webhook_secret": None,
        },
    )()


@pytest.mark.asyncio
async def test_stripe_getters_live_mode_default(monkeypatch):
    config = {
        "stripe.mode": "live",
        "stripe.secret_key": "sk_live_1",
        "stripe.publishable_key": "pk_live_1",
        "stripe.webhook_secret": "whsec_live_1",
        "stripe.sandbox_secret_key": "sk_test_1",
        "stripe.sandbox_publishable_key": "pk_test_1",
        "stripe.sandbox_webhook_secret": "whsec_test_1",
    }
    _patch_config(monkeypatch, config)
    monkeypatch.setattr("app.services.payment.get_settings", _settings)
    db = object()
    assert await _get_stripe_secret_key(db) == "sk_live_1"
    assert await _get_stripe_publishable_key(db) == "pk_live_1"
    assert await _get_stripe_webhook_secret(db) == "whsec_live_1"


@pytest.mark.asyncio
async def test_stripe_getters_sandbox_mode(monkeypatch):
    config = {
        "stripe.mode": "sandbox",
        "stripe.secret_key": "sk_live_1",
        "stripe.publishable_key": "pk_live_1",
        "stripe.webhook_secret": "whsec_live_1",
        "stripe.sandbox_secret_key": "sk_test_1",
        "stripe.sandbox_publishable_key": "pk_test_1",
        "stripe.sandbox_webhook_secret": "whsec_test_1",
    }
    _patch_config(monkeypatch, config)
    monkeypatch.setattr("app.services.payment.get_settings", _settings)
    db = object()
    assert await _get_stripe_secret_key(db) == "sk_test_1"
    assert await _get_stripe_publishable_key(db) == "pk_test_1"
    assert await _get_stripe_webhook_secret(db) == "whsec_test_1"


@pytest.mark.asyncio
async def test_stripe_webhook_secrets_all_dedupes(monkeypatch):
    config = {
        "stripe.mode": "live",
        "stripe.webhook_secret": "whsec_live_1",
        "stripe.sandbox_webhook_secret": "whsec_test_1",
    }
    _patch_config(monkeypatch, config)
    monkeypatch.setattr("app.services.payment.get_settings", _settings)
    secrets, active = await get_stripe_webhook_secrets_all(object())
    assert secrets == ["whsec_live_1", "whsec_test_1"]
    assert active == "whsec_live_1"


@pytest.mark.asyncio
async def test_stripe_webhook_active_secret_follows_mode(monkeypatch):
    config = {
        "stripe.mode": "sandbox",
        "stripe.webhook_secret": "whsec_live_1",
        "stripe.sandbox_webhook_secret": "whsec_test_1",
    }
    _patch_config(monkeypatch, config)
    monkeypatch.setattr("app.services.payment.get_settings", _settings)
    secrets, active = await get_stripe_webhook_secrets_all(object())
    assert active == "whsec_test_1"


@pytest.mark.asyncio
async def test_hitpay_mode_aware_getters(monkeypatch):
    config = {
        "hitpay.mode": "sandbox",
        "hitpay.api_key": "live_key",
        "hitpay.salt": "live_salt",
        "hitpay.sandbox_api_key": "sandbox_key",
        "hitpay.sandbox_salt": "sandbox_salt",
    }
    _patch_config(monkeypatch, config)
    db = object()
    assert await _get_api_key(db) == "sandbox_key"
    salts, active = await _get_salts_all(db)
    assert salts == ["live_salt", "sandbox_salt"]
    assert active == "sandbox_salt"


@pytest.mark.asyncio
async def test_eghl_mode_aware_getters(monkeypatch):
    config = {
        "eghl.mode": "sandbox",
        "eghl.merchant_code": "LIVE1",
        "eghl.merchant_key": "live_key",
        "eghl.base_url": "https://pay.e-ghl.com",
        "eghl.sandbox_merchant_code": "TEST1",
        "eghl.sandbox_merchant_key": "test_key",
        "eghl.sandbox_base_url": "https://test2pay.ghl.com",
    }
    _patch_config(monkeypatch, config)
    db = object()
    assert await _get_merchant_code(db) == "TEST1"
    assert await _get_merchant_key(db) == "test_key"
    assert await _get_base_url(db) == "https://test2pay.ghl.com"
    pairs, active = await _get_credential_pairs_all(db)
    assert pairs == [("LIVE1", "live_key"), ("TEST1", "test_key")]
    assert active == ("TEST1", "test_key")


@pytest.mark.asyncio
async def test_eghl_base_url_raises_when_active_env_unconfigured(monkeypatch):
    """An empty ACTIVE-mode base URL must fail loudly (503 EGHLError), not
    silently render a checkout form that posts to an empty URL."""
    from app.services.eghl import EGHLError

    config = {
        "eghl.mode": "sandbox",
        "eghl.base_url": "https://pay.e-ghl.com",
        "eghl.sandbox_base_url": "",
    }
    _patch_config(monkeypatch, config)
    with pytest.raises(EGHLError):
        await _get_base_url(object())

    config["eghl.mode"] = "live"
    config["eghl.base_url"] = ""
    _patch_config(monkeypatch, config)
    with pytest.raises(EGHLError):
        await _get_base_url(object())
