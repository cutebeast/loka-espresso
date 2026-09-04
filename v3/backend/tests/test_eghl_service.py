"""Unit tests for the eGHL (ADAPTIS) provider service.

Covers the HMAC-SHA512 signature constructions (request/backend-post,
requery, refund), amount stripping, backend-post verification, requery
response mapping, and the checkout flow enable-gating.
"""

from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.eghl import (
    PAYMENT_ID_MAP,
    EGHLError,
    _eghl_enabled,
    _fmt_amount,
    _fmt_amount_grouped,
    _sanitize_adaptis_name,
    _signature_for_payment_request,
    _signature_for_refund,
    build_adaptis_signature,
    create_eghl_checkout,
    is_eghl_topup_payment_id,
    refund_eghl_payment,
    requery_eghl_payment,
    strip_amount_for_signature,
    verify_eghl_backend_post,
)


# ---------------------------------------------------------------------------
# Signatures
# ---------------------------------------------------------------------------


def test_build_adaptis_signature_is_hmac_sha512_lowercase_hex():
    sig = build_adaptis_signature("merchantkey123", "merchantkey123", "MM99900005", "REF-1", "100")
    assert len(sig) == 128
    assert sig == sig.lower()
    assert all(c in "0123456789abcdef" for c in sig)
    # Deterministic + key-sensitive
    assert sig == build_adaptis_signature("merchantkey123", "merchantkey123", "MM99900005", "REF-1", "100")
    assert sig != build_adaptis_signature("otherkey123", "merchantkey123", "MM99900005", "REF-1", "100")


def test_strip_amount_for_signature():
    assert strip_amount_for_signature("1.00") == "100"
    assert strip_amount_for_signature("1,278.99") == "127899"
    assert strip_amount_for_signature("127899") == "127899"


def test_payment_request_signature_matches_doc_construction():
    # RawSignature = MerchantKey + MerchantCode + RefNo + Amount(stripped)
    expected = build_adaptis_signature("MK123", "MK123", "MM99900005", "EG1", "100")
    assert _signature_for_payment_request("MK123", "MM99900005", "EG1", "1.00") == expected


def test_refund_signature_matches_doc_construction():
    # RawSignature = MerchantKey + MerchantCode + IpayId + RefNo +
    #                RefundAmount(stripped) + RefundCurrency
    expected = build_adaptis_signature("MK123", "MK123", "MM99900005", "TR123", "RF1", "100", "MYR")
    assert _signature_for_refund("MK123", "MM99900005", "TR123", "RF1", "1.00", "MYR") == expected


# ---------------------------------------------------------------------------
# Backend-post verification
# ---------------------------------------------------------------------------


def _backend_post(signature: str) -> dict:
    return {
        "MerchantCode": "MM99900005",
        "RefNo": "EG1",
        "Amount": "1.00",
        "Currency": "MYR",
        "TransID": "TR123",
        "TransactionStatusID": "1300",
        "Verification": {"SignatureType": "HMACSHA512", "Signature": signature},
    }


def test_verify_backend_post_accepts_valid_signature():
    sig = _signature_for_payment_request("MK123", "MM99900005", "EG1", "1.00")
    ok, reason = verify_eghl_backend_post(_backend_post(sig), "MK123", "MM99900005")
    assert ok, reason


def test_verify_backend_post_rejects_tampered_amount():
    sig = _signature_for_payment_request("MK123", "MM99900005", "EG1", "9.99")
    ok, _ = verify_eghl_backend_post(_backend_post(sig), "MK123", "MM99900005")
    assert not ok


def test_verify_backend_post_rejects_missing_signature():
    payload = _backend_post("")
    payload["Verification"] = {"SignatureType": "HMACSHA512", "Signature": ""}
    ok, reason = verify_eghl_backend_post(payload, "MK123", "MM99900005")
    assert not ok and reason == "missing signature"


def test_verify_backend_post_rejects_wrong_key():
    sig = _signature_for_payment_request("MK123", "MM99900005", "EG1", "1.00")
    ok, _ = verify_eghl_backend_post(_backend_post(sig), "WRONGKEY", "MM99900005")
    assert not ok


# ---------------------------------------------------------------------------
# Checkout enable-gating (same contract as before, new config keys)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_eghl_enabled_requires_flag_and_credentials():
    config = MagicMock()
    config.get_bool = AsyncMock(return_value=True)
    config.get_str = AsyncMock(side_effect=lambda k, default="": "MC" if k.endswith("merchant_code") else ("MK" if k.endswith("merchant_key") else default))
    db = AsyncMock()
    with patch("app.services.eghl._get_config", new=AsyncMock(return_value=config)):
        assert await _eghl_enabled(db) is True


@pytest.mark.asyncio
async def test_create_eghl_checkout_raises_when_disabled():
    db = AsyncMock()
    with patch("app.services.eghl._eghl_enabled", new=AsyncMock(return_value=False)):
        with pytest.raises(EGHLError) as exc:
            await create_eghl_checkout(db, None, None, amount=Decimal("10.00"), currency="MYR")
        assert exc.value.status_code == 503


# ---------------------------------------------------------------------------
# Requery + refund mapping
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_requery_maps_1300_to_success():
    payment = SimpleNamespace(provider_transaction_id="EG1", amount=Decimal("1.00"), id=1)
    resp = MagicMock()
    resp.status_code = 200
    resp.headers = {"content-type": "application/json"}
    resp.json.return_value = {"MerchantCode": "MM99900005", "RefNo": "EG1", "Amount": 1.00,
                              "TransactionStatusID": "1300", "TransID": "TR123"}
    db = AsyncMock()
    with patch("app.services.eghl._eghl_enabled", new=AsyncMock(return_value=True)), \
         patch("app.services.eghl._get_merchant_code", new=AsyncMock(return_value="MM99900005")), \
         patch("app.services.eghl._get_merchant_key", new=AsyncMock(return_value="MK123")), \
         patch("app.services.eghl._get_base_url", new=AsyncMock(return_value="https://gw.example")), \
         patch("app.services.eghl.httpx.AsyncClient.post", new=AsyncMock(return_value=resp)):
        result = await requery_eghl_payment(db, payment)
        assert result["status"] == "success"
        assert result["trans_id"] == "TR123"


@pytest.mark.asyncio
async def test_requery_maps_1400_to_failed():
    payment = SimpleNamespace(provider_transaction_id="EG1", amount=Decimal("1.00"), id=1)
    resp = MagicMock()
    resp.status_code = 200
    resp.headers = {"content-type": "application/json"}
    resp.json.return_value = {"TransactionStatusID": "1400"}
    db = AsyncMock()
    with patch("app.services.eghl._eghl_enabled", new=AsyncMock(return_value=True)), \
         patch("app.services.eghl._get_merchant_code", new=AsyncMock(return_value="MM99900005")), \
         patch("app.services.eghl._get_merchant_key", new=AsyncMock(return_value="MK123")), \
         patch("app.services.eghl._get_base_url", new=AsyncMock(return_value="https://gw.example")), \
         patch("app.services.eghl.httpx.AsyncClient.post", new=AsyncMock(return_value=resp)):
        result = await requery_eghl_payment(db, payment)
        assert result["status"] == "failed"


@pytest.mark.asyncio
async def test_refund_maps_3300_to_completed():
    payment = SimpleNamespace(provider_transaction_id="EG1", id=1, extra_metadata={"eghl_trans_id": "TR123"})
    resp = MagicMock()
    resp.status_code = 200
    resp.headers = {"content-type": "application/json"}
    resp.json.return_value = {"RefundId": "RR1", "RefundStatusId": "3300", "RefundStatusDesc": "Refunded"}
    db = AsyncMock()
    with patch("app.services.eghl._eghl_enabled", new=AsyncMock(return_value=True)), \
         patch("app.services.eghl._get_merchant_code", new=AsyncMock(return_value="MM99900005")), \
         patch("app.services.eghl._get_merchant_key", new=AsyncMock(return_value="MK123")), \
         patch("app.services.eghl._get_base_url", new=AsyncMock(return_value="https://gw.example")), \
         patch("app.services.eghl.httpx.AsyncClient.post", new=AsyncMock(return_value=resp)):
        result = await refund_eghl_payment(db, payment, refund_id=9, refund_amount=Decimal("1.00"), remark="Refund")
        assert result["status"] == "completed"
        assert result["refund_id"] == "RR1"


@pytest.mark.asyncio
async def test_refund_maps_3440_to_failed():
    payment = SimpleNamespace(provider_transaction_id="EG1", id=1, extra_metadata={"eghl_trans_id": "TR123"})
    resp = MagicMock()
    resp.status_code = 200
    resp.headers = {"content-type": "application/json"}
    resp.json.return_value = {"RefundStatusId": "3440", "RefundStatusDesc": "Gateway Failed to Refund",
                              "ErrorMessage": "FP rejected"}
    db = AsyncMock()
    with patch("app.services.eghl._eghl_enabled", new=AsyncMock(return_value=True)), \
         patch("app.services.eghl._get_merchant_code", new=AsyncMock(return_value="MM99900005")), \
         patch("app.services.eghl._get_merchant_key", new=AsyncMock(return_value="MK123")), \
         patch("app.services.eghl._get_base_url", new=AsyncMock(return_value="https://gw.example")), \
         patch("app.services.eghl.httpx.AsyncClient.post", new=AsyncMock(return_value=resp)):
        result = await refund_eghl_payment(db, payment, refund_id=9, refund_amount=Decimal("1.00"), remark="Refund")
        assert result["status"] == "failed"
        assert result["reason"] == "FP rejected"


@pytest.mark.asyncio
async def test_refund_requires_confirmed_gateway_trans_id():
    """Refunds must refuse until a gateway TransID is known (provider_transaction_id
    holds our local EG{id} RefNo, never the ADAPTIS TransID)."""
    payment = SimpleNamespace(provider_transaction_id="EG1", id=1, extra_metadata={})
    db = AsyncMock()
    with patch("app.services.eghl._eghl_enabled", new=AsyncMock(return_value=True)):
        with pytest.raises(EGHLError) as exc:
            await refund_eghl_payment(db, payment, refund_id=9, refund_amount=Decimal("1.00"), remark="Refund")
        assert exc.value.status_code == 400
        assert "TransID" in exc.value.message


def test_payment_id_catalog():
    assert PAYMENT_ID_MAP["card"] == 2
    assert PAYMENT_ID_MAP["fpx"] == 16
    assert PAYMENT_ID_MAP["tng"] == 538


def test_topup_payment_id_detection():
    assert is_eghl_topup_payment_id("EGT1") is True
    assert is_eghl_topup_payment_id("EG1") is False


# ---------------------------------------------------------------------------
# Amount formatting + name sanitization (spec conformance, round 2026-09-03)
# ---------------------------------------------------------------------------


def test_fmt_amount_plain_for_requery():
    # Merchant Requery spec: two decimals, NO thousand separators.
    assert _fmt_amount(Decimal("1278.99")) == "1278.99"
    assert _fmt_amount("19.8") == "19.80"


def test_fmt_amount_grouped_for_hosted_and_refund():
    # Hosted request + Refund spec: two decimals WITH thousand separators.
    assert _fmt_amount_grouped(Decimal("1278.99")) == "1,278.99"
    assert _fmt_amount_grouped("19.8") == "19.80"
    # Signature strips separators — both forms sign identically.
    assert strip_amount_for_signature(_fmt_amount(Decimal("1278.99"))) == strip_amount_for_signature(
        _fmt_amount_grouped(Decimal("1278.99"))
    )


def test_sanitize_adaptis_name_strips_prohibited_chars():
    # Spec prohibits digits, emojis and symbols other than - ' . @
    assert _sanitize_adaptis_name("Ahmad123") == "Ahmad"
    assert _sanitize_adaptis_name("O'Brien-Smith Jr.") == "O'Brien-Smith Jr."
    assert _sanitize_adaptis_name("+60123456001") == "-"
    assert _sanitize_adaptis_name("") == "-"
    assert _sanitize_adaptis_name("Tan #1 / Ah Ka") == "Tan Ah Ka"
