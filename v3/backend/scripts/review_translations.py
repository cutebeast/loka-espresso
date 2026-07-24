#!/usr/bin/env python3
"""Weekly AI translation review using DeepSeek pro (deepseek-v4-pro).

Reviews auto-generated translations against their English source and fixes
clear mistranslations (e.g. "Single Origin Bean" -> "Kacang Asal Tunggal").

Safety rules:
- Only rows with is_auto_translated=true are reviewed. Manual corrections
  (is_auto_translated=false) are NEVER touched.
- Rows the reviewer marks OK are left alone; only explicit fixes are applied.
- Everything is logged to backend/logs/translation_review_<timestamp>.log.

Usage:
    cd v3/backend && python3 scripts/review_translations.py --yes --force-prod
    python3 scripts/review_translations.py --yes --force-prod --dry-run        # report only
    python3 scripts/review_translations.py --yes --force-prod --namespace menu --batch 25

Suggested cron (weekly, Sunday 03:17):
    17 3 * * 0 cd /root/fnb-super-app/v3/backend && .venv/bin/python3 scripts/review_translations.py --yes --force-prod >> logs/translation_review_cron.log 2>&1
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select, text as sql_text

from app.core.database import AsyncSessionLocal
from app.models.translation import Translation
from app.services.translation import (
    SOURCE_LOCALE,
    _compute_hash,
    _get_translation_creds,
)
from scripts._db_utils import confirm, guard_production

LOG_DIR = Path(__file__).resolve().parent.parent / "logs"
BATCH_DEFAULT = 25

LOCALE_NAMES = {"ms": "Bahasa Melayu", "zh": "Simplified Chinese", "ta": "Tamil", "tr": "Turkish"}

# table_name -> (model table for source lookup is resolved via raw SQL per table)
SOURCE_QUERIES = {
    "menu_categories": "SELECT category_name AS item_name, description FROM menu_categories WHERE id = :id",
    "menu_items": "SELECT item_name, description FROM menu_items WHERE id = :id",
    "menu_modifier_groups": "SELECT group_name AS item_name, NULL AS description FROM menu_modifier_groups WHERE id = :id",
    "menu_modifier_options": "SELECT option_name AS item_name, NULL AS description FROM menu_modifier_options WHERE id = :id",
}

PROMPT_TEMPLATE = """You are reviewing {lang} translations for the menu of Loka Espresso, a halal Malaysian café serving specialty coffee, Turkish food and pastries.

For EACH numbered item, decide whether the {lang} translation is correct and natural for a café menu (proper F&B vocabulary, local usage, no wrong-word traps like translating coffee "beans" as nuts/legumes, brand names kept intact).

Items (JSON):
{items}

Reply with ONLY a JSON array, one object per item, no markdown fences:
[{{"n": 1, "ok": true}}, {{"n": 2, "ok": false, "fix": "corrected {lang} text"}}]
Include every item number. Keep "fix" concise (menu text, not explanations)."""

ADMIN_UI_PROMPT_TEMPLATE = """You are reviewing {lang} translations of admin-dashboard UI strings for Loka Espresso, a Malaysian café loyalty platform.

For EACH numbered item (English source + current {lang} translation), decide whether the translation is correct and natural for an admin panel. Watch especially for:
- Technical terms wrongly translated (e.g. "Slug" = URL slug, NOT the animal — keep as "Slug"; also keep SKU, QR, URL, API, ID, POS, KDS, PWA, OTP, CSV, RM, BYOT, SST, Stripe, HitPay, Twilio, DeepSeek in English)
- Brand/tier names (Loka, Loka Espresso, Bloom, Origin, Reserve) — never translate
- Overly literal or wrong-word-trap translations (common MT errors in admin vocabulary)

Items (JSON):
{items}

Reply with ONLY a JSON array, one object per item, no markdown fences:
[{{"n": 1, "ok": true}}, {{"n": 2, "ok": false, "fix": "corrected {lang} text"}}]
Include every item number. Keep "fix" concise (dashboard label, not a sentence)."""


async def _resolve_source(db, row: Translation) -> str | None:
    """English source for a translation row: source_text column, else the live record."""
    if row.source_text:
        return row.source_text
    query = SOURCE_QUERIES.get(row.table_name)
    if not query:
        return None
    result = await db.execute(sql_text(query), {"id": row.record_id})
    rec = result.mappings().first()
    if not rec:
        return None
    col = row.column_name or ("description" if row.translation_key.endswith(".description") else "item_name")
    return rec.get(col) or rec.get("item_name")


async def _review_batch(rows: list[dict], locale: str, model: str, namespace: str = "menu") -> dict[int, dict]:
    lang = LOCALE_NAMES.get(locale, locale)
    items_json = json.dumps(
        [{"n": i + 1, "en": r["source"], "lang": r["current"]} for i, r in enumerate(rows)],
        ensure_ascii=False,
    )
    template = PROMPT_TEMPLATE if namespace == "menu" else ADMIN_UI_PROMPT_TEMPLATE
    prompt = template.format(lang=lang, items=items_json)
    raw = await _call_raw(prompt, model)
    if not raw:
        return {}
    raw = re.sub(r"^```(?:json)?|```$", "", raw.strip(), flags=re.MULTILINE).strip()
    try:
        verdicts = json.loads(raw)
    except json.JSONDecodeError:
        m = re.search(r"\[.*\]", raw, re.S)
        if not m:
            return {}
        try:
            verdicts = json.loads(m.group(0))
        except json.JSONDecodeError:
            return {}
    return {int(v["n"]): v for v in verdicts if isinstance(v, dict) and "n" in v}


async def _call_raw(prompt: str, model: str) -> str | None:
    """Raw DeepSeek chat completion (no translation prompt wrapper)."""
    from httpx import AsyncClient

    creds = await _get_translation_creds()
    api_key = creds.get("deepseek_key", "")
    if not api_key:
        return None
    try:
        async with AsyncClient(timeout=120) as client:
            resp = await client.post(
                "https://api.deepseek.com/v1/chat/completions",
                json={
                    "model": model,
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": 4000,
                    "temperature": 0.1,
                },
                headers={"Authorization": f"Bearer {api_key}"},
            )
            if resp.status_code == 200:
                choices = resp.json().get("choices", [])
                if choices:
                    return choices[0].get("message", {}).get("content", "").strip()
    except Exception as e:
        print(f"DeepSeek review API error: {e}")
    return None


async def main():
    parser = argparse.ArgumentParser(description="AI review of auto-translations (DeepSeek pro)")
    parser.add_argument("--yes", action="store_true")
    parser.add_argument("--force-prod", action="store_true")
    parser.add_argument("--dry-run", action="store_true", help="Report only, no DB writes")
    parser.add_argument("--namespace", default="menu", help="Translation namespace to review (default: menu)")
    parser.add_argument("--batch", type=int, default=BATCH_DEFAULT, help="Rows per DeepSeek call")
    parser.add_argument("--model", default=None, help="Override review model (default: deepseek_fallback_model config = deepseek-v4-pro)")
    parser.add_argument("--limit", type=int, default=0, help="Only review the first N rows (testing)")
    parser.add_argument("--include-manual", action="store_true", help="Also review rows with is_auto_translated=false (manual/legacy translations)")
    parser.add_argument("--locale", default=None, choices=["ms", "zh", "ta", "tr"], help="Only review one locale")
    args = parser.parse_args()

    guard_production(args.force_prod)
    if not confirm(f"Review {args.namespace!r} auto-translations with DeepSeek pro (dry_run={args.dry_run})?", args.yes):
        print("Aborted.")
        return

    LOG_DIR.mkdir(exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    log_file = LOG_DIR / f"translation_review_{stamp}.log"
    file_handler = logging.FileHandler(log_file)
    file_handler.setFormatter(logging.Formatter("%(message)s"))
    logger = logging.getLogger("translation_review")
    logger.setLevel(logging.INFO)
    logger.addHandler(file_handler)
    logger.addHandler(logging.StreamHandler(sys.stdout))

    async with AsyncSessionLocal() as db:
        await _get_translation_creds(db)  # prime creds cache
        model = args.model or (await _get_translation_creds(db)).get("deepseek_fallback_model", "deepseek-v4-pro")

        where_clauses = [Translation.namespace == args.namespace]
        if not args.include_manual:
            where_clauses.append(Translation.is_auto_translated.is_(True))
        if args.locale:
            where_clauses.append(Translation.locale == args.locale)
        result = await db.execute(
            select(Translation).where(*where_clauses).order_by(Translation.locale, Translation.id)
        )
        rows_all = result.scalars().all()
        if args.limit:
            rows_all = rows_all[: args.limit]
        logger.info(f"Reviewing {len(rows_all)} auto-translated rows in namespace={args.namespace!r} with {model}")

        # Group by locale, resolve sources
        by_locale: dict[str, list[dict]] = {}
        skipped = 0
        for row in rows_all:
            source = await _resolve_source(db, row)
            if not source:
                skipped += 1
                continue
            by_locale.setdefault(row.locale, []).append({
                "id": row.id, "source": source, "current": row.translated_text,
                "key": row.translation_key,
            })
        if skipped:
            logger.info(f"  ({skipped} rows skipped — source record no longer exists)")

        total_fixes = 0
        for locale, rows in sorted(by_locale.items()):
            for start in range(0, len(rows), args.batch):
                batch = rows[start:start + args.batch]
                verdicts = await _review_batch(batch, locale, model, namespace=args.namespace)
                for i, entry in enumerate(batch, 1):
                    verdict = verdicts.get(i)
                    if not verdict or verdict.get("ok", True):
                        continue
                    fix = (verdict.get("fix") or "").strip()
                    if not fix or fix == entry["current"]:
                        continue
                    total_fixes += 1
                    logger.info(f"FIX [{locale}] {entry['key']}\n  was: {entry['current']}\n  new: {fix}\n  src: {entry['source']}")
                    if not args.dry_run:
                        await db.execute(
                            sql_text("UPDATE translations SET translated_text = :fix, updated_at = now() WHERE id = :id"),
                            {"fix": fix, "id": entry["id"]},
                        )
                        # Keep the raw-text cache consistent so future lookups serve the fix.
                        await db.execute(
                            sql_text(
                                "UPDATE translation_cache SET translated_text = :fix "
                                "WHERE hash = :hash AND target_locale = :locale"
                            ),
                            {"fix": fix, "hash": _compute_hash(SOURCE_LOCALE, locale, entry["source"]), "locale": locale},
                        )
        if not args.dry_run:
            await db.commit()

        logger.info(f"Review complete: {total_fixes} fix(es) {'proposed (dry-run)' if args.dry_run else 'applied'}. Log: {log_file}")


if __name__ == "__main__":
    asyncio.run(main())
