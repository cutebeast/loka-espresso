"""Admin and public loyalty endpoints."""

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, select

from app.api.v1.deps import ActiveCustomer, CurrentAdmin, DBDependency
from app.models.loyalty import LoyaltyAccount, LoyaltyPointsLedger, LoyaltyTier
from app.schemas.base import APIResponse, PaginatedResponse
from app.schemas.loyalty import (
    LoyaltyAccountOut,
    LoyaltyPointsLedgerOut,
    LoyaltyTierBase,
    LoyaltyTierOut,
)

loyalty_router = APIRouter()
public_loyalty_router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _serialize_account(account: LoyaltyAccount) -> LoyaltyAccountOut:
    tier = account.current_tier
    return LoyaltyAccountOut(
        id=account.id,
        customer_id=account.customer_id,
        tier_id=account.current_tier_id or 0,
        tier_name=tier.display_name if tier else "None",
        current_points=account.points_balance,
        lifetime_points=account.lifetime_points_earned,
        points_to_next_tier=None,
        tier_multiplier=float(tier.points_multiplier) if tier else 1.0,
        last_activity_at=None,
        last_tier_change_at=account.last_tier_change_at,
        created_at=account.created_at,
        updated_at=account.updated_at,
    )


# ---------------------------------------------------------------------------
# Admin — Tiers
# ---------------------------------------------------------------------------

@loyalty_router.get("/tiers", response_model=APIResponse[list[LoyaltyTierOut]])
async def list_loyalty_tiers(
    db: DBDependency,
    admin: CurrentAdmin,
):
    """List all loyalty tiers."""
    result = await db.execute(select(LoyaltyTier).order_by(LoyaltyTier.sort_order))
    tiers = result.scalars().all()
    return APIResponse(data=[LoyaltyTierOut.model_validate(t) for t in tiers])


@loyalty_router.post(
    "/tiers",
    response_model=APIResponse[LoyaltyTierOut],
    status_code=status.HTTP_201_CREATED,
)
async def create_loyalty_tier(
    db: DBDependency,
    admin: CurrentAdmin,
    data: LoyaltyTierBase,
):
    """Create a new loyalty tier."""
    tier = LoyaltyTier(**data.model_dump())
    db.add(tier)
    await db.commit()
    await db.refresh(tier)
    return APIResponse(data=LoyaltyTierOut.model_validate(tier))


@loyalty_router.put("/tiers/{id}", response_model=APIResponse[LoyaltyTierOut])
async def update_loyalty_tier(
    db: DBDependency,
    admin: CurrentAdmin,
    id: int,
    data: LoyaltyTierBase,
):
    """Update a loyalty tier."""
    result = await db.execute(select(LoyaltyTier).where(LoyaltyTier.id == id))
    tier = result.scalar_one_or_none()
    if tier is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Tier not found"
        )
    for field, value in data.model_dump().items():
        setattr(tier, field, value)
    await db.commit()
    await db.refresh(tier)
    return APIResponse(data=LoyaltyTierOut.model_validate(tier))


@loyalty_router.delete("/tiers/{id}", response_model=APIResponse[dict])
async def delete_loyalty_tier(
    db: DBDependency,
    admin: CurrentAdmin,
    id: int,
):
    """Delete a loyalty tier."""
    result = await db.execute(select(LoyaltyTier).where(LoyaltyTier.id == id))
    tier = result.scalar_one_or_none()
    if tier is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Tier not found"
        )
    await db.delete(tier)
    await db.commit()
    return APIResponse(data={"id": tier.id, "deleted": True})


# ---------------------------------------------------------------------------
# Admin — Accounts
# ---------------------------------------------------------------------------

@loyalty_router.get(
    "/accounts",
    response_model=APIResponse[PaginatedResponse[LoyaltyAccountOut]],
)
async def list_loyalty_accounts(
    db: DBDependency,
    admin: CurrentAdmin,
    customer_id: int | None = Query(None),
    tier_id: int | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
    """List loyalty accounts with optional filters."""
    base_stmt = select(LoyaltyAccount)
    count_stmt = select(func.count(LoyaltyAccount.id))

    if customer_id is not None:
        base_stmt = base_stmt.where(LoyaltyAccount.customer_id == customer_id)
        count_stmt = count_stmt.where(LoyaltyAccount.customer_id == customer_id)
    if tier_id is not None:
        base_stmt = base_stmt.where(LoyaltyAccount.current_tier_id == tier_id)
        count_stmt = count_stmt.where(LoyaltyAccount.current_tier_id == tier_id)

    total_result = await db.execute(count_stmt)
    total = total_result.scalar() or 0

    stmt = (
        base_stmt.order_by(LoyaltyAccount.id.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    result = await db.execute(stmt)
    items = [_serialize_account(a) for a in result.scalars().all()]

    return APIResponse(
        data=PaginatedResponse(
            items=items,
            total=total,
            page=page,
            per_page=per_page,
            total_pages=(total + per_page - 1) // per_page,
        )
    )


@loyalty_router.get("/accounts/{id}", response_model=APIResponse[LoyaltyAccountOut])
async def get_loyalty_account(
    db: DBDependency,
    admin: CurrentAdmin,
    id: int,
):
    """Get a loyalty account by ID."""
    result = await db.execute(select(LoyaltyAccount).where(LoyaltyAccount.id == id))
    account = result.scalar_one_or_none()
    if account is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Account not found"
        )
    return APIResponse(data=_serialize_account(account))


# ---------------------------------------------------------------------------
# Admin — Ledger
# ---------------------------------------------------------------------------

@loyalty_router.get(
    "/ledger",
    response_model=APIResponse[PaginatedResponse[LoyaltyPointsLedgerOut]],
)
async def list_ledger_entries(
    db: DBDependency,
    admin: CurrentAdmin,
    account_id: int | None = Query(None),
    customer_id: int | None = Query(None),
    event_type: str | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
    """List loyalty ledger entries with optional filters."""
    base_stmt = select(LoyaltyPointsLedger)
    count_stmt = select(func.count(LoyaltyPointsLedger.id))

    if account_id is not None:
        base_stmt = base_stmt.where(LoyaltyPointsLedger.loyalty_account_id == account_id)
        count_stmt = count_stmt.where(
            LoyaltyPointsLedger.loyalty_account_id == account_id
        )
    if customer_id is not None:
        base_stmt = base_stmt.where(LoyaltyPointsLedger.customer_id == customer_id)
        count_stmt = count_stmt.where(LoyaltyPointsLedger.customer_id == customer_id)
    if event_type is not None:
        base_stmt = base_stmt.where(LoyaltyPointsLedger.event_type == event_type)
        count_stmt = count_stmt.where(LoyaltyPointsLedger.event_type == event_type)

    total_result = await db.execute(count_stmt)
    total = total_result.scalar() or 0

    stmt = (
        base_stmt.order_by(LoyaltyPointsLedger.id.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    result = await db.execute(stmt)
    items = [LoyaltyPointsLedgerOut.model_validate(r) for r in result.scalars().all()]

    return APIResponse(
        data=PaginatedResponse(
            items=items,
            total=total,
            page=page,
            per_page=per_page,
            total_pages=(total + per_page - 1) // per_page,
        )
    )


class _LedgerCreate(BaseModel):
    loyalty_account_id: int
    points_delta: int
    description: str | None = None


@loyalty_router.post(
    "/ledger",
    response_model=APIResponse[LoyaltyPointsLedgerOut],
    status_code=status.HTTP_201_CREATED,
)
async def create_ledger_entry(
    db: DBDependency,
    admin: CurrentAdmin,
    data: _LedgerCreate,
):
    """Manually adjust loyalty points for an account."""
    result = await db.execute(
        select(LoyaltyAccount).where(LoyaltyAccount.id == data.loyalty_account_id)
    )
    account = result.scalar_one_or_none()
    if account is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Account not found"
        )

    new_balance = account.points_balance + data.points_delta
    if new_balance < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Insufficient points"
        )

    entry = LoyaltyPointsLedger(
        loyalty_account_id=account.id,
        customer_id=account.customer_id,
        event_type="adjust_manual",
        points_delta=data.points_delta,
        running_balance=new_balance,
        description=data.description,
    )
    db.add(entry)

    account.points_balance = new_balance
    if data.points_delta > 0:
        account.lifetime_points_earned += data.points_delta
    else:
        account.lifetime_points_redeemed += abs(data.points_delta)

    await db.commit()
    await db.refresh(entry)
    return APIResponse(data=LoyaltyPointsLedgerOut.model_validate(entry))


# ---------------------------------------------------------------------------
# Public (customer) endpoints
# ---------------------------------------------------------------------------

@public_loyalty_router.get("/me", response_model=APIResponse[LoyaltyAccountOut])
async def get_my_loyalty_account(
    db: DBDependency,
    customer: ActiveCustomer,
):
    """Get current customer's loyalty account."""
    result = await db.execute(
        select(LoyaltyAccount).where(LoyaltyAccount.customer_id == customer.id)
    )
    account = result.scalar_one_or_none()
    if account is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Loyalty account not found"
        )
    return APIResponse(data=_serialize_account(account))


@public_loyalty_router.get(
    "/ledger/me",
    response_model=APIResponse[PaginatedResponse[LoyaltyPointsLedgerOut]],
)
async def get_my_ledger_entries(
    db: DBDependency,
    customer: ActiveCustomer,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
    """Get current customer's loyalty ledger entries."""
    result = await db.execute(
        select(LoyaltyAccount).where(LoyaltyAccount.customer_id == customer.id)
    )
    account = result.scalar_one_or_none()
    if account is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Loyalty account not found"
        )

    base_stmt = select(LoyaltyPointsLedger).where(
        LoyaltyPointsLedger.loyalty_account_id == account.id
    )
    count_stmt = select(func.count(LoyaltyPointsLedger.id)).where(
        LoyaltyPointsLedger.loyalty_account_id == account.id
    )

    total_result = await db.execute(count_stmt)
    total = total_result.scalar() or 0

    stmt = (
        base_stmt.order_by(LoyaltyPointsLedger.id.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    result = await db.execute(stmt)
    items = [LoyaltyPointsLedgerOut.model_validate(r) for r in result.scalars().all()]

    return APIResponse(
        data=PaginatedResponse(
            items=items,
            total=total,
            page=page,
            per_page=per_page,
            total_pages=(total + per_page - 1) // per_page,
        )
    )
