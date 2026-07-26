"""Public content endpoints for PWA — banners, info cards, products, events, legal, splash."""

from datetime import datetime, timezone
from typing import Annotated
import re

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select

from app.api.routes.deps import DBDependency, OptionalLocale, CurrentCustomer
from app.core.auth_cookies import get_customer_access_token
from app.core.security import decode_token
from app.models.customer import Customer
from app.services.platform_config import PlatformConfigService
from app.services.translation import merge_translations, translate_single
from app.models.info_card import (
    EventCard,
    EventInvite,
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

_optional_bearer = HTTPBearer(auto_error=False)


async def _get_optional_customer(
    request: Request,
    db: DBDependency,
    credentials: HTTPAuthorizationCredentials | None = Depends(_optional_bearer),
) -> Customer | None:
    """Resolve the current customer when a valid token is present, else None.

    Same cookie-first/header-fallback resolution as get_current_customer, but
    never raises — public endpoints use it for personalized-but-anonymous-OK reads.
    """
    token = get_customer_access_token(request)
    if not token and credentials is not None:
        token = credentials.credentials
    if not token:
        return None
    try:
        payload = decode_token(token)
    except Exception:
        return None
    if payload.get("type") != "access":
        return None
    customer_id = int(payload.get("sub", 0))
    if not customer_id:
        return None
    result = await db.execute(select(Customer).where(Customer.id == customer_id))
    customer = result.scalar_one_or_none()
    if customer is None or customer.deleted_at is not None:
        return None
    return customer


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
    customer: Customer | None = Depends(_get_optional_customer),
):
    """Get the current customer's interaction status with a banner.

    Works unauthenticated (all-false state); authenticated customers get their
    real voucher / survey state for the banner's linked voucher or survey.
    """
    item = await db.get(PromoBanner, banner_id)
    if not item:
        raise HTTPException(status_code=404, detail="Banner not found")

    data: dict = {
        "banner_id": banner_id,
        "action_type": item.action_type,
        "survey_completed": False,
        "voucher_claimed": False,
        "voucher_used": False,
        "voucher_code": None,
    }
    if customer is None:
        return APIResponse(data=data)

    if item.voucher_id:
        from app.models.voucher import CustomerVoucher
        # Same lookup as the claim flow, minus the status filter — latest wins
        cv_result = await db.execute(
            select(CustomerVoucher).where(
                CustomerVoucher.customer_id == customer.id,
                CustomerVoucher.voucher_definition_id == item.voucher_id,
            ).order_by(CustomerVoucher.id.desc()).limit(1)
        )
        cv = cv_result.scalar_one_or_none()
        if cv is not None:
            data["voucher_claimed"] = True
            data["voucher_used"] = cv.status in ("used", "expired")
            data["voucher_code"] = cv.voucher_code

    if item.survey_id:
        from app.models.survey import SurveyResponse
        resp_result = await db.execute(
            select(SurveyResponse.id).where(
                SurveyResponse.customer_id == customer.id,
                SurveyResponse.survey_id == item.survey_id,
            ).limit(1)
        )
        data["survey_completed"] = resp_result.scalar_one_or_none() is not None

    return APIResponse(data=data)


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

    # Survey-type banners gate the claim on a completed survey from this customer
    if banner.action_type == "survey" and banner.survey_id:
        from app.models.survey import SurveyResponse
        resp_result = await db.execute(
            select(SurveyResponse).where(
                SurveyResponse.survey_id == banner.survey_id,
                SurveyResponse.customer_id == customer.id,
            )
        )
        if resp_result.scalar_one_or_none() is None:
            raise HTTPException(
                status_code=400,
                detail="Please complete the survey first to claim this reward",
            )

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
            "discount_value": str(vd.discount_value),
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
    request: Request,
    db: DBDependency,
    locale: OptionalLocale,
    slug: str,
):
    """Get a single event card by slug.

    Adds `is_invited` when an authenticated customer requests an invite_only
    event, so the PWA can unlock the RSVP button for invitees.
    """
    stmt = select(EventCard).where(
        EventCard.slug == slug,
        EventCard.is_active.is_(True),
    )
    result = await db.execute(stmt)
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Event card not found")
    item_dict = EventCardOut.model_validate(item).model_dump()
    item_dict["is_invited"] = False
    if item.event_type == "invite_only":
        # Resolve bearer exactly as FastAPI DI would for _get_optional_customer
        customer = await _get_optional_customer(request, db, await _optional_bearer(request))
        if customer is not None:
            invite = await db.execute(
                select(EventInvite).where(
                    EventInvite.event_id == item.id,
                    EventInvite.customer_id == customer.id,
                )
            )
            item_dict["is_invited"] = invite.scalar_one_or_none() is not None
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
    body = item_dict.get("body_text") or ""
    lines = body.splitlines()
    # Drop a leading title-like line (short, no sentence punctuation) that just
    # repeats the document title — e.g. "Terms & Conditions" / "About LOKA Espresso"
    first = lines[0].strip() if lines else ""
    if first and len(first) <= 40 and not any(c in first for c in ".!?"):  # looks like a repeated title
        body = "\n".join(lines[1:]).lstrip()
    item_dict["sections"] = _parse_legal_sections(body, locale)
    return APIResponse(data=item_dict)


_SECTION_HEAD = re.compile(r"^(\d+)\.\s+(.+?)\s*$")


_INTRO_HEADINGS = {"ms": "Pengenalan", "zh": "简介", "ta": "அறிமுகம்", "tr": "Giriş"}


def _parse_legal_sections(body: str, locale: str | None = None) -> list[dict]:
    """Split legal body_text into structured sections on 'N. Heading' boundaries.

    Text before the first numbered heading becomes an intro section so the PWA
    can render a proper table of contents with collapsible sections.
    """
    if not body:
        return []
    sections: list[dict] = []
    current: dict | None = None
    for line in body.splitlines():
        m = _SECTION_HEAD.match(line.strip())
        if m:
            current = {"heading": f"{m.group(1)}. {m.group(2)}", "body": ""}
            sections.append(current)
        elif current is not None:
            current["body"] += line + "\n"
        else:
            if not sections:
                intro = _INTRO_HEADINGS.get(locale or "", "Introduction")
                sections.append({"heading": intro, "body": ""})
            sections[0]["body"] += line + "\n"
    for s in sections:
        s["body"] = s["body"].strip()
    return [s for s in sections if s["body"] or s["heading"]]


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
    config_svc = PlatformConfigService(db)
    currency = await config_svc.get_str("app.currency", config.get("currency", "USD"))
    currency_symbol = await config_svc.get_str("app.currency_symbol", "RM" if currency == "MYR" else ("$" if currency == "USD" else currency))
    delivery_fee = config.get("base_delivery_fee", "0")
    min_order = config.get("minimum_order_amount", "0")

    # Platform-level values consumed by the PWA configStore (only keys with a
    # real backend source are emitted)
    points_per_currency = await config_svc.get_int("loyalty.points_per_currency", default=1)
    referral_reward_points = await config_svc.get_int("loyalty.referral_reward_points", default=50)
    stripe_on = await config_svc.get_bool("stripe.enabled", default=False)
    hitpay_on = await config_svc.get_bool("hitpay.enabled", default=False)
    payment_gateway_provider = "stripe" if stripe_on else ("hitpay" if hitpay_on else None)
    pickup_lead_minutes = stores[0].pickup_lead_minutes if stores else 15

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
        "currency_symbol": currency_symbol,
        "delivery_fee": str(delivery_fee) if delivery_fee else "0",
        "minimum_order_amount": str(min_order) if min_order else "0",
        "pickup_lead_minutes": pickup_lead_minutes,
        "earn_rate": points_per_currency,
        "loyalty_points_per_rmse": points_per_currency,
        "referral_reward_points": referral_reward_points,
        "payment_gateway_provider": payment_gateway_provider,
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
