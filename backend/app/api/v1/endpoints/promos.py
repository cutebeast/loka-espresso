from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.models.promo import Promo
from app.schemas.promo import PromoOut

router = APIRouter(prefix="/promos", tags=["Promos"])


@router.get("", response_model=list[PromoOut])
async def list_promos(db: AsyncSession = Depends(get_db)):
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(Promo).where(
            Promo.is_active == True,
            Promo.start_date <= now,
        ).order_by(Promo.start_date.desc())
    )
    return result.scalars().all()


@router.get("/{promo_id}", response_model=PromoOut)
async def get_promo(promo_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Promo).where(Promo.id == promo_id))
    promo = result.scalar_one_or_none()
    if not promo:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Promo not found")
    return promo
