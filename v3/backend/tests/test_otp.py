"""Unit tests for Twilio Verify OTP service."""

import base64
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.otp import OTPConfigError, TwilioVerifyClient


class FakeConfig:
    def __init__(self, values):
        self._values = values

    async def get_bool(self, key, default=False):
        return self._values.get(key, default)

    async def get_str(self, key, default=""):
        return self._values.get(key, default)


@pytest.fixture
def configured_config():
    return FakeConfig({
        "integration.twilio_verify_use_test_credentials": False,
        "integration.twilio_verify_account_sid": "AC_live",
        "integration.twilio_verify_auth_token": "auth_token_live",
        "integration.twilio_verify_service_sid": "VA_service",
    })


@pytest.fixture
def unconfigured_config():
    return FakeConfig({
        "integration.twilio_verify_use_test_credentials": False,
        "integration.twilio_verify_account_sid": "",
        "integration.twilio_verify_auth_token": "",
        "integration.twilio_verify_service_sid": "",
    })


async def test_send_otp_success(configured_config):
    client = TwilioVerifyClient(configured_config)
    mock_response = MagicMock()
    mock_response.is_success = True
    mock_response.content = b'{"status": "pending"}'
    mock_response.json.return_value = {"status": "pending"}

    with patch("httpx.AsyncClient") as mock_client_cls:
        mock_client = MagicMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.request = AsyncMock(return_value=mock_response)
        mock_client_cls.return_value = mock_client

        result = await client.send_otp("+60123456789")

    assert result["status"] == "pending"
    mock_client.request.assert_awaited_once()
    call_args = mock_client.request.call_args
    assert call_args.kwargs["data"]["To"] == "+60123456789"
    assert call_args.kwargs["data"]["Channel"] == "sms"
    auth_header = call_args.kwargs["headers"]["Authorization"]
    expected = "Basic " + base64.b64encode(b"AC_live:auth_token_live").decode()
    assert auth_header == expected


async def test_verify_otp_approved(configured_config):
    client = TwilioVerifyClient(configured_config)
    mock_response = MagicMock()
    mock_response.is_success = True
    mock_response.content = b'{"status": "approved"}'
    mock_response.json.return_value = {"status": "approved"}

    with patch("httpx.AsyncClient") as mock_client_cls:
        mock_client = MagicMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.request = AsyncMock(return_value=mock_response)
        mock_client_cls.return_value = mock_client

        result = await client.verify_otp("+60123456789", "123456")

    assert result["status"] == "approved"
    call_args = mock_client.request.call_args
    assert call_args.kwargs["data"]["Code"] == "123456"


async def test_send_otp_raises_when_unconfigured(unconfigured_config):
    client = TwilioVerifyClient(unconfigured_config)
    assert await client.is_configured() is False
    with pytest.raises(OTPConfigError):
        await client.send_otp("+60123456789")


async def test_send_otp_uses_test_credentials():
    config = FakeConfig({
        "integration.twilio_verify_use_test_credentials": True,
        "integration.twilio_verify_test_account_sid": "AC_test",
        "integration.twilio_verify_test_auth_token": "auth_token_test",
        "integration.twilio_verify_service_sid": "VA_service",
    })
    client = TwilioVerifyClient(config)
    mock_response = MagicMock()
    mock_response.is_success = True
    mock_response.content = b'{"status": "pending"}'
    mock_response.json.return_value = {"status": "pending"}

    with patch("httpx.AsyncClient") as mock_client_cls:
        mock_client = MagicMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.request = AsyncMock(return_value=mock_response)
        mock_client_cls.return_value = mock_client

        await client.send_otp("+60123456789")

    auth_header = mock_client.request.call_args.kwargs["headers"]["Authorization"]
    expected = "Basic " + base64.b64encode(b"AC_test:auth_token_test").decode()
    assert auth_header == expected
