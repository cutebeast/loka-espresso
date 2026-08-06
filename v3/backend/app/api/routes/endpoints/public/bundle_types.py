"""Public bundle type endpoints (no auth required)."""

from fastapi import APIRouter
from sqlalchemy import select

from app.api.routes.deps import DBDependency, OptionalLocale
from app.models.bundle_product import BundleType
from app.schemas.base import APIResponse
from app.services.translation import merge_translations

router = APIRouter(tags=["public — bundle types"])


@router.get("/bundle-types", response_model=APIResponse[dict])
async def list_bundle_types(db: DBDependency, locale: OptionalLocale):
    """List active bundle types ordered by display_order.

    The PWA uses `mechanic` to route each bundle to the right selection sheet.
    """
    result = await db.execute(
        select(BundleType).where(
            BundleType.is_active.is_(True),
            BundleType.deleted_at.is_(None),
        ).order_by(BundleType.display_order, BundleType.id)
    )
    bundle_types = [
        {"id": t.id, "type_key": t.type_key, "name": t.name, "description": t.description, "mechanic": t.mechanic}
        for t in result.scalars().all()
    ]
    await merge_translations(db, bundle_types, "bundle_types", locale)
    return APIResponse(data={"bundle_types": bundle_types})
