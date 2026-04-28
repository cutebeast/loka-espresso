from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, func

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.customer import Customer
from app.models.social import Favorite
from app.models.menu import MenuItem
from app.schemas.menu import MenuItemOut

router = APIRouter(prefix="/favorites", tags=["Favorites"])


@router.get("")
async def list_favorites(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    count_q = select(func.count()).select_from(Favorite).where(Favorite.user_id == user.id)
    total_result = await db.execute(count_q)
    total = total_result.scalar() or 0

    result = await db.execute(
        select(Favorite).where(Favorite.user_id == user.id)
        .offset((page - 1) * page_size).limit(page_size)
    )
    out = []
    for fav in result.scalars().all():
        ir = await db.execute(select(MenuItem).where(MenuItem.id == fav.item_id))
        mi = ir.scalar_one_or_none()
        if mi:
            out.append(MenuItemOut.model_validate(mi).model_dump())
    return {"items": out, "total": total, "page": page, "page_size": page_size, "total_pages": max(1, (total + page_size - 1) // page_size)}


@router.post("/{item_id}", status_code=201)
async def add_favorite(item_id: int, user: Customer = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    existing = await db.execute(
        select(Favorite).where(Favorite.user_id == user.id, Favorite.item_id == item_id)
    )
    if existing.scalar_one_or_none():
        return {"message": "Already favorited"}
    fav = Favorite(user_id=user.id, item_id=item_id)
    db.add(fav)
    await db.flush()
    return {"message": "Added to favorites"}


@router.delete("/{item_id}")
async def remove_favorite(item_id: int, user: Customer = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Favorite).where(Favorite.user_id == user.id, Favorite.item_id == item_id)
    )
    fav = result.scalar_one_or_none()
    if not fav:
        raise HTTPException(status_code=404, detail="Not in favorites")
    await db.delete(fav)
    await db.flush()
    return {"message": "Removed from favorites"}
