"""Public/customer lucky draw (spin wheel) endpoints."""

import random
from datetime import datetime, time, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.api.routes.deps import ActiveCustomer, DBDependency, security_scheme
from app.core.auth_cookies import get_customer_access_token
from app.core.security import decode_token
from app.models.customer import Customer
from app.models.lucky_draw import LuckyDrawCampaign, LuckyDrawSegment, LuckyDrawSpin
from app.schemas.base import APIResponse
from app.schemas.lucky_draw import (
    LuckyDrawActiveCampaignOut,
    LuckyDrawSegmentOut,
    LuckyDrawSpinResult,
)
from app.services.commerce import grant_voucher_to_customer

router = APIRouter(prefix="/lucky-draw", tags=["lucky draw"])


async def get_optional_customer(
    request: Request,
    db: DBDependency,
    credentials=Depends(security_scheme),
) -> Customer | None:
    """Return the authenticated customer or None (never raises).

    Used so the wheel config endpoint can be public while still showing
    per-customer spin availability when a session exists.
    """
    token = get_customer_access_token(request)
    if not token and credentials is not None:
        token = credentials.credentials
    if not token:
        return None
    try:
        payload = decode_token(token)
    except Exception:
        return None
    if payload.get("type") != "access":
        return None
    customer_id = int(payload.get("sub", 0))
    if not customer_id:
        return None
    result = await db.execute(select(Customer).where(Customer.id == customer_id))
    customer = result.scalar_one_or_none()
    if customer is None or customer.deleted_at is not None or not customer.is_active:
        return None
    return customer


OptionalCustomer = Annotated[Customer | None, Depends(get_optional_customer)]


def _campaign_window(now: datetime):
    return (
        LuckyDrawCampaign.is_active.is_(True),
        (LuckyDrawCampaign.start_date.is_(None)) | (LuckyDrawCampaign.start_date <= now),
        (LuckyDrawCampaign.end_date.is_(None)) | (LuckyDrawCampaign.end_date >= now),
    )


async def _get_current_campaign(db) -> LuckyDrawCampaign | None:
    """Return the currently live campaign (most recently created wins)."""
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(LuckyDrawCampaign)
        .where(*_campaign_window(now))
        .order_by(LuckyDrawCampaign.id.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def _spins_used_today(db, campaign_id: int, customer_id: int) -> int:
    """Count the customer's spins for the campaign since UTC midnight."""
    today_start = datetime.combine(
        datetime.now(timezone.utc).date(), time.min, tzinfo=timezone.utc
    )
    result = await db.execute(
        select(func.count(LuckyDrawSpin.id)).where(
            LuckyDrawSpin.campaign_id == campaign_id,
            LuckyDrawSpin.customer_id == customer_id,
            LuckyDrawSpin.created_at >= today_start,
        )
    )
    return result.scalar() or 0


def _next_spin_at() -> datetime:
    """Next UTC midnight — when the daily spin allowance resets."""
    tomorrow = datetime.now(timezone.utc).date() + timedelta(days=1)
    return datetime.combine(tomorrow, time.min, tzinfo=timezone.utc)


@router.get("/active", response_model=APIResponse[LuckyDrawActiveCampaignOut])
async def get_active_campaign(
    db: DBDependency,
    customer: OptionalCustomer,
):
    """Return the live campaign with its active segments (public, for wheel render).

    Includes spins_remaining when the caller is an authenticated customer.
    """
    campaign = await _get_current_campaign(db)
    if campaign is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active lucky draw campaign",
        )

    result = await db.execute(
        select(LuckyDrawSegment)
        .where(
            LuckyDrawSegment.campaign_id == campaign.id,
            LuckyDrawSegment.is_active.is_(True),
        )
        .order_by(LuckyDrawSegment.sort_order.asc(), LuckyDrawSegment.id.asc())
    )
    segments = result.scalars().all()

    spins_remaining = None
    tickets_available = None
    if customer is not None:
        if campaign.draw_type == "ticket_spend":
            from app.services.lucky_draw import tickets_available as _tickets_available
            tickets_available = await _tickets_available(db, campaign.id, customer.id)
        else:
            used = await _spins_used_today(db, campaign.id, customer.id)
            spins_remaining = max(campaign.spins_per_day - used, 0)

    data = LuckyDrawActiveCampaignOut(
        id=campaign.id,
        title=campaign.title,
        description=campaign.description,
        start_date=campaign.start_date,
        end_date=campaign.end_date,
        spins_per_day=campaign.spins_per_day,
        draw_type=campaign.draw_type,
        spend_per_ticket_cents=campaign.spend_per_ticket_cents,
        max_segments=campaign.max_segments,
        segments=[LuckyDrawSegmentOut.model_validate(s) for s in segments],
        spins_remaining=spins_remaining,
        tickets_available=tickets_available,
    )
    return APIResponse(data=data)


@router.post("/spin", response_model=APIResponse[LuckyDrawSpinResult])
async def spin_wheel(
    db: DBDependency,
    customer: ActiveCustomer,
):
    """Spin the wheel: enforce daily limit, weighted pick, issue voucher, record spin."""
    campaign = await _get_current_campaign(db)
    if campaign is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active lucky draw campaign",
        )

    result = await db.execute(
        select(LuckyDrawSegment)
        .options(selectinload(LuckyDrawSegment.voucher_definition))
        .where(
            LuckyDrawSegment.campaign_id == campaign.id,
            LuckyDrawSegment.is_active.is_(True),
        )
        .order_by(LuckyDrawSegment.sort_order.asc(), LuckyDrawSegment.id.asc())
    )
    segments = result.scalars().all()
    if not segments:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Campaign has no active segments",
        )

    # Gate by draw type: daily free spins vs spend-earned tickets.
    # The pre-check is a fast-path guard; the authoritative consumption
    # happens after the spin row exists (race-safe, rolls back on loss).
    if campaign.draw_type == "ticket_spend":
        from app.services.lucky_draw import tickets_available
        available_before = await tickets_available(db, campaign.id, customer.id)
        if available_before <= 0:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail={
                    "message": "No draw tickets — earn them by spending",
                    "tickets_remaining": 0,
                },
            )
    else:
        used = await _spins_used_today(db, campaign.id, customer.id)
        if used >= campaign.spins_per_day:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail={
                    "message": "Daily spin limit reached",
                    "spins_remaining": 0,
                    "next_spin_at": _next_spin_at().isoformat(),
                },
            )

    winner = random.SystemRandom().choices(
        segments, weights=[s.probability_weight for s in segments], k=1
    )[0]

    vd = winner.voucher_definition
    cv = await grant_voucher_to_customer(
        db,
        customer_id=customer.id,
        voucher_code=vd.voucher_code,
        source="lucky_draw",
        source_id=winner.id,
    )
    if cv is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Prize voucher is no longer available",
        )
    await db.flush()

    spin = LuckyDrawSpin(
        campaign_id=campaign.id,
        segment_id=winner.id,
        customer_id=customer.id,
        customer_voucher_id=cv.id,
    )
    db.add(spin)
    await db.flush()

    spins_remaining = 0
    tickets_remaining = None
    if campaign.draw_type == "ticket_spend":
        from app.services.lucky_draw import consume_oldest_ticket
        ticket_row = await consume_oldest_ticket(db, campaign.id, customer.id, spin)
        if ticket_row is None:
            # Lost the race with a concurrent spin — treat like the daily cap
            await db.rollback()
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail={"message": "No draw tickets — earn them by spending", "tickets_remaining": 0},
            )
        # autoflush=False in this app — re-querying here would see the
        # pre-consumption count, so derive from the pre-checked value instead
        tickets_remaining = max(available_before - 1, 0)
        await db.flush()
    else:
        spins_remaining = max(campaign.spins_per_day - used - 1, 0)

    await db.commit()

    return APIResponse(
        data=LuckyDrawSpinResult(
            segment=LuckyDrawSegmentOut.model_validate(winner),
            voucher_code=cv.voucher_code,
            voucher_title=vd.display_title,
            spins_remaining=spins_remaining,
            tickets_remaining=tickets_remaining,
        )
    )
