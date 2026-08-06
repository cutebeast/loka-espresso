"""Probe bundle_types feature: CRUD round-trip + mechanic resolution."""
import asyncio

from sqlalchemy import select, delete

from app.core.database import AsyncSessionLocal
from app.models.bundle_product import BundleType
from app.services.bundle_types import resolve_bundle_mechanic, bundle_type_exists
from app.services.translation import TRANSLATABLE_ENTITIES, TABLE_TO_NAMESPACE


async def main():
    async with AsyncSessionLocal() as db:
        # Seed check
        rows = (await db.execute(select(BundleType).order_by(BundleType.display_order))).scalars().all()
        print("seeded:", [(r.type_key, r.mechanic, r.display_order) for r in rows])

        # CRUD round-trip
        bt = BundleType(type_key="_probe_deal", name="Probe Deal", description="temp", mechanic="pick_x", display_order=99)
        db.add(bt)
        await db.commit()
        await db.refresh(bt)
        print("created id:", bt.id, "created_at set:", bt.created_at is not None)
        bt.name = "Probe Deal v2"
        await db.commit()
        got = await db.get(BundleType, bt.id)
        print("updated name:", got.name)
        print("exists(_probe_deal):", await bundle_type_exists(db, "_probe_deal"))
        print("mechanic(_probe_deal):", await resolve_bundle_mechanic(db, "_probe_deal"))
        await db.execute(delete(BundleType).where(BundleType.id == bt.id))
        await db.commit()
        print("deleted:", (await db.get(BundleType, bt.id)) is None)

        # Mechanic resolution matrix
        for key in ("combo", "pick_x", "multi_course", "value_meal", "unknown_xyz"):
            print(f"resolve({key!r}) ->", await resolve_bundle_mechanic(db, key))

    print("TRANSLATABLE_ENTITIES[bundle_types]:", TRANSLATABLE_ENTITIES.get("bundle_types"))
    print("TABLE_TO_NAMESPACE[bundle_types]:", TABLE_TO_NAMESPACE.get("bundle_types"))


asyncio.run(main())
