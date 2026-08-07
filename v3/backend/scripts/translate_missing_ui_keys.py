#!/usr/bin/env python3
"""Fill missing translations for UI namespaces (admin-ui, staff-ui, pwa-ui).

The content cron (translate_missing_content.py) covers DB entities via
MODEL_MAP but NOT the UI-key namespaces. Keys seeded EN-only (new admin/staff
features) otherwise stay English on a zh UI forever.

    cd v3/backend && python3 scripts/translate_missing_ui_keys.py --yes --force-prod
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.models.translation import Translation
from app.services.translation import SUPPORTED_LOCALES, auto_translate_text, SOURCE_LOCALE
from scripts._db_utils import confirm, guard_production

NAMESPACES = ["admin-ui", "staff-ui", "pwa-ui"]


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--yes", action="store_true")
    parser.add_argument("--force-prod", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    guard_production(args.force_prod)
    if not confirm("Fill missing UI-key translations?", args.yes or args.dry_run):
        print("Aborted.")
        return

    async with AsyncSessionLocal() as db:
        for ns in NAMESPACES:
            en_rows = (await db.execute(
                select(Translation).where(
                    Translation.namespace == ns, Translation.locale == SOURCE_LOCALE
                )
            )).scalars().all()
            for loc in SUPPORTED_LOCALES:
                existing = {(t.translation_key) for t in (await db.execute(
                    select(Translation).where(
                        Translation.namespace == ns, Translation.locale == loc
                    )
                )).scalars().all() if (t.translated_text or "").strip()}
                missing = [r for r in en_rows if r.translation_key not in existing]
                if not missing:
                    print(f"[{ns}/{loc}] complete — nothing missing")
                    continue
                print(f"[{ns}/{loc}] {len(missing)} missing")
                written = 0
                for r in missing:
                    if args.dry_run:
                        print(f"  would translate: {r.translation_key}")
                        continue
                    text = (r.source_text or r.translated_text or "").strip()
                    if not text:
                        continue
                    translated, _ = await auto_translate_text(db, text, SOURCE_LOCALE, loc)
                    if not translated or not translated.strip():
                        print(f"  SKIP (provider failed): {r.translation_key}")
                        continue
                    db.add(Translation(
                        namespace=ns,
                        translation_key=r.translation_key,
                        locale=loc,
                        translated_text=translated,
                        source_text=text,
                        table_name="",
                        record_id=0,
                        column_name="",
                        is_auto_translated=True,
                    ))
                    written += 1
                await db.commit()
                print(f"[{ns}/{loc}] wrote {written}")


if __name__ == "__main__":
    asyncio.run(main())
