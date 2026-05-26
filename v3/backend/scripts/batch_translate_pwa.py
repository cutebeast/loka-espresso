"""
Batch-translate all empty pwa-ui translations.
Reads from DB, calls the translate service directly, updates DB.
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.core.database import AsyncSessionLocal
from app.models.translation import Translation
from app.services.translation import auto_translate_text
from sqlalchemy import select, update

LOCALES = ["ms", "zh", "ta", "tr"]
BATCH_SIZE = 10


async def translate_all():
    async with AsyncSessionLocal() as db:
        for locale in LOCALES:
            # Find all pwa-ui records with empty translated_text for this locale
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
                print(f"[{locale}] Already complete — 0 untranslated")
                continue

            print(f"[{locale}] Translating {total} records...")
            batch_count = 0
            errors = 0

            for i, record in enumerate(records):
                source = record.source_text or ""
                if not source.strip():
                    continue

                try:
                    translated, was_cached = await auto_translate_text(
                        db, source, "en", locale
                    )
                    # Use a new session per update to avoid long transactions
                    async with AsyncSessionLocal() as write_db:
                        await write_db.execute(
                            update(Translation)
                            .where(Translation.id == record.id)
                            .values(translated_text=translated)
                        )
                        await write_db.commit()
                    batch_count += 1

                    if (i + 1) % 50 == 0 or (i + 1) == total:
                        print(f"  [{locale}] {i + 1}/{total} ({errors} errors) — last: {source[:30]} → {translated[:30]}")
                except Exception as e:
                    errors += 1
                    if errors <= 3:
                        print(f"  [{locale}] Error on '{source[:40]}': {e}")

            print(f"[{locale}] Done: {batch_count} translated, {errors} errors")


if __name__ == "__main__":
    asyncio.run(translate_all())
