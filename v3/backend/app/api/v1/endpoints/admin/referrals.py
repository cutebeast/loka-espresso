"""Admin and public referral endpoints."""

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select

from app.api.v1.deps import ActiveCustomer, CurrentAdmin, DBDependency
from app.models.customer import Customer, ReferralEvent
from app.schemas.base import APIResponse, PaginatedResponse
from app.schemas.referral import ReferralEventCreate, ReferralEventOut

admin_router = APIRouter(prefix="/admin/referrals", tags=["admin — referrals"])
public_router = APIRouter(prefix="/referrals", tags=["referrals"])


async def _get_referral_or_404(db, referral_id: int) -> ReferralEvent:
    result = await db.execute(
        select(ReferralEvent).where(ReferralEvent.id == referral_id)
    )
    referral = result.scalar_one_or_none()
    if referral is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Referral event not found")
    return referral


# ---------------------------------------------------------------------------
# Admin endpoints
# ---------------------------------------------------------------------------

@admin_router.get("", response_model=APIResponse[PaginatedResponse[ReferralEventOut]])
async def list_referrals(
    db: DBDependency,
    admin: CurrentAdmin,
    referrer_id: int | None = Query(None),
    status: str | None = Query(None),
    date_from: datetime | None = Query(None),
    date_to: datetime | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
    """List referral events with filters."""
    base_stmt = select(ReferralEvent)
    count_stmt = select(func.count(ReferralEvent.id))

    if referrer_id is not None:
        base_stmt = base_stmt.where(ReferralEvent.referrer_customer_id == referrer_id)
        count_stmt = count_stmt.where(ReferralEvent.referrer_customer_id == referrer_id)
    if status is not None:
        base_stmt = base_stmt.where(ReferralEvent.status == status)
        count_stmt = count_stmt.where(ReferralEvent.status == status)
    if date_from is not None:
        base_stmt = base_stmt.where(ReferralEvent.created_at >= date_from)
        count_stmt = count_stmt.where(ReferralEvent.created_at >= date_from)
    if date_to is not None:
        base_stmt = base_stmt.where(ReferralEvent.created_at <= date_to)
        count_stmt = count_stmt.where(ReferralEvent.created_at <= date_to)

    total_result = await db.execute(count_stmt)
    total = total_result.scalar() or 0

    stmt = base_stmt.order_by(ReferralEvent.id.desc()).offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(stmt)
    entries = result.scalars().all()
    
    from app.models.customer import Customer
    customer_ids = {e.referrer_customer_id for e in entries} | {e.invitee_customer_id for e in entries}
    cust_result = await db.execute(
        select(Customer.id, Customer.display_name).where(Customer.id.in_(customer_ids))
    )
    customer_names = {row[0]: row[1] for row in cust_result.all()}
    
    items = []
    for r in entries:
        d = {c: getattr(r, c) for c in r.__table__.columns.keys()}
        d["referrer_name"] = customer_names.get(r.referrer_customer_id)
        d["invitee_name"] = customer_names.get(r.invitee_customer_id)
        items.append(ReferralEventOut.model_validate(d))

    return APIResponse(
        data=PaginatedResponse(
            items=items,
            total=total,
            page=page,
            per_page=per_page,
            total_pages=(total + per_page - 1) // per_page,
        )
    )


@admin_router.get("/{referral_id}", response_model=APIResponse[ReferralEventOut])
async def get_referral(
    db: DBDependency,
    admin: CurrentAdmin,
    referral_id: int,
):
    """Get referral event detail."""
    referral = await _get_referral_or_404(db, referral_id)
    return APIResponse(data=ReferralEventOut.model_validate(referral))


@admin_router.patch("/{referral_id}/fulfill", response_model=APIResponse[ReferralEventOut])
async def fulfill_referral(
    db: DBDependency,
    admin: CurrentAdmin,
    referral_id: int,
):
    """Mark referral event as fulfilled / rewarded — credits referrer loyalty points."""
    referral = await _get_referral_or_404(db, referral_id)

    from app.services.commerce import credit_referral_points
    await credit_referral_points(db, referral.referrer_customer_id, referral.invitee_customer_id)

    referral.status = "rewarded"
    referral.reward_issued_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(referral)
    return APIResponse(data=ReferralEventOut.model_validate(referral))


# ---------------------------------------------------------------------------
# Public endpoints
# ---------------------------------------------------------------------------

@public_router.post("", response_model=APIResponse[ReferralEventOut], status_code=status.HTTP_201_CREATED)
async def create_referral(
    db: DBDependency,
    customer: ActiveCustomer,
    data: ReferralEventCreate,
):
    """Create a referral event (customer auth)."""
    # Ensure the referrer is the current customer
    if data.referrer_customer_id != customer.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot create referral for another customer",
        )

    # Verify invitee exists
    result = await db.execute(select(Customer).where(Customer.id == data.invitee_customer_id))
    invitee = result.scalar_one_or_none()
    if invitee is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invitee customer not found")

    referral = ReferralEvent(**data.model_dump())
    db.add(referral)
    await db.commit()
    await db.refresh(referral)
    return APIResponse(data=ReferralEventOut.model_validate(referral))


@public_router.get("/me", response_model=APIResponse[PaginatedResponse[ReferralEventOut]])
async def list_my_referrals(
    db: DBDependency,
    customer: ActiveCustomer,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
    """Get current customer's referrals."""
    count_stmt = select(func.count(ReferralEvent.id)).where(
        ReferralEvent.referrer_customer_id == customer.id
    )
    total_result = await db.execute(count_stmt)
    total = total_result.scalar() or 0

    stmt = (
        select(ReferralEvent)
        .where(ReferralEvent.referrer_customer_id == customer.id)
        .order_by(ReferralEvent.id.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    result = await db.execute(stmt)
    items = [ReferralEventOut.model_validate(r) for r in result.scalars().all()]

    return APIResponse(
        data=PaginatedResponse(
            items=items,
            total=total,
            page=page,
            per_page=per_page,
            total_pages=(total + per_page - 1) // per_page,
        )
    )
