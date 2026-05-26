"""
Fast batch-translate all empty pwa-ui translations with concurrency.
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.core.database import AsyncSessionLocal
from app.models.translation import Translation
from app.services.translation import auto_translate_text
from sqlalchemy import select, update

LOCALES = ["ta", "tr", "zh"]  # ms is mostly done (668/794)
CONCURRENCY = 10


async def translate_locale(db_factory, locale: str):
    async with db_factory() as db:
        result = await db.execute(
            select(Translation)
            .where(
                Translation.namespace == "pwa-ui",
                Translation.locale == locale,
                (Translation.translated_text.is_(None)) | (Translation.translated_text == ""),
            )
        )
        records = result.scalars().all()

    total = len(records)
    if total == 0:
        print(f"[{locale}] Already complete")
        return

    print(f"[{locale}] {total} records to translate...")
    done = 0
    errors = 0

    async def translate_one(record):
        nonlocal done, errors
        source = record.source_text or ""
        if not source.strip():
            return
        try:
            async with db_factory() as tdb:
                translated, _ = await auto_translate_text(tdb, source, "en", locale)
                async with db_factory() as wdb:
                    await wdb.execute(
                        update(Translation)
                        .where(Translation.id == record.id)
                        .values(translated_text=translated)
                    )
                    await wdb.commit()
            done += 1
            if done % 100 == 0 or done == total:
                print(f"  [{locale}] {done}/{total} ({errors} errors)")
        except Exception:
            errors += 1

    sem = asyncio.Semaphore(CONCURRENCY)

    async def bounded(record):
        async with sem:
            await translate_one(record)

    await asyncio.gather(*[bounded(r) for r in records])
    print(f"[{locale}] Done: {done} translated, {errors} errors")


async def finish_ms():
    """Translate remaining MS records (~126)"""
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Translation)
            .where(
                Translation.namespace == "pwa-ui",
                Translation.locale == "ms",
                (Translation.translated_text.is_(None)) | (Translation.translated_text == ""),
            )
        )
        records = result.scalars().all()
    total = len(records)
    if total == 0:
        print("[ms] Already complete")
        return
    print(f"[ms] {total} remaining...")
    done = 0
    sem = asyncio.Semaphore(CONCURRENCY)
    async def one(r):
        nonlocal done
        s = r.source_text or ""
        if not s.strip(): return
        try:
            async with AsyncSessionLocal() as tdb:
                t, _ = await auto_translate_text(tdb, s, "en", "ms")
                async with AsyncSessionLocal() as wdb:
                    await wdb.execute(update(Translation).where(Translation.id == r.id).values(translated_text=t))
                    await wdb.commit()
            done += 1
            if done % 50 == 0 or done == total:
                print(f"  [ms] {done}/{total}")
        except: pass
    await asyncio.gather(*[asyncio.wait_for(one(r), timeout=30) for r in records])
    print(f"[ms] Done: {done}/{total}")


async def main():
    factory = AsyncSessionLocal
    await finish_ms()
    for loc in LOCALES:
        await translate_locale(factory, loc)


if __name__ == "__main__":
    asyncio.run(main())
