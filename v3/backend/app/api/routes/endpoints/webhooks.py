"""Public webhook endpoints for third-party providers.

Currently handles Resend email delivery-status webhooks (sent via Svix).
"""

import binascii
import logging

from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import select
from svix.webhooks import Webhook, WebhookVerificationError

from app.api.routes.deps import DBDependency
from app.core.rate_limiter import limiter
from app.models.marketing import CampaignAnalytics
from app.services.webhook import (
    get_provider_secret,
    is_event_processed,
    mark_event_processed,
)

logger = logging.getLogger(__name__)

router = APIRouter()

# Resend events that we care about for campaign analytics.
_RESEND_DELIVERED_EVENTS = {"email.delivered"}
_RESEND_FAILED_EVENTS = {"email.bounced", "email.failed", "email.delivery_delayed"}
_RESEND_OPEN_EVENTS = {"email.opened"}
_RESEND_CLICK_EVENTS = {"email.clicked"}


def _map_svix_headers(headers: dict) -> dict:
    """Map Resend/Svix header names to the generic names expected by standardwebhooks.

    Resend signs webhooks with Svix and sends ``svix-id``, ``svix-timestamp`` and
    ``svix-signature``. The ``svix`` Python SDK wraps ``standardwebhooks``, which
    looks for the generic ``webhook-*`` prefixes, so we normalise them here.
    """
    return {
        "webhook-id": headers.get("svix-id") or headers.get("Svix-Id"),
        "webhook-timestamp": headers.get("svix-timestamp") or headers.get("Svix-Timestamp"),
        "webhook-signature": headers.get("svix-signature") or headers.get("Svix-Signature"),
    }


def _extract_resend_event_id(payload: dict) -> str | None:
    """Build a stable idempotency key from a Resend webhook payload.

    Resend payloads do not have a top-level event id, so we combine the event
    type, email id and event created_at timestamp.
    """
    data = payload.get("data") or {}
    parts = [
        payload.get("type"),
        data.get("email_id"),
        payload.get("created_at"),
    ]
    if not all(parts):
        return None
    return "::".join(str(p) for p in parts)


async def _increment_analytics(db, campaign_id: int, payload: dict) -> dict:
    """Update CampaignAnalytics for the given campaign based on the Resend event.

    Returns a dict describing what (if anything) was updated.
    """
    event_type = payload.get("type")
    if not event_type:
        return {"updated": False, "reason": "missing event type"}

    # Resolve the analytics row, creating one if it doesn't exist.
    result = await db.execute(
        select(CampaignAnalytics).where(CampaignAnalytics.campaign_id == campaign_id)
    )
    analytics = result.scalar_one_or_none()
    if analytics is None:
        analytics = CampaignAnalytics(campaign_id=campaign_id)
        db.add(analytics)
        # SQLAlchemy server defaults are not populated on the instance until the
        # row is flushed/inserted, so seed the counters we are about to touch.
        analytics.messages_delivered = 0
        analytics.messages_failed = 0
        analytics.opens_count = 0
        analytics.clicks_count = 0
        # Flush so we can read/update the row within the same transaction.
        await db.flush()

    if event_type in _RESEND_DELIVERED_EVENTS:
        analytics.messages_delivered = (analytics.messages_delivered or 0) + 1
    elif event_type in _RESEND_FAILED_EVENTS:
        analytics.messages_failed = (analytics.messages_failed or 0) + 1
    elif event_type in _RESEND_OPEN_EVENTS:
        analytics.opens_count = (analytics.opens_count or 0) + 1
    elif event_type in _RESEND_CLICK_EVENTS:
        analytics.clicks_count = (analytics.clicks_count or 0) + 1
    else:
        return {"updated": False, "reason": "untracked event type"}

    await db.commit()
    return {"updated": True, "campaign_id": campaign_id, "event_type": event_type}


@router.post("/resend", response_model=dict)
@limiter.limit("200/minute")
async def resend_webhook(request: Request, db: DBDependency):
    """Receive Resend email delivery-status webhooks.

    Verifies the Svix signature, deduplicates events, and updates the
    corresponding ``CampaignAnalytics`` row using the ``campaign_id`` tag that
    was attached when the campaign email was sent.
    """
    body = await request.body()
    if not body:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty body")

    secret = await get_provider_secret(
        db,
        provider="resend",
        env_attr="resend_webhook_secret",
        platform_config_key="integration.resend_webhook_secret",
    )
    secrets = [s.strip() for s in (secret or "").split(",") if s.strip()]
    if not secrets:
        logger.warning("Resend webhook received but no signing secret is configured")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Webhook secret not configured",
        )

    headers = _map_svix_headers(dict(request.headers))
    payload = None
    last_error = None
    for wh_secret in secrets:
        try:
            payload = Webhook(wh_secret).verify(body, headers)
            break
        except WebhookVerificationError as exc:
            last_error = exc
            continue
        except (binascii.Error, ValueError) as exc:
            logger.warning("Resend webhook secret is not valid base64: %s", exc)
            last_error = exc
            continue

    if payload is None:
        logger.warning("Resend webhook signature verification failed: %s", last_error)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid Resend signature",
        ) from last_error

    event_id = _extract_resend_event_id(payload)
    if event_id and await is_event_processed("resend", event_id):
        logger.info("Resend webhook duplicate event ignored: %s", event_id)
        return {"received": True, "duplicate": True}

    data = payload.get("data") or {}
    tags = data.get("tags") or {}
    campaign_id_str = tags.get("campaign_id")
    if not campaign_id_str:
        logger.info("Resend webhook ignored: no campaign_id tag (event=%s)", payload.get("type"))
        return {"received": True, "campaign_id": None}

    try:
        campaign_id = int(campaign_id_str)
    except (TypeError, ValueError) as exc:
        logger.warning("Resend webhook ignored: invalid campaign_id tag %r", campaign_id_str)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid campaign_id tag",
        ) from exc

    result = await _increment_analytics(db, campaign_id, payload)

    if event_id:
        await mark_event_processed("resend", event_id)

    logger.info(
        "Resend webhook processed: event=%s campaign_id=%s result=%s",
        payload.get("type"),
        campaign_id,
        result,
    )
    return {"received": True, **result}
