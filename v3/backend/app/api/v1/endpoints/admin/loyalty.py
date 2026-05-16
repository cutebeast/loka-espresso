"""Admin and public loyalty endpoints."""

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, select

from app.api.v1.deps import ActiveCustomer, CurrentAdmin, DBDependency
from app.models.loyalty import LoyaltyAccount, LoyaltyPointsLedger, LoyaltyTier
from app.schemas.base import APIResponse, PaginatedResponse
from app.services.translation import auto_translate_record, delete_translations
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
    """Serialize a LoyaltyAccount to output schema.
    Works with or without the current_tier relationship loaded."""
    tier_name = ""
    tier_multiplier = 1.0
    tier_key = None
    color_hex = None
    try:
        tier = account.current_tier
        if tier:
            tier_name = tier.display_name
            tier_multiplier = float(tier.points_multiplier)
            tier_key = tier.tier_key
            color_hex = tier.color_hex
    except Exception:
        pass
    return LoyaltyAccountOut(
        id=account.id,
        customer_id=account.customer_id,
        customer_name=None,
        tier_id=account.current_tier_id or 0,
        tier_name=tier_name,
        tier_key=tier_key,
        color_hex=color_hex,
        current_points=account.points_balance,
        lifetime_points=account.lifetime_points_earned,
        points_to_next_tier=None,
        tier_multiplier=tier_multiplier,
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


@loyalty_router.get("/tiers/{id}", response_model=APIResponse[LoyaltyTierOut])
async def get_loyalty_tier(db: DBDependency, admin: CurrentAdmin, id: int):
    res = await db.execute(select(LoyaltyTier).where(LoyaltyTier.id == id))
    t = res.scalar_one_or_none()
    if not t: raise HTTPException(status_code=404, detail="Tier not found")
    return APIResponse(data=LoyaltyTierOut.model_validate(t))


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
    await auto_translate_record(db, "loyalty_tiers", tier.id, {"display_name": tier.display_name})
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
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(tier, field, value)
    await db.commit()
    await auto_translate_record(db, "loyalty_tiers", tier.id, {"display_name": tier.display_name})
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
    await delete_translations(db, "loyalty_tiers", id)
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
    from app.models.customer import Customer
    result = await db.execute(stmt)
    accounts = result.scalars().all()
    
    # Batch fetch customer names
    customer_ids = {a.customer_id for a in accounts}
    cust_result = await db.execute(
        select(Customer.id, Customer.display_name).where(Customer.id.in_(customer_ids))
    )
    customer_names = {row[0]: row[1] or f"Customer #{row[0]}" for row in cust_result.all()}
    
    items = []
    for a in accounts:
        out = _serialize_account(a)
        out.customer_name = customer_names.get(a.customer_id, f"Customer #{a.customer_id}")
        items.append(out)

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
        # Map UI category names to actual DB event types
        category_map: dict[str, list[str]] = {
            "earn": ["order_earned", "referral_bonus", "birthday_bonus", "welcome_bonus",
                     "tier_bonus", "promo_bonus", "social_share", "review_submitted"],
            "redeem": ["reward_redemption", "voucher_conversion"],
            "expire": ["points_expired"],
            "adjustment": ["manual_adjustment", "return_deduction"],
        }
        types = category_map.get(event_type.lower(), [event_type])
        base_stmt = base_stmt.where(LoyaltyPointsLedger.event_type.in_(types))
        count_stmt = count_stmt.where(LoyaltyPointsLedger.event_type.in_(types))

    total_result = await db.execute(count_stmt)
    total = total_result.scalar() or 0

    stmt = (
        base_stmt.order_by(LoyaltyPointsLedger.id.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    result = await db.execute(stmt)
    entries = result.scalars().all()
    
    # Batch fetch customer names
    from app.models.customer import Customer
    customer_ids = {e.customer_id for e in entries}
    cust_result = await db.execute(
        select(Customer.id, Customer.display_name).where(Customer.id.in_(customer_ids))
    )
    customer_names = {row[0]: row[1] for row in cust_result.all()}
    
    items = []
    for r in entries:
        d = {c: getattr(r, c) for c in r.__table__.columns.keys()}
        d["customer_name"] = customer_names.get(r.customer_id)
        items.append(LoyaltyPointsLedgerOut.model_validate(d))

    return APIResponse(
        data=PaginatedResponse(
            items=items,
            total=total,
            page=page,
            per_page=per_page,
            total_pages=(total + per_page - 1) // per_page,
        )
    )


@loyalty_router.get(
    "/ledger/{entry_id}",
    response_model=APIResponse[LoyaltyPointsLedgerOut],
)
async def get_ledger_entry(
    db: DBDependency,
    admin: CurrentAdmin,
    entry_id: int,
):
    """Get a single ledger entry."""
    result = await db.execute(
        select(LoyaltyPointsLedger).where(LoyaltyPointsLedger.id == entry_id)
    )
    entry = result.scalar_one_or_none()
    if entry is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Entry not found"
        )
    d = {c: getattr(entry, c) for c in entry.__table__.columns.keys()}
    d["customer_name"] = None
    return APIResponse(data=LoyaltyPointsLedgerOut.model_validate(d))


# ---------------------------------------------------------------------------
# Public (customer) endpoints
# ---------------------------------------------------------------------------

@public_loyalty_router.get("/me", response_model=APIResponse[LoyaltyAccountOut])
async def get_my_loyalty_account(
    db: DBDependency,
    customer: ActiveCustomer,
):
    """Get current customer's loyalty account. Auto-creates if not found."""
    from sqlalchemy.orm import selectinload
    result = await db.execute(
        select(LoyaltyAccount)
        .options(selectinload(LoyaltyAccount.current_tier))
        .where(LoyaltyAccount.customer_id == customer.id)
    )
    account = result.scalar_one_or_none()
    if account is None:
        # Auto-create loyalty account for customer, assign lowest tier
        from app.services.commerce import get_default_tier_id
        default_tier = await get_default_tier_id(db)
        account = LoyaltyAccount(
            customer_id=customer.id,
            current_tier_id=default_tier,
            points_balance=0,
            lifetime_points_earned=0,
        )
        db.add(account)
        await db.commit()
        await db.refresh(account)
        # Re-fetch with tier relationship loaded
        result = await db.execute(
            select(LoyaltyAccount)
            .options(selectinload(LoyaltyAccount.current_tier))
            .where(LoyaltyAccount.id == account.id)
        )
        account = result.scalar_one()
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
    """Get current customer's loyalty ledger entries. Returns empty if no account."""
    result = await db.execute(
        select(LoyaltyAccount).where(LoyaltyAccount.customer_id == customer.id)
    )
    account = result.scalar_one_or_none()
    if account is None:
        return APIResponse(
            data=PaginatedResponse(
                items=[],
                total=0,
                page=page,
                per_page=per_page,
                total_pages=0,
            )
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
