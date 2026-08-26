"""Unit tests for the eGHL (GHL Systems) payment service."""

import hashlib
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.eghl import (
    EGHLError,
    _eghl_enabled,
    build_eghl_callback_hash,
    build_eghl_request_hash,
    create_eghl_checkout,
    verify_eghl_callback_hash,
)

# ---------------------------------------------------------------------------
# Request hash (hosted-page form)
# ---------------------------------------------------------------------------

# Fixed vector, computed by hand from the documented field sequence:
#   sha256(password + ServiceID + PaymentID + MerchantReturnURL
#          + MerchantCallbackURL + Amount + CurrencyCode + CustIP + PageTimeout)
REQUEST_HASH_VECTOR = hashlib.sha256(
    (
        "testpass"
        + "SIT"
        + "EG123"
        + "https://app.example/api/payments/eghl/return"
        + "https://app.example/api/webhooks/eghl"
        + "10.00"
        + "MYR"
        + "1.2.3.4"
        + "780"
    ).encode("utf-8")
).hexdigest()


def test_build_eghl_request_hash_matches_known_vector():
    got = build_eghl_request_hash(
        password="testpass",
        service_id="SIT",
        payment_id="EG123",
        merchant_return_url="https://app.example/api/payments/eghl/return",
        merchant_callback_url="https://app.example/api/webhooks/eghl",
        amount="10.00",
        currency_code="MYR",
        cust_ip="1.2.3.4",
    )
    assert got == REQUEST_HASH_VECTOR
    assert got == got.lower()  # documented as lowercase hex


# ---------------------------------------------------------------------------
# Callback hash verification
# ---------------------------------------------------------------------------

CALLBACK_FIELDS = {
    "TxnID": "TXN999",
    "ServiceID": "SIT",
    "PaymentID": "EG123",
    "OrderNumber": "ORD-1",
    "TxnStatus": "0",
    "Amount": "10.00",
    "CurrencyCode": "MYR",
    "AuthCode": "AUTH01",
    "TxnMessage": "Approved",
}


def _signed_callback_fields(password: str = "testpass") -> dict:
    fields = dict(CALLBACK_FIELDS)
    fields["HashValue"] = build_eghl_callback_hash(
        password=password,
        txn_id=fields["TxnID"],
        service_id=fields["ServiceID"],
        payment_id=fields["PaymentID"],
        txn_status=fields["TxnStatus"],
        amount=fields["Amount"],
        currency_code=fields["CurrencyCode"],
        auth_code=fields["AuthCode"],
    )
    return fields


def test_verify_eghl_callback_hash_accepts_valid_signature():
    assert verify_eghl_callback_hash(_signed_callback_fields(), "testpass") is True


def test_verify_eghl_callback_hash_is_case_insensitive():
    fields = _signed_callback_fields()
    fields["HashValue"] = fields["HashValue"].upper()
    assert verify_eghl_callback_hash(fields, "testpass") is True


def test_verify_eghl_callback_hash_rejects_tampered_fields():
    fields = _signed_callback_fields()
    fields["Amount"] = "999.00"
    assert verify_eghl_callback_hash(fields, "testpass") is False


def test_verify_eghl_callback_hash_rejects_wrong_password():
    assert verify_eghl_callback_hash(_signed_callback_fields(), "otherpass") is False


def test_verify_eghl_callback_hash_rejects_missing_hash():
    fields = _signed_callback_fields()
    del fields["HashValue"]
    assert verify_eghl_callback_hash(fields, "testpass") is False


# ---------------------------------------------------------------------------
# Config gating
# ---------------------------------------------------------------------------


def _fake_config(monkeypatch, *, enabled: bool, merchant_id: str = "", password: str = ""):
    config = MagicMock()
    config.get_bool = AsyncMock(return_value=enabled)
    config.get_str = AsyncMock(
        side_effect=lambda key, default="": {
            "eghl.merchant_id": merchant_id,
            "eghl.password": password,
        }.get(key, default)
    )
    config.get = AsyncMock(return_value=None)
    config.get_app_public_url = AsyncMock(return_value="https://app.example")
    monkeypatch.setattr("app.services.eghl.PlatformConfigService", lambda db: config)
    return config


@pytest.mark.asyncio
async def test_eghl_enabled_requires_flag_and_credentials(monkeypatch):
    _fake_config(monkeypatch, enabled=False, merchant_id="SIT", password="pw")
    assert await _eghl_enabled(None) is False

    _fake_config(monkeypatch, enabled=True, merchant_id="", password="pw")
    assert await _eghl_enabled(None) is False

    _fake_config(monkeypatch, enabled=True, merchant_id="SIT", password="")
    assert await _eghl_enabled(None) is False

    _fake_config(monkeypatch, enabled=True, merchant_id="SIT", password="pw")
    assert await _eghl_enabled(None) is True


@pytest.mark.asyncio
async def test_create_eghl_checkout_raises_when_disabled(monkeypatch):
    _fake_config(monkeypatch, enabled=False)
    with pytest.raises(EGHLError) as exc_info:
        await create_eghl_checkout(None, None, None, None, amount=Decimal("10.00"), currency="MYR")
    assert exc_info.value.status_code == 503


@pytest.mark.asyncio
async def test_create_eghl_checkout_requires_amount_for_topups(monkeypatch):
    _fake_config(monkeypatch, enabled=True, merchant_id="SIT", password="pw")
    with pytest.raises(EGHLError):
        await create_eghl_checkout(None, None, None, None, topup_session=MagicMock(id=1))
