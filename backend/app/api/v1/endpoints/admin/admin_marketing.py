from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.database import get_db
from app.core.security import require_role
from app.core.utils import to_float
from app.models.admin_user import AdminUser
from app.models.user import RoleIDs
from app.models.marketing import MarketingCampaign
from app.schemas.admin_extras import MarketingCampaignCreate, MarketingCampaignUpdate

router = APIRouter(prefix="/admin", tags=["Admin Marketing"])


@router.get("/marketing/campaigns")
async def list_campaigns(
    status: str | None = None,
    channel: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    user: AdminUser = Depends(require_role(RoleIDs.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    q = select(MarketingCampaign)
    if status:
        q = q.where(MarketingCampaign.status == status)
    if channel:
        q = q.where(MarketingCampaign.channel == channel)

    total_result = await db.execute(select(func.count()).select_from(q.subquery()))
    total = total_result.scalar() or 0

    q = q.order_by(MarketingCampaign.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(q)
    campaigns = result.scalars().all()

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
        "items": [
            {
                "id": c.id,
                "name": c.name,
                "channel": c.channel,
                "audience": c.audience,
                "store_id": c.store_id,
                "status": c.status,
                "provider": c.provider,
                "scheduled_at": c.scheduled_at.isoformat() if c.scheduled_at else None,
                "sent_at": c.sent_at.isoformat() if c.sent_at else None,
                "total_recipients": c.total_recipients,
                "sent_count": c.sent_count,
                "delivered_count": c.delivered_count,
                "opened_count": c.opened_count,
                "clicked_count": c.clicked_count,
                "failed_count": c.failed_count,
                "cost": to_float(c.cost) if c.cost else None,
                "created_at": c.created_at.isoformat() if c.created_at else None,
            }
            for c in campaigns
        ],
    }


@router.get("/marketing/campaigns/{campaign_id}")
async def get_campaign(
    campaign_id: int,
    user: AdminUser = Depends(require_role(RoleIDs.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(MarketingCampaign).where(MarketingCampaign.id == campaign_id))
    campaign = result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return {
        "id": campaign.id,
        "name": campaign.name,
        "channel": campaign.channel,
        "subject": campaign.subject,
        "body": campaign.body,
        "image_url": campaign.image_url,
        "cta_url": campaign.cta_url,
        "audience": campaign.audience,
        "store_id": campaign.store_id,
        "status": campaign.status,
        "provider": campaign.provider,
        "scheduled_at": campaign.scheduled_at.isoformat() if campaign.scheduled_at else None,
        "sent_at": campaign.sent_at.isoformat() if campaign.sent_at else None,
        "completed_at": campaign.completed_at.isoformat() if campaign.completed_at else None,
        "total_recipients": campaign.total_recipients,
        "sent_count": campaign.sent_count,
        "delivered_count": campaign.delivered_count,
        "opened_count": campaign.opened_count,
        "clicked_count": campaign.clicked_count,
        "failed_count": campaign.failed_count,
        "cost": to_float(campaign.cost) if campaign.cost else None,
        "created_at": campaign.created_at.isoformat() if campaign.created_at else None,
    }


@router.post("/marketing/campaigns", status_code=201)
async def create_campaign(
    req: MarketingCampaignCreate,
    user: AdminUser = Depends(require_role(RoleIDs.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    campaign = MarketingCampaign(created_by=user.id, **req.model_dump(exclude_unset=True))
    db.add(campaign)
    await db.flush()
    await db.refresh(campaign)
    return {"id": campaign.id, "name": campaign.name, "status": campaign.status}


@router.put("/marketing/campaigns/{campaign_id}")
async def update_campaign(
    campaign_id: int,
    req: MarketingCampaignUpdate,
    user: AdminUser = Depends(require_role(RoleIDs.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(MarketingCampaign).where(MarketingCampaign.id == campaign_id))
    campaign = result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    for k, v in req.model_dump(exclude_unset=True).items():
        if hasattr(campaign, k):
            setattr(campaign, k, v)
    await db.flush()
    return {"message": "Campaign updated"}


@router.delete("/marketing/campaigns/{campaign_id}")
async def delete_campaign(
    campaign_id: int,
    user: AdminUser = Depends(require_role(RoleIDs.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(MarketingCampaign).where(MarketingCampaign.id == campaign_id))
    campaign = result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    campaign.status = "cancelled"
    await db.flush()
    return {"message": "Campaign cancelled"}
