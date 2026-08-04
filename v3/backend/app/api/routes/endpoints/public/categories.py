"""Public bundle/event category endpoints (no auth required)."""

from fastapi import APIRouter
from sqlalchemy import select

from app.api.routes.deps import DBDependency, OptionalLocale
from app.models.bundle_product import BundleCategory
from app.models.menu import EventCategory
from app.schemas.base import APIResponse
from app.services.translation import merge_translations

router = APIRouter(tags=["public — categories"])


@router.get("/bundle-categories", response_model=APIResponse[dict])
async def list_bundle_categories(db: DBDependency, locale: OptionalLocale):
    """List active bundle categories ordered by display_order."""
    result = await db.execute(
        select(BundleCategory).where(
            BundleCategory.is_active.is_(True),
            BundleCategory.deleted_at.is_(None),
        ).order_by(BundleCategory.display_order, BundleCategory.id)
    )
    categories = [
        {"id": c.id, "name": c.name, "slug": c.slug, "display_order": c.display_order, "is_active": c.is_active}
        for c in result.scalars().all()
    ]
    await merge_translations(db, categories, "bundle_categories", locale)
    return APIResponse(data={"categories": categories})


@router.get("/event-categories", response_model=APIResponse[dict])
async def list_event_categories(db: DBDependency, locale: OptionalLocale):
    """List active event categories ordered by display_order."""
    result = await db.execute(
        select(EventCategory).where(
            EventCategory.is_active.is_(True),
            EventCategory.deleted_at.is_(None),
        ).order_by(EventCategory.display_order, EventCategory.id)
    )
    categories = [
        {"id": c.id, "name": c.name, "slug": c.slug, "display_order": c.display_order, "is_active": c.is_active}
        for c in result.scalars().all()
    ]
    await merge_translations(db, categories, "event_categories", locale)
    return APIResponse(data={"categories": categories})
