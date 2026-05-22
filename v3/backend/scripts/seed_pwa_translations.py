"""Seed PWA UI labels from en.json into the translations table.

Usage:
    cd v3/backend
    python3 scripts/seed_pwa_translations.py
"""

import json, sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import asyncio
from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.models.translation import Translation
from datetime import datetime, timezone


EN_JSON_PATH = os.path.join(
    os.path.dirname(__file__), "..", "..", "customer-pwa", "src", "locales", "en.json"
)

NAMESPACE = "pwa-ui"
BATCH_SIZE = 100


def flatten_dict(d: dict, prefix: str = "") -> list[dict]:
    """Recursively flatten nested dict into translation key/value pairs."""
    entries = []
    for key, value in d.items():
        full_key = f"{prefix}.{key}" if prefix else key
        if isinstance(value, dict):
            entries.extend(flatten_dict(value, full_key))
        elif isinstance(value, str):
            entries.append({"key": full_key, "source_text": value, "translated_text": value})
    return entries


async def seed():
    with open(EN_JSON_PATH, "r") as f:
        data = json.load(f)

    entries = flatten_dict(data)
    print(f"Found {len(entries)} translatable keys in en.json")

    async with AsyncSessionLocal() as db:
        count_inserted = 0
        count_skipped = 0
        now = datetime.now(timezone.utc)

        for entry in entries:
            key = entry["key"]
            text = entry["source_text"]

            # Check if already exists
            result = await db.execute(
                select(Translation).where(
                    Translation.namespace == NAMESPACE,
                    Translation.translation_key == key,
                    Translation.locale == "en",
                )
            )
            if result.scalar_one_or_none():
                count_skipped += 1
                continue

            # Insert English source record
            db.add(Translation(
                namespace=NAMESPACE,
                translation_key=key,
                locale="en",
                translated_text=text,
                source_text=text,
                table_name="pwa_ui",
                record_id=0,
                column_name="label",
                is_auto_translated=False,
                created_at=now,
                updated_at=now,
            ))
            count_inserted += 1

            if count_inserted % BATCH_SIZE == 0:
                await db.commit()
                print(f"  Inserted {count_inserted} records...")

        await db.commit()
        print(f"\nDone. Inserted {count_inserted} new records, skipped {count_skipped} existing.")

        # Insert fallback records for non-en locales (NULL translated_text → API falls back to en)
        locales = ["ms", "zh", "ta", "tr"]
        fallback_inserted = 0
        for locale in locales:
            # Get all en keys that don't have a record for this locale
            en_keys = await db.execute(
                select(Translation.id, Translation.translation_key, Translation.source_text)
                .where(Translation.namespace == NAMESPACE, Translation.locale == "en")
            )
            for t_id, t_key, t_source in en_keys.all():
                existing = await db.execute(
                    select(Translation.id).where(
                        Translation.namespace == NAMESPACE,
                        Translation.translation_key == t_key,
                        Translation.locale == locale,
                    )
                )
                if existing.scalar_one_or_none():
                    continue

                db.add(Translation(
                    namespace=NAMESPACE,
                    translation_key=t_key,
                    locale=locale,
                    translated_text="",  # empty = fallback to EN at query time
                    source_text=t_source,
                    table_name="pwa_ui",
                    record_id=0,
                    column_name="label",
                    is_auto_translated=False,
                    created_at=now,
                    updated_at=now,
                ))
                fallback_inserted += 1

                if fallback_inserted % BATCH_SIZE == 0:
                    await db.commit()
                    print(f"  {locale}: {fallback_inserted} fallback records...")

            await db.commit()

        print(f"\nTotal fallback records: {fallback_inserted} (empty text, API falls back to EN)")
        print("Seed complete.")


if __name__ == "__main__":
    asyncio.run(seed())
