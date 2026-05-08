"""Admin marketing campaign endpoints."""

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select

from app.api.v1.deps import CurrentAdmin, DBDependency
from app.models.marketing import MarketingCampaign
from app.schemas.base import APIResponse, PaginatedResponse
from app.schemas.marketing import (
    MarketingCampaignCreate,
    MarketingCampaignOut,
    MarketingCampaignUpdate,
)

admin_router = APIRouter(prefix="/admin/marketing", tags=["admin — marketing"])


async def _get_campaign_or_404(db, campaign_id: int) -> MarketingCampaign:
    result = await db.execute(
        select(MarketingCampaign).where(MarketingCampaign.id == campaign_id)
    )
    campaign = result.scalar_one_or_none()
    if campaign is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")
    return campaign


@admin_router.get("/campaigns", response_model=APIResponse[PaginatedResponse[MarketingCampaignOut]])
async def list_campaigns(
    db: DBDependency,
    admin: CurrentAdmin,
    store_id: int | None = Query(None),
    status: str | None = Query(None),
    channel: str | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
    """List marketing campaigns with filters."""
    base_stmt = select(MarketingCampaign)
    count_stmt = select(func.count(MarketingCampaign.id))

    if store_id is not None:
        base_stmt = base_stmt.where(MarketingCampaign.store_id == store_id)
        count_stmt = count_stmt.where(MarketingCampaign.store_id == store_id)
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
    await db.refresh(campaign)
    return APIResponse(data=MarketingCampaignOut.model_validate(campaign))


@admin_router.patch("/campaigns/{campaign_id}/send", response_model=APIResponse[MarketingCampaignOut])
async def send_campaign(
    db: DBDependency,
    admin: CurrentAdmin,
    campaign_id: int,
):
    """Mark campaign as sent / active."""
    campaign = await _get_campaign_or_404(db, campaign_id)

    campaign.status = "active"
    campaign.started_at = datetime.now(timezone.utc)
    campaign.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(campaign)
    return APIResponse(data=MarketingCampaignOut.model_validate(campaign))


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
    return APIResponse(data={"id": campaign_id, "deleted": True})
