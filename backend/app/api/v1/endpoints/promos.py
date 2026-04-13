from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.models.voucher import Voucher
from app.models.admin_extras import PromoBanner
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/promos", tags=["Promos"])


class PromoItemOut(BaseModel):
    """Unified promotion item — can be a voucher code or a banner campaign."""
    id: int
    promo_type: str  # "voucher" or "banner"
    title: str
    subtitle: Optional[str] = None
    image_url: Optional[str] = None
    code: Optional[str] = None
    discount_type: Optional[str] = None
    discount_value: Optional[float] = None
    target_url: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None

    class Config:
        from_attributes = True


@router.get("", response_model=list[PromoItemOut])
async def list_promos(db: AsyncSession = Depends(get_db)):
    """Returns active promo banners + active vouchers as a unified promotions list."""
    now = datetime.now(timezone.utc)
    results = []

    # Active promo banners
    banner_result = await db.execute(
        select(PromoBanner).where(
            PromoBanner.is_active == True,
            PromoBanner.start_date <= now,
        ).order_by(PromoBanner.position)
    )
    for b in banner_result.scalars().all():
        results.append(PromoItemOut(
            id=b.id,
            promo_type="banner",
            title=b.title,
            subtitle=b.subtitle,
            image_url=b.image_url,
            target_url=b.target_url,
            start_date=b.start_date,
            end_date=b.end_date,
        ))

    # Active vouchers (with code for redemption)
    voucher_result = await db.execute(
        select(Voucher).where(
            Voucher.is_active == True,
            (Voucher.valid_from == None) | (Voucher.valid_from <= now),
        ).order_by(Voucher.created_at.desc())
    )
    for v in voucher_result.scalars().all():
        results.append(PromoItemOut(
            id=v.id,
            promo_type="voucher",
            title=v.description or f"Use code {v.code}",
            code=v.code,
            discount_type=v.discount_type.value if hasattr(v.discount_type, 'value') else str(v.discount_type),
            discount_value=float(v.discount_value) if v.discount_value else None,
            start_date=v.valid_from,
            end_date=v.valid_until,
        ))

    return results
