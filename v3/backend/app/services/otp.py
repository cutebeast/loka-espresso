"""Twilio Verify OTP service for passwordless customer login."""

import base64
import logging
from typing import Any

import httpx

from app.services.platform_config import PlatformConfigService

logger = logging.getLogger("otp")

VERIFY_BASE_URL = "https://verify.twilio.com/v2"


class OTPConfigError(Exception):
    """Raised when Twilio Verify is not configured."""

    def __init__(self, message: str = "Twilio Verify is not configured"):
        self.message = message
        super().__init__(self.message)


class TwilioVerifyClient:
    """Client for Twilio Verify v2 API.

    Reads credentials from platform_config:
      - integration.twilio_verify_account_sid
      - integration.twilio_verify_auth_token
      - integration.twilio_verify_service_sid
      - integration.twilio_verify_use_test_credentials
      - integration.twilio_verify_test_account_sid
      - integration.twilio_verify_test_auth_token
    """

    def __init__(self, config_svc: PlatformConfigService):
        self.config = config_svc

    async def _get_credentials(self) -> tuple[str, str, str]:
        """Return (account_sid, auth_token, service_sid)."""
        use_test = await self.config.get_bool("integration.twilio_verify_use_test_credentials", default=False)

        if use_test:
            account_sid = await self.config.get_str("integration.twilio_verify_test_account_sid")
            auth_token = await self.config.get_str("integration.twilio_verify_test_auth_token")
        else:
            account_sid = await self.config.get_str("integration.twilio_verify_account_sid")
            auth_token = await self.config.get_str("integration.twilio_verify_auth_token")

        service_sid = await self.config.get_str("integration.twilio_verify_service_sid")

        if not account_sid or not auth_token or not service_sid:
            raise OTPConfigError("Twilio Verify credentials are incomplete")

        return account_sid, auth_token, service_sid

    def _basic_auth(self, username: str, password: str) -> str:
        creds = base64.b64encode(f"{username}:{password}".encode()).decode()
        return f"Basic {creds}"

    async def _request(
        self,
        method: str,
        path: str,
        data: dict[str, Any],
    ) -> dict[str, Any]:
        account_sid, auth_token, service_sid = await self._get_credentials()
        url = f"{VERIFY_BASE_URL}{path.format(service_sid=service_sid)}"
        headers = {
            "Authorization": self._basic_auth(account_sid, auth_token),
            "Content-Type": "application/x-www-form-urlencoded",
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.request(method, url, data=data, headers=headers)

        try:
            body = response.json() if response.content else {}
        except Exception:
            body = {}

        if not response.is_success:
            logger.error(
                "Twilio Verify request failed",
                status=response.status_code,
                path=path,
                error=body.get("message", "unknown"),
            )
            raise OTPConfigError(
                body.get("message") or f"Twilio Verify request failed ({response.status_code})"
            )

        return body

    async def send_otp(self, phone: str, channel: str = "sms") -> dict[str, Any]:
        """Start a verification for the given phone number."""
        path = "/Services/{service_sid}/Verifications"
        return await self._request(
            "POST",
            path,
            {"To": phone, "Channel": channel},
        )

    async def verify_otp(self, phone: str, code: str) -> dict[str, Any]:
        """Check a verification code for the given phone number."""
        path = "/Services/{service_sid}/VerificationCheck"
        return await self._request(
            "POST",
            path,
            {"To": phone, "Code": code},
        )

    async def is_configured(self) -> bool:
        """Return True if all required credentials are present."""
        try:
            await self._get_credentials()
            return True
        except OTPConfigError:
            return False
