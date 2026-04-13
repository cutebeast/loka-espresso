from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.promo import Favorite
from app.models.menu import MenuItem
from app.schemas.menu import MenuItemOut

router = APIRouter(prefix="/favorites", tags=["Favorites"])


@router.get("")
async def list_favorites(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Favorite).where(Favorite.user_id == user.id))
    out = []
    for fav in result.scalars().all():
        ir = await db.execute(select(MenuItem).where(MenuItem.id == fav.item_id))
        mi = ir.scalar_one_or_none()
        if mi:
            out.append(MenuItemOut.model_validate(mi).model_dump())
    return out


@router.post("/{item_id}", status_code=201)
async def add_favorite(item_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
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
async def remove_favorite(item_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Favorite).where(Favorite.user_id == user.id, Favorite.item_id == item_id)
    )
    fav = result.scalar_one_or_none()
    if not fav:
        raise HTTPException(status_code=404, detail="Not in favorites")
    await db.delete(fav)
    await db.flush()
    return {"message": "Removed from favorites"}
