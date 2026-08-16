#!/usr/bin/env python3
"""Fill missing admin-ui translations (ms/zh/ta/tr) via DeepSeek.

Reads all admin-ui/en keys and batch-translates the missing ones per locale
(25 keys per DeepSeek call, JSON in/out). Idempotent — only fills keys that
don't yet exist in the target locale, so re-runs are cheap.

Usage:
    cd v3/backend && python3 ../scripts/fill_admin_ui_locales.py [--locale ms] [--batch 25] [--dry-run]
"""

from __future__ import annotations

import argparse
import asyncio
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.models.translation import Translation
from app.services.translation import _get_translation_creds
from scripts._db_utils import confirm, guard_production

NAMESPACE = "admin-ui"
LOCALES = ["ms", "zh", "ta", "tr"]
LOCALE_NAMES = {"ms": "Bahasa Melayu", "zh": "Simplified Chinese", "ta": "Tamil", "tr": "Turkish"}

PROMPT = """You are translating admin-panel UI strings for Loka Espresso, a Malaysian café loyalty platform (English → {lang}).

Translate each numbered string naturally for an admin dashboard.

TERMINOLOGY RULES — keep these in English, never translate them: brand/tier names (Loka, Loka Espresso, Bloom, Origin, Reserve), technical/URL terms (Slug, SKU, QR, QR Code, URL, API, ID, POS, KDS, PWA, OTP, CSV, PDF, RM, BYOT, SST, HitPay, Stripe, Twilio, DeepSeek, Resend), and standard dashboard terms where the English is clearer (e.g. Dashboard, Settings). "Slug" always means the URL slug — it is NOT an animal.

Keep {{placeholders}} and punctuation. Keep translations concise (dashboard labels, not sentences).

Strings (JSON):
{items}

Reply with ONLY a JSON object mapping each number to its translation, no markdown:
{{"1": "...", "2": "..."}}"""


async def _translate_batch(pairs: list[tuple[int, str]], locale: str, model: str) -> dict[int, str]:
    from httpx import AsyncClient

    creds = await _get_translation_creds()
    api_key = creds.get("deepseek_key", "")
    if not api_key:
        raise RuntimeError("DeepSeek API key not configured")
    items = json.dumps({str(i + 1): text for i, (_, text) in enumerate(pairs)}, ensure_ascii=False)
    prompt = PROMPT.format(lang=LOCALE_NAMES[locale], items=items)
    async with AsyncClient(timeout=180) as client:
        resp = await client.post(
            "https://api.deepseek.com/v1/chat/completions",
            json={"model": model, "messages": [{"role": "user", "content": prompt}], "max_tokens": 4000, "temperature": 0.1},
            headers={"Authorization": f"Bearer {api_key}"},
        )
    if resp.status_code != 200:
        raise RuntimeError(f"DeepSeek HTTP {resp.status_code}: {resp.text[:200]}")
    content = resp.json()["choices"][0]["message"]["content"].strip()
    content = re.sub(r"^```(?:json)?|```$", "", content, flags=re.MULTILINE).strip()
    m = re.search(r"\{.*\}", content, re.S)
    data = json.loads(m.group(0) if m else content)
    return {pairs[int(k) - 1][0]: v for k, v in data.items() if str(k).isdigit() and 1 <= int(k) <= len(pairs)}


async def main():
    parser = argparse.ArgumentParser(description="Fill missing admin-ui translations via DeepSeek")
    parser.add_argument("--yes", action="store_true")
    parser.add_argument("--force-prod", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--locale", choices=LOCALES, default=None)
    parser.add_argument("--namespace", default=NAMESPACE, help="Translation namespace (default: admin-ui)")
    parser.add_argument("--batch", type=int, default=25)
    args = parser.parse_args()

    guard_production(args.force_prod)
    if not confirm("Fill missing admin-ui translations via DeepSeek?", args.yes):
        print("Aborted.")
        return

    async with AsyncSessionLocal() as db:
        await _get_translation_creds(db)
        model = (await _get_translation_creds(db)).get("deepseek_model", "deepseek-v4-flash")

        en_rows = (await db.execute(
            select(Translation.translation_key, Translation.translated_text).where(
                Translation.namespace == args.namespace, Translation.locale == "en"
            )
        )).all()
        en_map = {k: v for k, v in en_rows}
        print(f"{args.namespace}/en: {len(en_map)} keys")

        for locale in ([args.locale] if args.locale else LOCALES):
            existing = set((await db.execute(
                select(Translation.translation_key).where(
                    Translation.namespace == args.namespace, Translation.locale == locale
                )
            )).scalars().all())
            missing = [(k, v) for k, v in sorted(en_map.items()) if k not in existing]
            print(f"[{locale}] missing: {len(missing)}")
            if not missing:
                continue
            done = 0
            for start in range(0, len(missing), args.batch):
                batch = missing[start:start + args.batch]
                try:
                    translated = await _translate_batch(batch, locale, model)
                except Exception as e:
                    print(f"  batch {start // args.batch + 1} failed: {e}")
                    continue
                for key, text in translated.items():
                    if args.dry_run:
                        continue
                    src = dict(en_map)[key]
                    from sqlalchemy.dialects.postgresql import insert as pg_insert
                    await db.execute(
                        pg_insert(Translation)
                        .values(
                            namespace=args.namespace,
                            translation_key=key,
                            locale=locale,
                            translated_text=text,
                            source_text=src,
                            is_auto_translated=True,
                        )
                        .on_conflict_do_update(
                            index_elements=["namespace", "translation_key", "locale"],
                            set_={"translated_text": text, "source_text": src, "is_auto_translated": True},
                        )
                    )
                await db.commit()
                done += len(translated)
                print(f"  [{locale}] {done}/{len(missing)}")
            print(f"[{locale}] wrote {done} translations{' (dry-run)' if args.dry_run else ''}")


if __name__ == "__main__":
    asyncio.run(main())
