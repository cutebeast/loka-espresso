"""Twilio Verify OTP service for passwordless customer login."""

import base64
import logging
from typing import Any

import httpx

from app.core.cache import get_redis_client
from app.services.platform_config import PlatformConfigService

logger = logging.getLogger("otp")

VERIFY_BASE_URL = "https://verify.twilio.com/v2"

OTP_SEND_PREFIX = "otp:send"
OTP_COUNT_PREFIX = "otp:count"


class OTPConfigError(Exception):
    """Raised when Twilio Verify is not configured."""

    def __init__(self, message: str = "Twilio Verify is not configured"):
        self.message = message
        super().__init__(self.message)


def _redis_key(prefix: str, phone: str) -> str:
    return f"{prefix}:{phone}"


async def check_otp_rate_limit(config_svc: PlatformConfigService, phone: str) -> tuple[bool, str]:
    """Return (ok, error_message). Enforces otp.max_send_per_hour."""
    redis = get_redis_client()
    if redis is None:
        logger.warning("Redis unavailable; cannot enforce OTP rate limit for %s", phone)
        return False, "OTP service is temporarily unavailable. Please try again later."

    max_sends = await config_svc.get_otp_max_send_per_hour()
    count_key = _redis_key(OTP_COUNT_PREFIX, phone)
    current = await redis.get(count_key)
    if current and int(current) >= max_sends:
        return False, f"OTP send limit reached. Please try again later."
    return True, ""


async def record_otp_send(config_svc: PlatformConfigService, phone: str) -> None:
    """Record an OTP send in Redis for expiry and hourly rate counting."""
    redis = get_redis_client()
    if redis is None:
        return

    expiry_minutes = await config_svc.get_otp_expiry_minutes()
    send_key = _redis_key(OTP_SEND_PREFIX, phone)
    count_key = _redis_key(OTP_COUNT_PREFIX, phone)

    pipe = redis.pipeline()
    pipe.setex(send_key, expiry_minutes * 60, "1")
    pipe.incr(count_key)
    pipe.expire(count_key, 3600)
    await pipe.execute()


async def is_otp_send_active(config_svc: PlatformConfigService, phone: str) -> bool:
    """Return True if a recent OTP send is still within otp.expiry_minutes."""
    redis = get_redis_client()
    if redis is None:
        # Without Redis we cannot confirm expiry; fail closed.
        return False
    send_key = _redis_key(OTP_SEND_PREFIX, phone)
    return await redis.exists(send_key) > 0


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
