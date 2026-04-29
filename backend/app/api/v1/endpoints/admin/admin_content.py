"""Admin endpoints for Information Cards (Announcements/Content).

Follows the same pattern as admin_marketing.py for Promotions.
"""
import re
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import Optional, List

from app.core.database import get_db
from app.core.security import require_role
from app.models.admin_user import AdminUser
from app.models.user import RoleIDs
from app.models.content import InformationCard
from app.schemas.admin_extras import InformationCardCreate, InformationCardUpdate

router = APIRouter(prefix="/admin", tags=["Admin Content"])


def _slugify(text: str) -> str:
    """Convert a title to a URL-friendly slug."""
    text = text.lower().strip()
    text = re.sub(r'[^a-z0-9\s-]', '', text)
    text = re.sub(r'\s+', '-', text)
    text = re.sub(r'-+', '-', text)
    return text[:255]


@router.get("/content/cards")
async def list_cards(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    content_type: str = Query(None, description="Filter by content type"),
    user: AdminUser = Depends(require_role(RoleIDs.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    """List all information cards with pagination."""
    q = select(InformationCard).order_by(InformationCard.position, InformationCard.created_at.desc())
    if content_type:
        q = q.where(InformationCard.content_type == content_type)
    
    total_result = await db.execute(select(func.count()).select_from(q.subquery()))
    total = total_result.scalar() or 0
    
    q = q.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(q)
    cards = result.scalars().all()
    
    total_pages = (total + page_size - 1) // page_size
    
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
        "items": [
            {
                "id": c.id,
                "title": c.title,
                "slug": c.slug,
                "short_description": c.short_description,
                "long_description": c.long_description,
                "content_type": c.content_type,
                "icon": c.icon,
                "image_url": c.image_url,
                "gallery_urls": c.gallery_urls,
                "action_url": c.action_url,
                "action_type": c.action_type,
                "action_label": c.action_label,
                "is_active": c.is_active,
                "position": c.position,
                "start_date": c.start_date.isoformat() if c.start_date else None,
                "end_date": c.end_date.isoformat() if c.end_date else None,
                "created_at": c.created_at.isoformat() if c.created_at else None,
            }
            for c in cards
        ],
    }


@router.get("/content/cards/{card_id}")
async def get_card(
    card_id: int,
    user: AdminUser = Depends(require_role(RoleIDs.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    """Get single information card detail."""
    result = await db.execute(select(InformationCard).where(InformationCard.id == card_id))
    card = result.scalar_one_or_none()
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")
    
    return {
        "id": card.id,
        "title": card.title,
        "slug": card.slug,
        "short_description": card.short_description,
        "long_description": card.long_description,
        "content_type": card.content_type,
        "icon": card.icon,
        "image_url": card.image_url,
        "gallery_urls": card.gallery_urls,
        "action_url": card.action_url,
        "action_type": card.action_type,
        "action_label": card.action_label,
        "is_active": card.is_active,
        "position": card.position,
        "start_date": card.start_date.isoformat() if card.start_date else None,
        "end_date": card.end_date.isoformat() if card.end_date else None,
        "created_at": card.created_at.isoformat() if card.created_at else None,
        "updated_at": card.updated_at.isoformat() if card.updated_at else None,
    }


@router.post("/content/cards", status_code=201)
async def create_card(
    req: InformationCardCreate,
    user: AdminUser = Depends(require_role(RoleIDs.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    """Create a new information card."""
    card = InformationCard(
        title=req.title,
        slug=req.slug or _slugify(req.title),
        short_description=req.short_description,
        long_description=req.long_description,
        icon=req.icon,
        content_type=req.content_type,
        image_url=req.image_url,
        gallery_urls=req.gallery_urls,
        action_url=req.action_url,
        action_type=req.action_type,
        action_label=req.action_label,
        is_active=req.is_active,
        position=req.position,
        start_date=req.start_date,
        end_date=req.end_date,
    )
    db.add(card)
    await db.flush()
    await db.refresh(card)
    
    return {
        "id": card.id,
        "title": card.title,
        "message": "Card created successfully"
    }


@router.put("/content/cards/{card_id}")
async def update_card(
    card_id: int,
    req: InformationCardUpdate,
    user: AdminUser = Depends(require_role(RoleIDs.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    """Update an information card."""
    result = await db.execute(select(InformationCard).where(InformationCard.id == card_id))
    card = result.scalar_one_or_none()
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")
    
    update_data = req.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(card, field, value)
    
    await db.flush()
    
    return {
        "id": card.id,
        "title": card.title,
        "message": "Card updated successfully"
    }


@router.delete("/content/cards/{card_id}")
async def delete_card(
    card_id: int,
    user: AdminUser = Depends(require_role(RoleIDs.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    """Delete an information card."""
    result = await db.execute(select(InformationCard).where(InformationCard.id == card_id))
    card = result.scalar_one_or_none()
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")
    
    await db.delete(card)
    await db.flush()
    
    return {"message": "Card deleted successfully"}
