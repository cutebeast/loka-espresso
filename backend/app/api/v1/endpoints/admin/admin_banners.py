from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func

from app.core.database import get_db
from app.core.security import require_hq_access
from app.core.audit import log_action, get_client_ip
from app.models.user import User
from app.models.promotions import PromoBanner
from app.schemas.admin_extras import (
    PromoBannerCreate,
    PromoBannerUpdate,
    PromoBannerOut,
)

router = APIRouter(tags=["Admin Banners"])


@router.get("/admin/banners")
async def list_banners(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_hq_access()),
):
    count_q = select(func.count()).select_from(PromoBanner)
    total_result = await db.execute(count_q)
    total = total_result.scalar() or 0

    result = await db.execute(
        select(PromoBanner).order_by(desc(PromoBanner.created_at))
        .offset((page - 1) * page_size).limit(page_size)
    )
    banners = result.scalars().all()
    return {
        "banners": banners,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
    }


@router.post("/admin/banners", status_code=201, response_model=PromoBannerOut)
async def create_banner(
    request: Request,
    data: PromoBannerCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_hq_access()),
):
    obj = PromoBanner(**data.model_dump())
    db.add(obj)
    await db.flush()
    ip = get_client_ip(request)
    await log_action(db, action="CREATE_BANNER", user_id=user.id, entity_type="banner", entity_id=obj.id, details={"title": obj.title}, ip_address=ip)
    await db.flush()
    await db.refresh(obj)
    return obj


@router.put("/admin/banners/{banner_id}", response_model=PromoBannerOut)
async def update_banner(
    banner_id: int,
    request: Request,
    data: PromoBannerUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_hq_access()),
):
    result = await db.execute(select(PromoBanner).where(PromoBanner.id == banner_id))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(404)
    changes = data.model_dump(exclude_unset=True)
    for key, value in changes.items():
        setattr(obj, key, value)
    ip = get_client_ip(request)
    await log_action(db, action="UPDATE_BANNER", user_id=user.id, entity_type="banner", entity_id=banner_id, details={"changes": changes}, ip_address=ip)
    await db.flush()
    await db.refresh(obj)
    return obj


@router.delete("/admin/banners/{banner_id}")
async def delete_banner(
    banner_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_hq_access()),
):
    result = await db.execute(select(PromoBanner).where(PromoBanner.id == banner_id))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(404)
    ip = get_client_ip(request)
    await log_action(db, action="DELETE_BANNER", user_id=user.id, entity_type="banner", entity_id=banner_id, details={"title": obj.title}, ip_address=ip)
    await db.delete(obj)
    await db.flush()
    return {"detail": "Banner deleted"}
