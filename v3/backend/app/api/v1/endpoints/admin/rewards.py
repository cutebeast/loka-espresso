"""Admin and public reward endpoints."""

from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select

from app.api.v1.deps import ActiveCustomer, CurrentAdmin, DBDependency, OptionalLocale
from app.services.translation import merge_translations, translate_single
from app.models.customer import Customer
from app.models.loyalty import LoyaltyAccount
from app.models.reward import CustomerReward, RewardCatalog
from app.schemas.base import APIResponse, PaginatedResponse
from app.schemas.loyalty import (
    CustomerRewardOut,
    RewardCatalogCreate,
    RewardCatalogOut,
    RewardCatalogUpdate,
)
from app.services.translation import auto_translate_record, delete_translations

admin_router = APIRouter(prefix="/admin/rewards", tags=["admin — rewards"])
public_router = APIRouter(prefix="/rewards", tags=["rewards"])


async def _get_reward_or_404(db, reward_id: int) -> RewardCatalog:
    result = await db.execute(
        select(RewardCatalog).where(
            RewardCatalog.id == reward_id,
            RewardCatalog.deleted_at.is_(None),
        )
    )
    reward = result.scalar_one_or_none()
    if reward is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reward not found")
    return reward


# ---------------------------------------------------------------------------
# Admin endpoints
# ---------------------------------------------------------------------------

@admin_router.get("", response_model=APIResponse[PaginatedResponse[RewardCatalogOut]])
async def list_rewards(
    db: DBDependency,
    admin: CurrentAdmin,
    locale: OptionalLocale,
    is_active: bool | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
    """List reward catalog entries with filters."""
    base_stmt = select(RewardCatalog).where(RewardCatalog.deleted_at.is_(None))
    count_stmt = select(func.count(RewardCatalog.id)).where(RewardCatalog.deleted_at.is_(None))

    if is_active is not None:
        base_stmt = base_stmt.where(RewardCatalog.is_active.is_(is_active))
        count_stmt = count_stmt.where(RewardCatalog.is_active.is_(is_active))

    total_result = await db.execute(count_stmt)
    total = total_result.scalar() or 0

    stmt = base_stmt.order_by(RewardCatalog.id.desc()).offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(stmt)
    item_dicts = [RewardCatalogOut.model_validate(r).model_dump() for r in result.scalars().all()]
    await merge_translations(db, item_dicts, "reward_catalog", locale)

    return APIResponse(
        data=PaginatedResponse(
            items=item_dicts,
            total=total,
            page=page,
            per_page=per_page,
            total_pages=(total + per_page - 1) // per_page,
        )
    )


@admin_router.post("", response_model=APIResponse[RewardCatalogOut], status_code=status.HTTP_201_CREATED)
async def create_reward(
    db: DBDependency,
    admin: CurrentAdmin,
    data: RewardCatalogCreate,
):
    """Create a new reward catalog entry."""
    reward = RewardCatalog(**data.model_dump())
    db.add(reward)
    await db.commit()
    await db.refresh(reward)
    await auto_translate_record(db, "reward_catalog", reward.id, {
        "reward_name": reward.reward_name or "",
        "short_description": reward.short_description or "",
        "long_description": reward.long_description or "",
        "how_to_redeem": reward.how_to_redeem or "",
        "terms_and_conditions": reward.terms_and_conditions or "",
    })
    return APIResponse(data=RewardCatalogOut.model_validate(reward))


@admin_router.get("/{reward_id}", response_model=APIResponse[RewardCatalogOut])
async def get_reward(
    db: DBDependency,
    admin: CurrentAdmin,
    reward_id: int,
):
    """Get reward catalog detail."""
    reward = await _get_reward_or_404(db, reward_id)
    return APIResponse(data=RewardCatalogOut.model_validate(reward))


@admin_router.put("/{reward_id}", response_model=APIResponse[RewardCatalogOut])
async def update_reward(
    db: DBDependency,
    admin: CurrentAdmin,
    reward_id: int,
    data: RewardCatalogUpdate,
):
    """Update a reward catalog entry."""
    reward = await _get_reward_or_404(db, reward_id)

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(reward, field, value)

    reward.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(reward)
    await auto_translate_record(db, "reward_catalog", reward.id, {
        "reward_name": reward.reward_name or "",
        "short_description": reward.short_description or "",
        "long_description": reward.long_description or "",
        "how_to_redeem": reward.how_to_redeem or "",
        "terms_and_conditions": reward.terms_and_conditions or "",
    })
    return APIResponse(data=RewardCatalogOut.model_validate(reward))


@admin_router.delete("/{reward_id}", response_model=APIResponse[dict])
async def delete_reward(
    db: DBDependency,
    admin: CurrentAdmin,
    reward_id: int,
):
    """Soft-delete a reward catalog entry."""
    reward = await _get_reward_or_404(db, reward_id)

    reward.is_active = False
    reward.deleted_at = datetime.now(timezone.utc)
    reward.is_active = False
    await db.commit()
    await delete_translations(db, "reward_catalog", reward.id)
    return APIResponse(data={"id": reward.id, "deleted": True})


@admin_router.get("/{reward_id}/redemptions", response_model=APIResponse[PaginatedResponse[CustomerRewardOut]])
async def list_reward_redemptions(
    db: DBDependency,
    admin: CurrentAdmin,
    reward_id: int,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
    """List customer redemptions for a reward."""
    await _get_reward_or_404(db, reward_id)

    count_stmt = select(func.count(CustomerReward.id)).where(CustomerReward.reward_catalog_id == reward_id)
    total_result = await db.execute(count_stmt)
    total = total_result.scalar() or 0

    stmt = (
        select(CustomerReward)
        .where(CustomerReward.reward_catalog_id == reward_id)
        .order_by(CustomerReward.id.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    result = await db.execute(stmt)
    items = []
    for row in result.scalars().all():
        data = {c: getattr(row, c) for c in row.__table__.columns.keys()}
        # Add reward_name from catalog if available
        data["reward_name"] = row.reward_catalog.reward_name if row.reward_catalog else None
        items.append(CustomerRewardOut.model_validate(data))

    return APIResponse(
        data=PaginatedResponse(
            items=items,
            total=total,
            page=page,
            per_page=per_page,
            total_pages=(total + per_page - 1) // per_page,
        )
    )


# ---------------------------------------------------------------------------
# Public endpoints
# ---------------------------------------------------------------------------

@public_router.get("/catalog", response_model=APIResponse[PaginatedResponse[RewardCatalogOut]])
async def list_reward_catalog(
    customer: ActiveCustomer,
    db: DBDependency,
    locale: OptionalLocale,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
    """List available rewards for the current customer."""
    base_stmt = select(RewardCatalog).where(
        RewardCatalog.is_active.is_(True),
        RewardCatalog.deleted_at.is_(None),
    )
    count_stmt = select(func.count(RewardCatalog.id)).where(
        RewardCatalog.is_active.is_(True),
        RewardCatalog.deleted_at.is_(None),
    )

    total_result = await db.execute(count_stmt)
    total = total_result.scalar() or 0

    stmt = base_stmt.order_by(RewardCatalog.id.desc()).offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(stmt)
    items = [RewardCatalogOut.model_validate(r) for r in result.scalars().all()]

    return APIResponse(
        data=PaginatedResponse(
            items=items,
            total=total,
            page=page,
            per_page=per_page,
            total_pages=(total + per_page - 1) // per_page,
        )
    )


@public_router.get("/me", response_model=APIResponse[PaginatedResponse[CustomerRewardOut]])
async def list_my_rewards(
    customer: ActiveCustomer,
    db: DBDependency,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
    """List current customer's rewards."""
    count_stmt = select(func.count(CustomerReward.id)).where(CustomerReward.customer_id == customer.id)
    total_result = await db.execute(count_stmt)
    total = total_result.scalar() or 0

    stmt = (
        select(CustomerReward)
        .where(CustomerReward.customer_id == customer.id)
        .order_by(CustomerReward.id.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    result = await db.execute(stmt)
    items = []
    for row in result.scalars().all():
        data = {c: getattr(row, c) for c in row.__table__.columns.keys()}
        data["reward_name"] = row.reward_catalog.reward_name if row.reward_catalog else None
        items.append(CustomerRewardOut.model_validate(data))

    return APIResponse(
        data=PaginatedResponse(
            items=items,
            total=total,
            page=page,
            per_page=per_page,
            total_pages=(total + per_page - 1) // per_page,
        )
    )


@public_router.post("/{reward_id}/redeem", response_model=APIResponse[CustomerRewardOut])
async def redeem_reward(
    customer: ActiveCustomer,
    db: DBDependency,
    reward_id: int,
):
    """Redeem a reward."""
    reward = await _get_reward_or_404(db, reward_id)

    # Check customer's loyalty points
    loyalty_result = await db.execute(
        select(LoyaltyAccount).where(LoyaltyAccount.customer_id == customer.id)
    )
    loyalty_account = loyalty_result.scalar_one_or_none()
    if loyalty_account is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No loyalty account found")

    if loyalty_account.points_balance < reward.points_cost:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Insufficient points")

    # Deduct points
    loyalty_account.points_balance -= reward.points_cost

    # Create customer reward
    customer_reward = CustomerReward(
        customer_id=customer.id,
        reward_catalog_id=reward.id,
        store_id=1,  # Default store (rewards are global, but redemption must record a store)
        redemption_code=uuid4().hex[:12].upper(),
        status="active",
        points_spent=reward.points_cost,
        reward_snapshot={"reward_name": reward.reward_name, "reward_type": reward.reward_type},
        expires_at=datetime.now(timezone.utc) + timedelta(days=reward.validity_days),
    )
    db.add(customer_reward)

    # Increment total redemptions
    reward.total_redemptions += 1

    await db.commit()
    await db.refresh(customer_reward)

    data = {c: getattr(customer_reward, c) for c in customer_reward.__table__.columns.keys()}
    data["reward_name"] = reward.reward_name
    return APIResponse(data=CustomerRewardOut.model_validate(data))
