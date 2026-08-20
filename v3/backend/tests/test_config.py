"""Unit tests for infrastructure settings."""

import os

import pytest

from app.core.config import Settings


def test_stripe_simulator_url_defaults():
    # None = built-in local simulator page (services/payment.py builds it with
    # the session's real return URLs). The old checkout.stripe.com/test-session
    # placeholder was a dead URL that broke dev top-ups.
    s = Settings()
    assert s.stripe_simulator_checkout_url is None


def test_stripe_simulator_url_is_configurable():
    custom = "https://pay.example.com/session/{session_id}"
    os.environ["STRIPE_SIMULATOR_CHECKOUT_URL"] = custom
    try:
        s = Settings()
        assert s.stripe_simulator_checkout_url == custom
    finally:
        del os.environ["STRIPE_SIMULATOR_CHECKOUT_URL"]


def test_empty_trusted_hosts_raises_in_production():
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        Settings(environment="production", trusted_hosts="")
