from __future__ import annotations

import hashlib
import hmac
import time

from fastapi import HTTPException, Request


def _normalize_signature(signature: str) -> str:
    return signature.split("=", 1)[1] if "=" in signature else signature


async def verify_webhook_request(
    request: Request,
    *,
    api_key: str,
    signing_secret: str = "",
    max_age_seconds: int = 300,
) -> bytes:
    body = await request.body()

    if signing_secret:
        timestamp = request.headers.get("X-Webhook-Timestamp") or request.headers.get("X-Timestamp")
        signature = request.headers.get("X-Webhook-Signature") or request.headers.get("X-Signature")
        if not timestamp or not signature:
            raise HTTPException(status_code=401, detail="Missing webhook signature headers")
        try:
            ts_int = int(timestamp)
        except ValueError as exc:
            raise HTTPException(status_code=401, detail="Invalid webhook timestamp") from exc
        if abs(int(time.time()) - ts_int) > max_age_seconds:
            raise HTTPException(status_code=401, detail="Webhook timestamp expired")

        signed_payload = f"{timestamp}.".encode("utf-8") + body
        expected = hmac.new(signing_secret.encode("utf-8"), signed_payload, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(_normalize_signature(signature), expected):
            raise HTTPException(status_code=401, detail="Invalid webhook signature")
        return body

    if not api_key or request.headers.get("X-API-Key", "") != api_key:
        raise HTTPException(status_code=401, detail="Invalid API key")
    return body
