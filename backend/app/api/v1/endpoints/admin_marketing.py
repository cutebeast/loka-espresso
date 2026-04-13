from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.database import get_db
from app.core.security import require_role
from app.models.user import User
from app.models.marketing import MarketingCampaign

router = APIRouter(prefix="/admin/marketing", tags=["Admin Marketing"])


@router.get("/campaigns")
async def list_campaigns(
    status: str | None = None,
    channel: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    user: User = Depends(require_role("admin")),
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
        "campaigns": [
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
                "cost": float(c.cost) if c.cost else None,
                "created_at": c.created_at.isoformat() if c.created_at else None,
            }
            for c in campaigns
        ],
    }


@router.post("/campaigns", status_code=201)
async def create_campaign(
    req: dict,
    user: User = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    campaign = MarketingCampaign(created_by=user.id, **{k: v for k, v in req.items() if hasattr(MarketingCampaign, k)})
    db.add(campaign)
    await db.flush()
    await db.refresh(campaign)
    await db.commit()
    return {"id": campaign.id, "name": campaign.name, "status": campaign.status}


@router.put("/campaigns/{campaign_id}")
async def update_campaign(
    campaign_id: int,
    req: dict,
    user: User = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(MarketingCampaign).where(MarketingCampaign.id == campaign_id))
    campaign = result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    for k, v in req.items():
        if hasattr(campaign, k):
            setattr(campaign, k, v)
    await db.flush()
    await db.commit()
    return {"message": "Campaign updated"}


@router.delete("/campaigns/{campaign_id}")
async def delete_campaign(
    campaign_id: int,
    user: User = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(MarketingCampaign).where(MarketingCampaign.id == campaign_id))
    campaign = result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    campaign.status = "cancelled"
    await db.flush()
    await db.commit()
    return {"message": "Campaign cancelled"}
