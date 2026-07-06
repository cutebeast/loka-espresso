"""Unit tests for payment schemas."""

import pytest
from pydantic import ValidationError

from app.schemas.payment import PaymentMethodBase


def test_payment_method_type_accepts_db_enum_values():
    """All DB-level payment method type values must be accepted by the schema."""
    valid_types = [
        "credit_card",
        "debit_card",
        "e_wallet",
        "bank_transfer",
        "cash",
        "crypto",
        "buy_now_pay_later",
        "qr_pay",
    ]
    for method_type in valid_types:
        pm = PaymentMethodBase(method_type=method_type, provider="cash")
        assert pm.method_type == method_type


def test_payment_method_type_rejects_invalid_values():
    invalid_types = ["online_banking", "card_terminal", "points", "voucher", "magic_pay"]
    for method_type in invalid_types:
        with pytest.raises(ValidationError):
            PaymentMethodBase(method_type=method_type, provider="cash")


def test_payment_method_provider_accepts_hitpay():
    pm = PaymentMethodBase(method_type="qr_pay", provider="hitpay")
    assert pm.provider == "hitpay"
