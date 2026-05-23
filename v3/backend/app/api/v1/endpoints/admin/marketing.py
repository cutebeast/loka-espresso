"""Admin marketing campaign endpoints."""

import asyncio
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

from fastapi import APIRouter, HTTPException, Query, status
from httpx import AsyncClient
from sqlalchemy import func, select

from app.api.v1.deps import CurrentAdmin, DBDependency
from app.models.customer import Customer
from app.models.loyalty import LoyaltyAccount, LoyaltyTier
from app.models.marketing import CampaignAnalytics, MarketingCampaign
from app.models.notification import NotificationMessage
from app.models.platform import PlatformConfig
from app.schemas.base import APIResponse, PaginatedResponse
from app.schemas.marketing import (
    MarketingCampaignCreate,
    MarketingCampaignOut,
    MarketingCampaignUpdate,
)
from app.services.translation import auto_translate_record, delete_translations

admin_router = APIRouter(prefix="/admin/marketing", tags=["admin — marketing"])


async def _get_twilio_creds(db) -> tuple[str, str, str, str]:
    """Get Twilio credentials from platform_config (set via Campaign Settings page).
    Returns (account_sid, auth_token, sms_from, whatsapp_from)."""
    keys = [
        "integration.twilio_account_sid",
        "integration.twilio_auth_token",
        "integration.twilio_from_number",
        "integration.twilio_whatsapp_from",
    ]
    result = await db.execute(
        select(PlatformConfig).where(PlatformConfig.config_key.in_(keys))
    )
    rows = {r.config_key: str(r.config_value or "") for r in result.scalars().all()}
    return (
        rows.get("integration.twilio_account_sid", ""),
        rows.get("integration.twilio_auth_token", ""),
        rows.get("integration.twilio_from_number", ""),
        rows.get("integration.twilio_whatsapp_from", ""),
    )


async def _send_email_via_resend(
    api_key: str, from_email: str, to_email: str,
    subject: str, body: str,
) -> bool:
    """Send an email via Resend API. Returns True on success."""
    if not api_key or not from_email or not to_email:
        return False
    url = "https://api.resend.com/emails"
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    payload = {
        "from": from_email,
        "to": [to_email],
        "subject": subject,
        "html": f"<p>{body.replace(chr(10), '<br>')}</p>" if body else f"<p>{subject}</p>",
    }
    try:
        async with AsyncClient(timeout=15) as client:
            resp = await client.post(url, json=payload, headers=headers)
            return resp.status_code in (200, 201)
    except Exception:
        return False
async def _send_sms_via_twilio(
    account_sid: str, auth_token: str, from_number: str,
    to_number: str, body: str,
) -> bool:
    """Send an SMS via Twilio REST API. Returns True on success."""
    if not account_sid or not auth_token or not from_number:
        return False
    url = f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json"
    data = {"From": from_number, "To": to_number, "Body": body}
    auth = (account_sid, auth_token)
    try:
        async with AsyncClient(timeout=15) as client:
            resp = await client.post(url, data=data, auth=auth)
            return resp.status_code == 201
    except Exception:
        return False


async def _resolve_audience_customers(db, segment: str) -> list[int]:
    """Get customer IDs matching an audience segment."""
    stmt = select(Customer.id).where(
        Customer.is_active.is_(True),
        Customer.deleted_at.is_(None),
    )
    now = datetime.now(timezone.utc)

    if segment == "new_users":
        stmt = stmt.where(Customer.created_at >= now - timedelta(days=30))
    elif segment == "loyal_customers":
        stmt = stmt.where(Customer.order_count >= 5)
    elif segment == "inactive_users":
        stmt = stmt.where(
            (Customer.last_order_at.is_(None))
            | (Customer.last_order_at < now - timedelta(days=60))
        )
    elif segment == "platinum_members":
        top_tier = await db.execute(
            select(LoyaltyTier.id).where(LoyaltyTier.is_active.is_(True))
            .order_by(LoyaltyTier.sort_order.desc()).limit(1)
        )
        top_tier_id = top_tier.scalar_one_or_none()
        if top_tier_id:
            stmt = stmt.join(
                LoyaltyAccount, LoyaltyAccount.customer_id == Customer.id
            ).where(LoyaltyAccount.current_tier_id == top_tier_id)

    result = await db.execute(stmt)
    return [row[0] for row in result.all()]


async def _get_campaign_or_404(db, campaign_id: int) -> MarketingCampaign:
    result = await db.execute(
        select(MarketingCampaign).where(MarketingCampaign.id == campaign_id)
    )
    campaign = result.scalar_one_or_none()
    if campaign is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")
    return campaign


@admin_router.get("/analytics", response_model=APIResponse[PaginatedResponse[dict]])
async def list_analytics(
    db: DBDependency,
    admin: CurrentAdmin,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
):
    """Get campaign analytics for all campaigns."""
    total_result = await db.execute(
        select(func.count(CampaignAnalytics.id))
        .join(MarketingCampaign, CampaignAnalytics.campaign_id == MarketingCampaign.id)
    )
    total = total_result.scalar() or 0
    result = await db.execute(
        select(CampaignAnalytics, MarketingCampaign.campaign_name)
        .join(MarketingCampaign, CampaignAnalytics.campaign_id == MarketingCampaign.id)
        .order_by(CampaignAnalytics.id.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    items = []
    for a, name in result.all():
        items.append({
            "campaign_id": a.campaign_id,
            "campaign_name": name,
            "audience_size": a.audience_size,
            "messages_sent": a.messages_sent,
            "messages_delivered": a.messages_delivered,
            "messages_failed": a.messages_failed,
            "opens_count": a.opens_count,
            "clicks_count": a.clicks_count,
            "conversions_count": a.conversions_count,
            "conversion_revenue": float(a.conversion_revenue or 0),
            "unsubscribes": a.unsubscribes,
        })
    return APIResponse(
        data=PaginatedResponse(
            items=items,
            total=total,
            page=page,
            per_page=per_page,
            total_pages=(total + per_page - 1) // per_page,
        )
    )


@admin_router.get("/campaigns", response_model=APIResponse[PaginatedResponse[MarketingCampaignOut]])
async def list_campaigns(
    db: DBDependency,
    admin: CurrentAdmin,
    status: str | None = Query(None),
    channel: str | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
    """List marketing campaigns with filters."""
    base_stmt = select(MarketingCampaign)
    count_stmt = select(func.count(MarketingCampaign.id))

    if status is not None:
        base_stmt = base_stmt.where(MarketingCampaign.status == status)
        count_stmt = count_stmt.where(MarketingCampaign.status == status)
    if channel is not None:
        base_stmt = base_stmt.where(MarketingCampaign.channel == channel)
        count_stmt = count_stmt.where(MarketingCampaign.channel == channel)

    total_result = await db.execute(count_stmt)
    total = total_result.scalar() or 0

    stmt = base_stmt.order_by(MarketingCampaign.id.desc()).offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(stmt)
    items = [MarketingCampaignOut.model_validate(c) for c in result.scalars().all()]

    return APIResponse(
        data=PaginatedResponse(
            items=items,
            total=total,
            page=page,
            per_page=per_page,
            total_pages=(total + per_page - 1) // per_page,
        )
    )


@admin_router.post("/campaigns", response_model=APIResponse[MarketingCampaignOut], status_code=status.HTTP_201_CREATED)
async def create_campaign(
    db: DBDependency,
    admin: CurrentAdmin,
    data: MarketingCampaignCreate,
):
    """Create a new marketing campaign."""
    campaign = MarketingCampaign(**data.model_dump(), created_by=admin.id)
    db.add(campaign)
    await db.commit()
    await auto_translate_record(db, "marketing_campaigns", campaign.id, {"campaign_name": campaign.campaign_name or "", "body_content": campaign.body_content or ""})
    await db.refresh(campaign)
    return APIResponse(data=MarketingCampaignOut.model_validate(campaign))


@admin_router.get("/campaigns/{campaign_id}", response_model=APIResponse[MarketingCampaignOut])
async def get_campaign(
    db: DBDependency,
    admin: CurrentAdmin,
    campaign_id: int,
):
    """Get campaign detail."""
    campaign = await _get_campaign_or_404(db, campaign_id)
    return APIResponse(data=MarketingCampaignOut.model_validate(campaign))


@admin_router.put("/campaigns/{campaign_id}", response_model=APIResponse[MarketingCampaignOut])
async def update_campaign(
    db: DBDependency,
    admin: CurrentAdmin,
    campaign_id: int,
    data: MarketingCampaignUpdate,
):
    """Update a marketing campaign."""
    campaign = await _get_campaign_or_404(db, campaign_id)

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(campaign, field, value)

    campaign.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await auto_translate_record(db, "marketing_campaigns", campaign.id, {"campaign_name": campaign.campaign_name or "", "body_content": campaign.body_content or ""})
    await db.refresh(campaign)
    return APIResponse(data=MarketingCampaignOut.model_validate(campaign))


@admin_router.patch("/campaigns/{campaign_id}/send", response_model=APIResponse[MarketingCampaignOut])
async def send_campaign(
    db: DBDependency,
    admin: CurrentAdmin,
    campaign_id: int,
):
    """Send campaign — delivers via push, SMS, or email based on channel."""
    campaign = await _get_campaign_or_404(db, campaign_id)

    campaign.status = "active"
    campaign.started_at = datetime.now(timezone.utc)
    campaign.updated_at = datetime.now(timezone.utc)

    delivered_count = 0

    # Resolve audience
    customer_ids = []
    if campaign.audience_segment:
        customer_ids = await _resolve_audience_customers(db, campaign.audience_segment)

    if campaign.channel == "push_notification" and customer_ids:
        type_map = {"promotional": "promotion", "informational": "system", "event": "promotion", "loyalty": "loyalty"}
        msg_type = type_map.get(campaign.campaign_type, "system")
        for cid in customer_ids:
            msg = NotificationMessage(
                customer_id=cid, message_type=msg_type, priority="normal",
                title=campaign.campaign_name, body=campaign.body_content,
            )
            db.add(msg)
            delivered_count += 1

    elif campaign.channel == "sms" and customer_ids:
        sid, token, sms_from, _ = await _get_twilio_creds(db)
        if sid and token and sms_from:
            phone_result = await db.execute(
                select(Customer.id, Customer.phone_number)
                .where(Customer.id.in_(customer_ids))
                .where(Customer.phone_number.isnot(None))
                .where(Customer.phone_number != "")
            )
            phone_map = {row[0]: row[1] for row in phone_result.all()}
            body = f"{campaign.campaign_name}\n\n{campaign.body_content or ''}"
            sem = asyncio.Semaphore(50)
            async def _send_sms(phone: str, cid: int) -> bool:
                async with sem:
                    return await _send_sms_via_twilio(sid, token, sms_from, phone, body)
            tasks = [_send_sms(phone, cid) for cid in customer_ids if (phone := phone_map.get(cid))]
            if tasks:
                results = await asyncio.gather(*tasks)
                delivered_count = sum(1 for r in results if r)

    elif campaign.channel == "whatsapp" and customer_ids:
        sid, token, _, wa_from = await _get_twilio_creds(db)
        if sid and token and wa_from:
            phone_result = await db.execute(
                select(Customer.id, Customer.phone_number)
                .where(Customer.id.in_(customer_ids))
                .where(Customer.phone_number.isnot(None))
                .where(Customer.phone_number != "")
            )
            phone_map = {row[0]: row[1] for row in phone_result.all()}
            body = f"{campaign.campaign_name}\n\n{campaign.body_content or ''}"
            sem = asyncio.Semaphore(50)
            async def _send_wa(phone: str, cid: int) -> bool:
                async with sem:
                    wa_to = f"whatsapp:{phone}" if not phone.startswith("whatsapp:") else phone
                    return await _send_sms_via_twilio(sid, token, wa_from, wa_to, body)
            tasks = [_send_wa(phone, cid) for cid in customer_ids if (phone := phone_map.get(cid))]
            if tasks:
                results = await asyncio.gather(*tasks)
                delivered_count = sum(1 for r in results if r)

    elif campaign.channel == "email" and customer_ids:
        # Get Resend credentials from config, fallback to env
        resend_result = await db.execute(
            select(PlatformConfig).where(PlatformConfig.config_key.in_([
                "integration.resend_api_key", "integration.resend_from_email"
            ]))
        )
        resend_rows = {r.config_key: str(r.config_value or "") for r in resend_result.scalars().all()}
        api_key = resend_rows.get("integration.resend_api_key", "")
        from_email = resend_rows.get("integration.resend_from_email", "")

        if api_key and from_email:
            email_result = await db.execute(
                select(Customer.id, Customer.email_address)
                .where(Customer.id.in_(customer_ids))
                .where(Customer.email_address.isnot(None))
                .where(Customer.email_address != "")
            )
            email_map = {row[0]: row[1] for row in email_result.all()}

            sem = asyncio.Semaphore(50)
            async def _send_email(addr: str, cid: int) -> bool:
                async with sem:
                    return await _send_email_via_resend(
                        api_key, from_email, addr,
                        campaign.campaign_name, campaign.body_content or "",
                    )
            tasks = [_send_email(addr, cid) for cid in customer_ids if (addr := email_map.get(cid))]
            if tasks:
                results = await asyncio.gather(*tasks)
                delivered_count = sum(1 for r in results if r)

    await db.commit()
    await db.refresh(campaign)

    # Update campaign analytics
    analytics_result = await db.execute(
        select(CampaignAnalytics).where(CampaignAnalytics.campaign_id == campaign.id)
    )
    analytics = analytics_result.scalar_one_or_none()
    if not analytics:
        analytics = CampaignAnalytics(campaign_id=campaign.id)
        db.add(analytics)
    analytics.audience_size = len(customer_ids) if customer_ids else 0
    analytics.messages_delivered = delivered_count
    analytics.messages_sent = delivered_count
    analytics.messages_failed = max(0, len(customer_ids) - delivered_count) if customer_ids else 0
    await db.commit()

    out = MarketingCampaignOut.model_validate(campaign)
    out.delivered_count = delivered_count
    return APIResponse(data=out)


@admin_router.delete("/campaigns/{campaign_id}", response_model=APIResponse[dict])
async def delete_campaign(
    db: DBDependency,
    admin: CurrentAdmin,
    campaign_id: int,
):
    """Delete a marketing campaign."""
    campaign = await _get_campaign_or_404(db, campaign_id)

    await db.delete(campaign)
    await db.commit()
    await delete_translations(db, "marketing_campaigns", campaign_id)
    return APIResponse(data={"id": campaign_id, "deleted": True})
