"""Public content endpoints for PWA — banners, info cards, products, events, legal, splash."""

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select

from app.api.v1.deps import DBDependency
from app.models.info_card import (
    EventCard,
    InformationCard,
    ProductCard,
    PromoBanner,
    SplashScreen,
    SystemPage,
)
from app.models.store import Store
from app.schemas.base import APIResponse
from app.schemas.content import (
    EventCardOut,
    InfoCardOut,
    ProductCardOut,
    PromoBannerOut,
    SplashScreenOut,
    SystemPageOut,
)

router = APIRouter(tags=["public — content"])


# ── Promo Banners ──

@router.get("/promos/banners", response_model=APIResponse[list[PromoBannerOut]])
async def list_promo_banners(
    db: DBDependency,
    limit: int = Query(20, ge=1, le=100),
):
    """List active promo banners for PWA display."""
    now = datetime.now(timezone.utc)
    stmt = (
        select(PromoBanner)
        .where(PromoBanner.is_active.is_(True))
        .where(
            (PromoBanner.start_date.is_(None)) | (PromoBanner.start_date <= now)
        )
        .where(
            (PromoBanner.end_date.is_(None)) | (PromoBanner.end_date >= now)
        )
        .order_by(PromoBanner.position.asc(), PromoBanner.id.desc())
        .limit(limit)
    )
    result = await db.execute(stmt)
    items = result.scalars().all()
    return APIResponse(data=[PromoBannerOut.model_validate(i) for i in items])


@router.get("/promos/banners/{banner_id}", response_model=APIResponse[PromoBannerOut])
async def get_promo_banner(
    db: DBDependency,
    banner_id: int,
):
    """Get a single promo banner."""
    item = await db.get(PromoBanner, banner_id)
    if not item or not item.is_active:
        raise HTTPException(status_code=404, detail="Banner not found")
    return APIResponse(data=PromoBannerOut.model_validate(item))


@router.get("/promos/banners/{banner_id}/status", response_model=APIResponse[dict])
async def get_banner_status(
    db: DBDependency,
    banner_id: int,
):
    """Get customer's interaction status with a banner (placeholder — no auth required)."""
    item = await db.get(PromoBanner, banner_id)
    if not item:
        raise HTTPException(status_code=404, detail="Banner not found")
    return APIResponse(data={"claimed": False, "viewed": False, "banner_id": banner_id})


# ── Information Cards ──

@router.get("/content/information", response_model=APIResponse[list[InfoCardOut]])
async def list_information_cards(
    db: DBDependency,
    content_type: str | None = Query(None),
    limit: int = Query(20, ge=1, le=100),
):
    """List active information cards."""
    now = datetime.now(timezone.utc)
    stmt = (
        select(InformationCard)
        .where(InformationCard.is_active.is_(True))
        .where(
            (InformationCard.start_date.is_(None)) | (InformationCard.start_date <= now)
        )
        .where(
            (InformationCard.end_date.is_(None)) | (InformationCard.end_date >= now)
        )
        .order_by(InformationCard.position.asc(), InformationCard.id.desc())
        .limit(limit)
    )
    if content_type:
        stmt = stmt.where(InformationCard.content_type == content_type)
    result = await db.execute(stmt)
    items = result.scalars().all()
    return APIResponse(data=[InfoCardOut.model_validate(i) for i in items])


@router.get("/content/information/{slug}", response_model=APIResponse[InfoCardOut])
async def get_information_card(
    db: DBDependency,
    slug: str,
):
    """Get a single information card by slug."""
    stmt = select(InformationCard).where(
        InformationCard.slug == slug,
        InformationCard.is_active.is_(True),
    )
    result = await db.execute(stmt)
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Information card not found")
    return APIResponse(data=InfoCardOut.model_validate(item))


# ── Product Cards ──

@router.get("/content/products", response_model=APIResponse[list[ProductCardOut]])
async def list_product_cards(
    db: DBDependency,
    limit: int = Query(20, ge=1, le=100),
):
    """List active product cards."""
    stmt = (
        select(ProductCard)
        .where(ProductCard.is_active.is_(True))
        .order_by(ProductCard.position.asc(), ProductCard.id.desc())
        .limit(limit)
    )
    result = await db.execute(stmt)
    items = result.scalars().all()
    return APIResponse(data=[ProductCardOut.model_validate(i) for i in items])


@router.get("/content/products/{slug}", response_model=APIResponse[ProductCardOut])
async def get_product_card(
    db: DBDependency,
    slug: str,
):
    """Get a single product card by slug."""
    stmt = select(ProductCard).where(
        ProductCard.slug == slug,
        ProductCard.is_active.is_(True),
    )
    result = await db.execute(stmt)
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Product card not found")
    return APIResponse(data=ProductCardOut.model_validate(item))


# ── Event Cards ──

@router.get("/content/events", response_model=APIResponse[list[EventCardOut]])
async def list_event_cards(
    db: DBDependency,
    limit: int = Query(20, ge=1, le=100),
):
    """List active event cards."""
    now = datetime.now(timezone.utc)
    stmt = (
        select(EventCard)
        .where(EventCard.is_active.is_(True))
        .where(
            (EventCard.end_date.is_(None)) | (EventCard.end_date >= now)
        )
        .order_by(EventCard.position.asc(), EventCard.event_datetime.asc())
        .limit(limit)
    )
    result = await db.execute(stmt)
    items = result.scalars().all()
    return APIResponse(data=[EventCardOut.model_validate(i) for i in items])


@router.get("/content/events/{slug}", response_model=APIResponse[EventCardOut])
async def get_event_card(
    db: DBDependency,
    slug: str,
):
    """Get a single event card by slug."""
    stmt = select(EventCard).where(
        EventCard.slug == slug,
        EventCard.is_active.is_(True),
    )
    result = await db.execute(stmt)
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Event card not found")
    return APIResponse(data=EventCardOut.model_validate(item))


# ── Legal / System Pages ──

@router.get("/content/legal/{page_key}", response_model=APIResponse[SystemPageOut])
async def get_legal_page(
    db: DBDependency,
    page_key: str,
):
    """Get a system page (terms, privacy, about) by page_key."""
    stmt = select(SystemPage).where(
        SystemPage.page_key == page_key,
        SystemPage.is_active.is_(True),
    )
    result = await db.execute(stmt)
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Page not found")
    return APIResponse(data=SystemPageOut.model_validate(item))


# ── Splash Screen ──

@router.get("/splash", response_model=APIResponse[SplashScreenOut | None])
async def get_active_splash(
    db: DBDependency,
):
    """Get the currently active splash screen."""
    now = datetime.now(timezone.utc)
    stmt = (
        select(SplashScreen)
        .where(SplashScreen.is_active.is_(True))
        .where(SplashScreen.deleted_at.is_(None))
        .where(
            (SplashScreen.active_from.is_(None)) | (SplashScreen.active_from <= now)
        )
        .where(
            (SplashScreen.active_until.is_(None)) | (SplashScreen.active_until >= now)
        )
        .order_by(SplashScreen.id.desc())
        .limit(1)
    )
    result = await db.execute(stmt)
    item = result.scalar_one_or_none()
    return APIResponse(data=SplashScreenOut.model_validate(item) if item else None)


# ── Config Bootstrap ──

@router.get("/config/bootstrap", response_model=APIResponse[dict])
async def get_config_bootstrap(
    db: DBDependency,
):
    """Return app config for PWA boot — currency, fees, loyalty tiers, stores list."""
    from app.models.loyalty import LoyaltyTier
    from app.models.store import StoreConfiguration

    # Fetch all active stores (minimal)
    stores_stmt = (
        select(Store)
        .where(Store.is_active.is_(True))
        .order_by(Store.id.asc())
    )
    stores_res = await db.execute(stores_stmt)
    stores = stores_res.scalars().all()

    # Fetch loyalty tiers
    tiers_stmt = select(LoyaltyTier).where(LoyaltyTier.is_active.is_(True)).order_by(LoyaltyTier.min_lifetime_points.asc())
    tiers_res = await db.execute(tiers_stmt)
    tiers = tiers_res.scalars().all()

    # Fetch store config (pick first active store's config as default)
    config = {}
    if stores:
        config_stmt = select(StoreConfiguration).where(StoreConfiguration.store_id == stores[0].id)
        config_res = await db.execute(config_stmt)
        config_rows = config_res.scalars().all()
        config = {row.config_key: row.config_value for row in config_rows}

    # Default currency
    currency = config.get("currency", "MYR")
    delivery_fee = config.get("base_delivery_fee", "0")
    min_order = config.get("minimum_order_amount", "0")

    return APIResponse(data={
        "currency": currency,
        "currency_symbol": "RM" if currency == "MYR" else "$",
        "delivery_fee": float(delivery_fee) if delivery_fee else 0,
        "minimum_order_amount": float(min_order) if min_order else 0,
        "loyalty_tiers": [
            {"name": t.display_name, "min_points": t.min_lifetime_points, "color": t.color_hex or "#A0783A"}
            for t in tiers
        ],
        "stores": [
            {
                "id": s.id,
                "store_name": s.store_name,
                "slug": s.slug,
                "address_line_1": s.address_line_1,
                "city": s.city,
                "phone_number": s.phone_number,
                "logo_url": s.logo_url,
                "latitude": s.latitude,
                "longitude": s.longitude,
                "is_active": s.is_active,
            }
            for s in stores
        ],
        "features": {
            "wallet_enabled": True,
            "loyalty_enabled": True,
            "reservations_enabled": True,
            "delivery_enabled": config.get("delivery_enabled", "true").lower() == "true",
            "dine_in_enabled": True,
        },
    })
