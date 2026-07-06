"""Unit tests for infrastructure settings."""

import os

import pytest

from app.core.config import Settings


def test_stripe_simulator_url_defaults():
    s = Settings()
    assert s.stripe_simulator_checkout_url is not None
    assert "{session_id}" in s.stripe_simulator_checkout_url


def test_grabpay_simulator_url_defaults():
    s = Settings()
    assert s.grabpay_simulator_session_url is not None
    assert "{session_id}" in s.grabpay_simulator_session_url
    assert "{return_url}" in s.grabpay_simulator_session_url


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
