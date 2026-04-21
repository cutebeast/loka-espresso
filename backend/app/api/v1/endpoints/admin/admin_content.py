"""Admin endpoints for Information Cards (Announcements/Content).

Follows the same pattern as admin_marketing.py for Promotions.
"""
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import Optional, List

from app.core.database import get_db
from app.core.security import require_role
from app.models.user import User, RoleIDs
from app.models.content import InformationCard

router = APIRouter(prefix="/admin/content", tags=["Admin Content"])


@router.get("/cards")
async def list_cards(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    user: User = Depends(require_role(RoleIDs.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    """List all information cards with pagination."""
    q = select(InformationCard).order_by(InformationCard.position, InformationCard.created_at.desc())
    
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
        "cards": [
            {
                "id": c.id,
                "title": c.title,
                "short_description": c.short_description,
                "long_description": c.long_description,
                "content_type": c.content_type,
                "icon": c.icon,
                "image_url": c.image_url,
                "is_active": c.is_active,
                "position": c.position,
                "start_date": c.start_date.isoformat() if c.start_date else None,
                "end_date": c.end_date.isoformat() if c.end_date else None,
                "created_at": c.created_at.isoformat() if c.created_at else None,
            }
            for c in cards
        ],
    }


@router.get("/cards/{card_id}")
async def get_card(
    card_id: int,
    user: User = Depends(require_role(RoleIDs.ADMIN)),
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
        "short_description": card.short_description,
        "long_description": card.long_description,
        "content_type": card.content_type,
        "icon": card.icon,
        "image_url": card.image_url,
        "is_active": card.is_active,
        "position": card.position,
        "start_date": card.start_date.isoformat() if card.start_date else None,
        "end_date": card.end_date.isoformat() if card.end_date else None,
        "created_at": card.created_at.isoformat() if card.created_at else None,
        "updated_at": card.updated_at.isoformat() if card.updated_at else None,
    }


@router.post("/cards", status_code=201)
async def create_card(
    req: dict,
    user: User = Depends(require_role(RoleIDs.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    """Create a new information card."""
    card = InformationCard(
        title=req.get("title", ""),
        short_description=req.get("short_description"),
        long_description=req.get("long_description"),
        icon=req.get("icon"),
        content_type=req.get("content_type", "promotion"),
        image_url=req.get("image_url"),
        is_active=req.get("is_active", True),
        position=req.get("position", 0),
        start_date=req.get("start_date"),
        end_date=req.get("end_date"),
    )
    db.add(card)
    await db.flush()
    await db.refresh(card)
    
    return {
        "id": card.id,
        "title": card.title,
        "message": "Card created successfully"
    }


@router.put("/cards/{card_id}")
async def update_card(
    card_id: int,
    req: dict,
    user: User = Depends(require_role(RoleIDs.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    """Update an information card."""
    result = await db.execute(select(InformationCard).where(InformationCard.id == card_id))
    card = result.scalar_one_or_none()
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")
    
    # Update allowed fields
    allowed_fields = [
        "title", "short_description", "long_description", "icon",
        "content_type", "image_url", "is_active",
        "position", "start_date", "end_date"
    ]
    
    for field in allowed_fields:
        if field in req:
            setattr(card, field, req[field])
    
    await db.flush()
    
    return {
        "id": card.id,
        "title": card.title,
        "message": "Card updated successfully"
    }


@router.delete("/cards/{card_id}")
async def delete_card(
    card_id: int,
    user: User = Depends(require_role(RoleIDs.ADMIN)),
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
