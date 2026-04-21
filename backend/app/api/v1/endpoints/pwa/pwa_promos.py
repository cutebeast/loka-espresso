"""PWA-facing endpoints for promo banner interactions.

- GET /promos/banners — list active banners for PWA (replaces old promos.py)
- POST /promos/banners/{id}/claim — claim voucher from "detail" type promo
- GET /promos/banners/{id}/status — check if user already interacted
"""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from pydantic import BaseModel
from typing import Optional, List

from app.core.database import get_db
from app.core.security import require_role, now_utc, ensure_utc
from app.models.user import User, RoleIDs
from app.models.promotions import PromoBanner
from app.models.voucher import Voucher, UserVoucher

router = APIRouter(prefix="/promos/banners", tags=["PWA Promos"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class PromoBannerPwaOut(BaseModel):
    """Banner data for PWA listing."""
    id: int
    title: str
    short_description: Optional[str] = None
    long_description: Optional[str] = None
    image_url: Optional[str] = None
    action_type: Optional[str] = "detail"
    terms: Optional[List[str]] = None
    how_to_redeem: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    survey_id: Optional[int] = None
    voucher_id: Optional[int] = None

    class Config:
        from_attributes = True


class ClaimResult(BaseModel):
    """Result of claiming a voucher."""
    success: bool
    message: str
    voucher_code: Optional[str] = None
    voucher_title: Optional[str] = None
    user_voucher_id: Optional[int] = None
    already_claimed: bool = False


class PromoStatusOut(BaseModel):
    """User's interaction status with a promo banner."""
    banner_id: int
    action_type: str
    # For "survey" type
    survey_completed: Optional[bool] = None
    # For both types — voucher state
    voucher_claimed: Optional[bool] = None
    voucher_used: Optional[bool] = None
    voucher_code: Optional[str] = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _grant_voucher(
    db: AsyncSession,
    user_id: int,
    voucher_id: int,
    source: str,
    source_id: int,
) -> UserVoucher:
    """Create a user_voucher row with full instance data. Caller must commit."""
    import secrets
    from datetime import timedelta

    # Fetch voucher to snapshot details
    v_result = await db.execute(select(Voucher).where(Voucher.id == voucher_id))
    voucher = v_result.scalar_one_or_none()

    now = now_utc()
    validity_days = voucher.validity_days if voucher and voucher.validity_days else 30

    # Generate unique per-instance code
    code = f"{voucher.code if voucher else 'VCH'}-{secrets.token_hex(4).upper()}"

    uv = UserVoucher(
        user_id=user_id,
        voucher_id=voucher_id,
        source=source,
        source_id=source_id,
        status="available",
        code=code,
        expires_at=now + timedelta(days=validity_days),
        discount_type=voucher.discount_type.value if voucher and hasattr(voucher.discount_type, 'value') else (str(voucher.discount_type) if voucher else None),
        discount_value=voucher.discount_value if voucher else None,
        min_spend=voucher.min_spend if voucher else None,
    )
    db.add(uv)
    await db.flush()
    return uv


async def _check_voucher_eligibility(
    db: AsyncSession,
    user_id: int,
    voucher_id: int,
) -> tuple[bool, str, Optional[UserVoucher]]:
    """
    Check if a user can be granted this voucher.
    Returns (eligible, reason, existing_unused_uv).
    """
    # Fetch the voucher
    v_result = await db.execute(select(Voucher).where(Voucher.id == voucher_id))
    voucher = v_result.scalar_one_or_none()
    if not voucher:
        return False, "Voucher not found", None
    if not voucher.is_active:
        return False, "Voucher is no longer active", None
    if voucher.deleted_at is not None:
        return False, "Voucher has been removed", None

    # Check global max_uses
    if voucher.max_uses is not None and voucher.used_count >= voucher.max_uses:
        return False, "Voucher has reached its usage limit", None

    # Check per-user limit
    user_count = await db.execute(
        select(func.count()).select_from(UserVoucher).where(
            UserVoucher.user_id == user_id,
            UserVoucher.voucher_id == voucher_id,
        )
    )
    total_claimed = user_count.scalar() or 0
    max_per_user = voucher.max_uses_per_user  # NULL = unlimited
    if max_per_user is not None and total_claimed >= max_per_user:
        # Check if any are unused — if so, tell user they already have it
        unused = await db.execute(
            select(UserVoucher).where(
                UserVoucher.user_id == user_id,
                UserVoucher.voucher_id == voucher_id,
                UserVoucher.status == "available",
            )
        )
        existing = unused.scalar_one_or_none()
        if existing:
            return False, "You already have this voucher in your wallet", existing
        else:
            return False, "You have already used this voucher", None

    return True, "", None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("", response_model=List[PromoBannerPwaOut])
async def list_active_banners(
    db: AsyncSession = Depends(get_db),
):
    """List all active promo banners for PWA (public, no auth required)."""
    now = now_utc()
    result = await db.execute(
        select(PromoBanner).where(
            PromoBanner.is_active == True,
        ).order_by(PromoBanner.position, PromoBanner.created_at.desc())
    )
    banners = result.scalars().all()
    # Filter by date in Python (handle null dates)
    out = []
    for b in banners:
        if b.start_date and ensure_utc(b.start_date) > now:
            continue
        if b.end_date and ensure_utc(b.end_date) < now:
            continue
        out.append(b)
    return out


@router.get("/{banner_id}", response_model=PromoBannerPwaOut)
async def get_banner_detail(banner_id: int, db: AsyncSession = Depends(get_db)):
    """Get single banner detail for PWA detail page."""
    result = await db.execute(select(PromoBanner).where(PromoBanner.id == banner_id))
    banner = result.scalar_one_or_none()
    if not banner or not banner.is_active:
        raise HTTPException(404, "Banner not found")
    return banner


@router.get("/{banner_id}/status", response_model=PromoStatusOut)
async def get_banner_status(
    banner_id: int,
    user: User = Depends(require_role(RoleIDs.CUSTOMER, RoleIDs.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    """Check the current user's interaction status with a promo banner.
    
    PWA uses this to decide what to show:
    - Not claimed → show CTA button
    - Claimed but unused → show "In your wallet" link
    - Claimed and used → show "✓ Used" disabled
    """
    result = await db.execute(select(PromoBanner).where(PromoBanner.id == banner_id))
    banner = result.scalar_one_or_none()
    if not banner:
        raise HTTPException(404, "Banner not found")

    status = PromoStatusOut(
        banner_id=banner_id,
        action_type=banner.action_type or "detail",
    )

    # Determine which voucher to check
    if banner.action_type == "survey" and banner.survey_id:
        # Check if user completed this survey
        from app.models.survey import SurveyResponse
        sr = await db.execute(
            select(SurveyResponse).where(
                SurveyResponse.survey_id == banner.survey_id,
                SurveyResponse.user_id == user.id,
            )
        )
        response = sr.scalar_one_or_none()
        status.survey_completed = response is not None

        # Get the voucher from the survey
        from app.models.survey import Survey
        sv = await db.execute(select(Survey).where(Survey.id == banner.survey_id))
        survey = sv.scalar_one_or_none()
        if survey and survey.reward_voucher_id:
            voucher_id = survey.reward_voucher_id
        else:
            return status  # No voucher linked to this survey
    else:
        # "detail" type — voucher comes from banner.voucher_id
        voucher_id = banner.voucher_id

    if not voucher_id:
        return status  # No voucher to track

    # Check user_vouchers for this voucher
    uv_result = await db.execute(
        select(UserVoucher).where(
            UserVoucher.user_id == user.id,
            UserVoucher.voucher_id == voucher_id,
        ).order_by(UserVoucher.applied_at.desc())
    )
    user_vouchers = uv_result.scalars().all()

    if user_vouchers:
        # Has at least one claim
        status.voucher_claimed = True
        # Check if any are unused
        unused = [uv for uv in user_vouchers if uv.order_id is None]
        if unused:
            status.voucher_used = False
            # Fetch voucher code
            v = await db.execute(select(Voucher).where(Voucher.id == voucher_id))
            voucher = v.scalar_one_or_none()
            status.voucher_code = voucher.code if voucher else None
        else:
            status.voucher_used = True
    else:
        status.voucher_claimed = False
        status.voucher_used = False

    return status


@router.post("/{banner_id}/claim", response_model=ClaimResult)
async def claim_promo_voucher(
    banner_id: int,
    user: User = Depends(require_role(RoleIDs.CUSTOMER, RoleIDs.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    """Claim voucher from a "detail" type promotion.
    
    Guards:
    - Banner must be active and within date range
    - action_type must be "detail" (survey type uses survey submit flow)
    - Banner must have voucher_id set
    - User must not exceed max_uses_per_user
    - Voucher global max_uses must not be exceeded
    """
    # Fetch banner
    result = await db.execute(select(PromoBanner).where(PromoBanner.id == banner_id))
    banner = result.scalar_one_or_none()
    if not banner or not banner.is_active:
        raise HTTPException(404, "Promotion not found")

    # Check date range
    now = now_utc()
    if banner.start_date and ensure_utc(banner.start_date) > now:
        raise HTTPException(400, "Promotion has not started yet")
    if banner.end_date and ensure_utc(banner.end_date) < now:
        raise HTTPException(400, "Promotion has ended")

    # Must be "detail" type
    if banner.action_type == "survey":
        raise HTTPException(400, "This promotion requires completing a survey. Use the survey submit endpoint.")

    # Must have voucher linked
    if not banner.voucher_id:
        raise HTTPException(400, "This promotion does not have a voucher linked")

    # Check eligibility
    eligible, reason, existing_uv = await _check_voucher_eligibility(
        db, user.id, banner.voucher_id
    )

    if not eligible:
        if existing_uv:
            # User already has an unused instance — return it gracefully
            v = await db.execute(select(Voucher).where(Voucher.id == banner.voucher_id))
            voucher = v.scalar_one_or_none()
            return ClaimResult(
                success=False,
                message=reason,
                voucher_code=existing_uv.code or (voucher.code if voucher else None),
                voucher_title=voucher.title if voucher else None,
                user_voucher_id=existing_uv.id,
                already_claimed=True,
            )
        return ClaimResult(success=False, message=reason, already_claimed=False)

    # Grant the voucher
    uv = await _grant_voucher(db, user.id, banner.voucher_id, source="promo_detail", source_id=banner_id)

    # Fetch voucher info for response
    v = await db.execute(select(Voucher).where(Voucher.id == banner.voucher_id))
    voucher = v.scalar_one_or_none()


    return ClaimResult(
        success=True,
        message="Voucher claimed successfully!",
        voucher_code=uv.code,
        voucher_title=voucher.title if voucher else None,
        user_voucher_id=uv.id,
    )
