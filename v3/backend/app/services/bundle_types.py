"""Bundle type mechanic resolution.

bundle_products.bundle_type stores a type_key from the bundle_types table.
The order engine and admin validation branch on the *mechanic* behind that
key, so admin-invented keys behave like the mechanic they were assigned.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.bundle_product import BundleType

VALID_MECHANICS = ("combo", "pick_x", "multi_course")


async def resolve_bundle_mechanic(db: AsyncSession, bundle_type: str) -> str:
    """Resolve the pricing/selection mechanic for a bundle type key.

    The two built-in engine mechanics short-circuit without a DB hit;
    anything else is looked up in bundle_types (covering legacy labels like
    'value_meal' and admin-invented keys) and falls back to 'combo'.
    """
    if bundle_type in ("multi_course", "pick_x"):
        return bundle_type
    result = await db.execute(
        select(BundleType.mechanic).where(
            BundleType.type_key == bundle_type,
            BundleType.deleted_at.is_(None),
        )
    )
    mechanic = result.scalar_one_or_none()
    return mechanic if mechanic in VALID_MECHANICS else "combo"


async def bundle_type_exists(db: AsyncSession, type_key: str) -> bool:
    """True when type_key is registered in bundle_types (not soft-deleted)."""
    result = await db.execute(
        select(BundleType.id).where(
            BundleType.type_key == type_key,
            BundleType.deleted_at.is_(None),
        )
    )
    return result.scalar_one_or_none() is not None
