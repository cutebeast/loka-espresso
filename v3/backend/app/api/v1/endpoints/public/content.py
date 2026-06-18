"""Public content endpoints for PWA — banners, info cards, products, events, legal, splash."""

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select

from app.api.v1.deps import DBDependency, OptionalLocale, CurrentCustomer
from app.services.translation import merge_translations, translate_single
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
    locale: OptionalLocale,
    limit: int = Query(20, ge=1, le=500),
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
    item_dicts = [PromoBannerOut.model_validate(i).model_dump() for i in items]
    await merge_translations(db, item_dicts, "promo_banners", locale)
    return APIResponse(data=item_dicts)


@router.get("/promos/banners/{banner_id}", response_model=APIResponse[PromoBannerOut])
async def get_promo_banner(
    db: DBDependency,
    locale: OptionalLocale,
    banner_id: int,
):
    """Get a single promo banner."""
    item = await db.get(PromoBanner, banner_id)
    if not item or not item.is_active:
        raise HTTPException(status_code=404, detail="Banner not found")
    item_dict = PromoBannerOut.model_validate(item).model_dump()
    await translate_single(db, item_dict, "promo_banners", locale)
    return APIResponse(data=item_dict)


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


@router.post("/promos/banners/{banner_id}/claim", response_model=APIResponse[dict])
async def claim_promo_banner(
    db: DBDependency,
    banner_id: int,
    customer: CurrentCustomer,
):
    """Claim a voucher linked to a promo banner."""
    from app.models.voucher import CustomerVoucher, VoucherDefinition

    banner = await db.get(PromoBanner, banner_id)
    if not banner or not banner.is_active:
        raise HTTPException(status_code=404, detail="Banner not found or inactive")

    voucher_id = banner.voucher_id
    if not voucher_id:
        raise HTTPException(status_code=400, detail="No voucher linked to this banner")

    vd = await db.get(VoucherDefinition, voucher_id)
    if not vd or not vd.is_active:
        raise HTTPException(status_code=400, detail="Linked voucher is no longer active")

    # Check if customer already has this voucher
    existing = await db.execute(
        select(CustomerVoucher).where(
            CustomerVoucher.customer_id == customer.id,
            CustomerVoucher.voucher_definition_id == voucher_id,
            CustomerVoucher.status == "active",
        )
    )
    if existing.scalar_one_or_none():
        return APIResponse(data={"voucher_code": vd.voucher_code, "already_claimed": True})

    import secrets
    # Determine store: prefer customer's last order store, else first active store
    from app.models.order import Order
    last_order = await db.execute(
        select(Order.store_id)
        .where(Order.customer_id == customer.id, Order.deleted_at.is_(None))
        .order_by(Order.created_at.desc())
        .limit(1)
    )
    last_store_id = last_order.scalar_one_or_none()
    if last_store_id:
        store_id = last_store_id
    else:
        first_store = await db.execute(select(Store.id).where(Store.is_active == True).limit(1))
        store_id = first_store.scalar_one_or_none()
        if store_id is None:
            raise HTTPException(status_code=503, detail="No active stores configured")

    cv = CustomerVoucher(
        customer_id=customer.id,
        voucher_definition_id=vd.id,
        store_id=store_id,
        voucher_code=f"{vd.voucher_code}-{secrets.token_hex(4).upper()}",
        status="active",
        voucher_snapshot={
            "display_title": vd.display_title,
            "discount_value": float(vd.discount_value),
            "voucher_type": str(vd.voucher_type),
        },
        expires_at=vd.valid_until or datetime.now(timezone.utc),
        source="promo_banner",
        source_id=banner_id,
    )
    db.add(cv)
    await db.commit()
    await db.refresh(cv)
    return APIResponse(data={"voucher_code": cv.voucher_code, "claimed": True})


# ── Information Cards ──

@router.get("/content/information", response_model=APIResponse[list[InfoCardOut]])
async def list_information_cards(
    db: DBDependency,
    locale: OptionalLocale,
    content_type: str | None = Query(None),
    limit: int = Query(20, ge=1, le=500),
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
    item_dicts = [InfoCardOut.model_validate(i).model_dump() for i in items]
    await merge_translations(db, item_dicts, "information_cards", locale)
    return APIResponse(data=item_dicts)


@router.get("/content/information/{slug}", response_model=APIResponse[InfoCardOut])
async def get_information_card(
    db: DBDependency,
    locale: OptionalLocale,
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
    item_dict = InfoCardOut.model_validate(item).model_dump()
    await translate_single(db, item_dict, "information_cards", locale)
    return APIResponse(data=item_dict)


# ── Product Cards ──

@router.get("/content/products", response_model=APIResponse[list[ProductCardOut]])
async def list_product_cards(
    db: DBDependency,
    locale: OptionalLocale,
    limit: int = Query(20, ge=1, le=500),
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
    item_dicts = [ProductCardOut.model_validate(i).model_dump() for i in items]
    await merge_translations(db, item_dicts, "product_cards", locale)
    return APIResponse(data=item_dicts)


@router.get("/content/products/{slug}", response_model=APIResponse[ProductCardOut])
async def get_product_card(
    db: DBDependency,
    locale: OptionalLocale,
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
    item_dict = ProductCardOut.model_validate(item).model_dump()
    await translate_single(db, item_dict, "product_cards", locale)
    return APIResponse(data=item_dict)


# ── Event Cards ──

@router.get("/content/events", response_model=APIResponse[list[EventCardOut]])
async def list_event_cards(
    db: DBDependency,
    locale: OptionalLocale,
    limit: int = Query(20, ge=1, le=500),
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
    item_dicts = [EventCardOut.model_validate(i).model_dump() for i in items]
    await merge_translations(db, item_dicts, "event_cards", locale)
    return APIResponse(data=item_dicts)


@router.get("/content/events/{slug}", response_model=APIResponse[EventCardOut])
async def get_event_card(
    db: DBDependency,
    locale: OptionalLocale,
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
    item_dict = EventCardOut.model_validate(item).model_dump()
    await translate_single(db, item_dict, "event_cards", locale)
    return APIResponse(data=item_dict)


# ── Legal / System Pages ──

@router.get("/content/legal/{page_key}", response_model=APIResponse[SystemPageOut])
async def get_legal_page(
    db: DBDependency,
    locale: OptionalLocale,
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
    item_dict = SystemPageOut.model_validate(item).model_dump()
    await translate_single(db, item_dict, "system_pages", locale)
    return APIResponse(data=item_dict)


# ── Splash Screen ──

@router.get("/splash", response_model=APIResponse[SplashScreenOut | None])
async def get_active_splash(
    db: DBDependency,
    locale: OptionalLocale,
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
    if not item:
        return APIResponse(data=None)
    item_dict = SplashScreenOut.model_validate(item).model_dump()
    await translate_single(db, item_dict, "splash_screens", locale)
    return APIResponse(data=item_dict)


# ── Config Bootstrap ──

@router.get("/config/bootstrap", response_model=APIResponse[dict])
async def get_config_bootstrap(
    db: DBDependency,
    locale: OptionalLocale,
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
    currency = config.get("currency", "USD")
    delivery_fee = config.get("base_delivery_fee", "0")
    min_order = config.get("minimum_order_amount", "0")

    # Prepare translatable structures
    tier_dicts = [
        {"id": t.id, "display_name": t.display_name, "min_points": t.min_lifetime_points, "color": t.color_hex or "#A0783A"}
        for t in tiers
    ]
    store_dicts = [
        {"id": s.id, "store_name": s.store_name, "slug": s.slug, "address_line_1": s.address_line_1, "city": s.city, "phone_number": s.phone_number, "logo_url": s.logo_url, "latitude": s.latitude, "longitude": s.longitude, "is_active": s.is_active}
        for s in stores
    ]

    await merge_translations(db, tier_dicts, "loyalty_tiers", locale)
    await merge_translations(db, store_dicts, "stores", locale)

    return APIResponse(data={
        "currency": currency,
        "currency_symbol": "RM" if currency == "MYR" else ("$" if currency == "USD" else currency),
        "delivery_fee": float(delivery_fee) if delivery_fee else 0,
        "minimum_order_amount": float(min_order) if min_order else 0,
        "loyalty_tiers": [
            {"name": t["display_name"], "min_points": t["min_points"], "color": t["color"]}
            for t in tier_dicts
        ],
        "stores": [
            {
                "id": s["id"],
                "store_name": s["store_name"],
                "slug": s["slug"],
                "address_line_1": s["address_line_1"],
                "city": s["city"],
                "phone_number": s["phone_number"],
                "logo_url": s["logo_url"],
                "latitude": s["latitude"],
                "longitude": s["longitude"],
                "is_active": s["is_active"],
            }
            for s in store_dicts
        ],
        "features": {
            "wallet_enabled": True,
            "loyalty_enabled": True,
            "reservations_enabled": True,
            "delivery_enabled": config.get("delivery_enabled", "true").lower() == "true",
            "dine_in_enabled": True,
        },
    })
