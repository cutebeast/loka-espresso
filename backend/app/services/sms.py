"""Twilio SMS service for OTP delivery."""
import logging
from twilio.rest import Client
from twilio.base.exceptions import TwilioRestException

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class SMSService:
    """Thin wrapper around Twilio for sending OTP messages."""

    def __init__(self) -> None:
        self._client: Client | None = None
        self._from: str = ""
        self._ready = False

        sid = settings.TWILIO_ACCOUNT_SID
        token = settings.TWILIO_AUTH_TOKEN
        self._from = settings.TWILIO_PHONE_NUMBER

        if sid and token and self._from:
            try:
                self._client = Client(sid, token)
                self._ready = True
                logger.info("Twilio SMS service initialized")
            except Exception as exc:
                logger.warning(f"Twilio init failed: {exc}")
        else:
            logger.warning(
                "Twilio not configured (missing TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN or TWILIO_PHONE_NUMBER). "
                "OTP codes will be logged but NOT sent via SMS."
            )

    @property
    def is_ready(self) -> bool:
        return self._ready

    def send_otp(self, to: str, code: str) -> dict:
        """Send OTP via Twilio SMS.

        Returns:
            {"sent": bool, "sid": str|None, "error": str|None}
        """
        if not self._ready or not self._client:
            logger.debug(f"[SMS stub] OTP for {to[:4]}**** — code hidden")
            return {"sent": False, "sid": None, "error": "Twilio not configured"}

        body = f"Your Loka Espresso verification code is: {code}. It expires in 5 minutes."

        try:
            message = self._client.messages.create(
                body=body,
                from_=self._from,
                to=to,
            )
            logger.info(f"SMS sent to {to[:4]}**** — Twilio SID: {message.sid}")
            return {"sent": True, "sid": message.sid, "error": None}
        except TwilioRestException as exc:
            logger.error(f"Twilio error sending to {to[:4]}****: {exc.msg}")
            return {"sent": False, "sid": None, "error": exc.msg}
        except Exception as exc:
            logger.error(f"Unexpected SMS error: {exc}")
            return {"sent": False, "sid": None, "error": str(exc)}


# Module-level singleton — imported once per process
_sms_service = SMSService()


def get_sms_service() -> SMSService:
    return _sms_service
