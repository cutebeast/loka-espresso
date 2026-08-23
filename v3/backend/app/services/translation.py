"""Translation service layer — DeepL + DeepSeek v4 Pro integration, content merging, CRUD hooks."""

import asyncio
import hashlib
import logging
from datetime import datetime, timedelta, timezone

from httpx import AsyncClient
from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm.exc import StaleDataError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.translation import Translation, TranslationCache

# Active translation targets. Business decision (2026-08-07): launch with
# English + Simplified Chinese only. Bahasa Melayu may be re-enabled later;
# ta/tr were dropped. Existing ms/ta/tr rows stay in the DB — re-adding a
# locale here resumes auto-translation for it without reseeding.
SUPPORTED_LOCALES = ["zh"]
SOURCE_LOCALE = "en"

import threading

_translation_stats = threading.local()

logger = logging.getLogger(__name__)


def _get_cache_stats_ctx():
    """Return per-thread cache counters, initialising on first access."""
    if not hasattr(_translation_stats, "hits"):
        _translation_stats.hits = 0
        _translation_stats.misses = 0
    return _translation_stats

# Config keys stored in platform_config table
TRANSLATION_CONFIG_KEYS = [
    "integration.deepseek_api_key",
    "integration.deepseek_model",
    "integration.deepseek_fallback_model",
]

_creds_cache: dict[str, str] | None = None
_creds_cache_ts: float = 0


def clear_translation_creds_cache() -> None:
    """Invalidate the in-memory translation credentials cache."""
    global _creds_cache, _creds_cache_ts
    _creds_cache = None
    _creds_cache_ts = 0


async def _get_translation_creds(db: AsyncSession | None = None) -> dict[str, str]:
    """Read translation API credentials from platform_config table."""
    global _creds_cache, _creds_cache_ts
    import time
    # Cache for 60 seconds to avoid DB hits on every translate call
    now = time.time()
    if _creds_cache is not None and (now - _creds_cache_ts) < 60:
        return _creds_cache

    if db is None:
        return _creds_cache or {}

    try:
        from app.models.platform import PlatformConfig
        result = await db.execute(
            select(PlatformConfig).where(
                PlatformConfig.config_key.in_(TRANSLATION_CONFIG_KEYS)
            )
        )
        rows = {r.config_key: str(r.config_value or "") for r in result.scalars().all()}
        _creds_cache = {
            "deepseek_key": rows.get("integration.deepseek_api_key", ""),
            "deepseek_model": rows.get("integration.deepseek_model", "deepseek-v4-flash"),
            "deepseek_fallback_model": rows.get("integration.deepseek_fallback_model", "deepseek-v4-pro"),
        }
        _creds_cache_ts = now
    except Exception:
        if _creds_cache is None:
            _creds_cache = {}
    return _creds_cache


def _compute_hash(source_locale: str, target_locale: str, text: str) -> str:
    payload = f"{source_locale}:{target_locale}:{text}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


locale_names = {"zh": "Simplified Chinese"}

# House-style glossary: manually approved translations (is_auto_translated=false)
# injected into every prompt so future AI translations reference the team's
# manual work (terminology + gloss format). Cached 10 min per locale.
_glossary_cache: dict[str, tuple[float, str]] = {}
_GLOSSARY_TTL = 600


async def _get_style_examples(db: AsyncSession | None, target_locale: str) -> str:
    """Build the house-style example block for a target locale from manual rows."""
    import time as _time
    now = _time.time()
    hit = _glossary_cache.get(target_locale)
    if hit and (now - hit[0]) < _GLOSSARY_TTL:
        return hit[1]
    examples = ""
    if db is not None:
        try:
            result = await db.execute(
                select(Translation.source_text, Translation.translated_text)
                .where(
                    Translation.is_auto_translated.is_(False),
                    Translation.locale == target_locale,
                    Translation.column_name.in_(("item_name", "title")),
                    Translation.source_text.isnot(None),
                    Translation.source_text != "",
                )
                .order_by(Translation.updated_at.desc())
                .limit(25)
            )
            lines = [
                f"- {src} → {tr}"
                for src, tr in result.all()
                if src and tr and src.strip() and tr.strip() and src != tr
            ]
            if lines:
                examples = (
                    "HOUSE STYLE EXAMPLES — these are the team's manually approved "
                    "translations. Match their terminology, tone and bracket format "
                    "exactly for similar items:\n" + "\n".join(lines) + "\n\n"
                )
        except Exception:
            examples = ""
    _glossary_cache[target_locale] = (now, examples)
    return examples

# Shared F&B/brand context — injected into every DeepSeek prompt so menu
# translations are domain-accurate (root cause of e.g. "Beyond Coffee" →
# 咖啡之外 instead of 非咖啡饮品).
FNB_CONTEXT = """CONTEXT: Loka Espresso is a halal Turkish coffee house in Pavilion Kuala Lumpur. The text is F&B menu content (item names, categories, modifiers, descriptions) for a real restaurant menu — every translation must read naturally on an F&B menu in Malaysia, never as generic prose.
RULES:
- Translate as FOOD & BEVERAGE menu text, not generic prose — natural menu wording for the target language as used in Malaysia. Use F&B vocabulary (drinks, brewing, pastry, kitchen terms), not literal/dictionary renderings.
- MENU ITEM & DRINK NAMES: keep the original English name and append the translated name in brackets — format "English Name（翻译名）" for Chinese (full-width brackets) and "English Name (Translated Name)" for Malay/Tamil/Turkish. Example: "Tropical Sunrise" → "Tropical Sunrise（热带晨曦）", "Citrus Zing" → "Citrus Zing (Sitrus Segar)". The translated part must convey the FLAVOUR/INGREDIENT feeling of the name, not a robotic literal translation.
- Keep untranslated: brand/tier names (Loka, Loka Espresso, Bloom, Origin, Reserve), Turkish dish names (Gozleme, Pide, Baklava, Kahve, Meze, Shakshuka, Simit), and technical terms (SKU, QR, RM, URL).
- "Beyond Coffee" is a menu category for NON-COFFEE beverages (teas, juices, frappes, other drinks) — translate with the meaning "non-coffee drinks", never literally as "outside/beyond coffee".
- Coffee "beans" are coffee beans (never nuts/legumes); "shot" means an espresso shot; "single origin" refers to single-origin coffee.
- DESCRIPTIONS: translate fully into the target language with appetizing F&B wording; keep brand and Turkish dish names as-is inside descriptions.

"""


async def _call_deepseek(text: str, target_locale: str, model: str | None = None, db: AsyncSession | None = None) -> str | None:
    """Call DeepSeek LLM API. Returns translated text or None."""
    creds = await _get_translation_creds(db)
    api_key = creds.get("deepseek_key", "")
    if model is None:
        model = creds.get("deepseek_model", "deepseek-v4-flash")
    if not api_key:
        return None
    lang = locale_names.get(target_locale, target_locale)
    style_examples = await _get_style_examples(db, target_locale)
    prompt = (
        FNB_CONTEXT
        + style_examples
        + f"Translate the following text to {lang}. "
        f"Return ONLY the translated text, nothing else:\n\n{text}"
    )
    # Scale output budget/timeouts with input size — long texts (help-article
    # bodies) otherwise hit the 2000-token / 30s ceiling and fail silently.
    # deepseek-v4-* are reasoning models: reasoning_tokens share the max_tokens
    # budget, so an exhausted budget returns EMPTY content — which must be
    # treated as a failure (returning '' here used to poison both the cache
    # and the translations table with empty rows).
    max_tokens = min(8000, max(2000, len(text) * 2))
    timeout = 60 if len(text) > 1500 else 30
    for attempt in range(2):
        try:
            async with AsyncClient(timeout=timeout) as client:
                resp = await client.post(
                    "https://api.deepseek.com/v1/chat/completions",
                    json={
                        "model": model,
                        "messages": [{"role": "user", "content": prompt}],
                        "max_tokens": max_tokens,
                        "temperature": 0.1,
                    },
                    headers={"Authorization": f"Bearer {api_key}"},
                )
                if resp.status_code == 200:
                    data = resp.json()
                    choices = data.get("choices", [])
                    if choices:
                        content = (choices[0].get("message", {}).get("content") or "").strip()
                        if content:
                            return content
                        # Empty content (reasoning ate the budget) — retry once
                        # with a doubled budget, then give up as a failure.
                        logger.warning(f"DeepSeek empty content (attempt {attempt + 1}, finish={choices[0].get('finish_reason')}, model={model})")
        except Exception as e:
            logger.error(f"DeepSeek API error: {e}")
            return None
        max_tokens = min(8000, max_tokens * 2)
    return None


async def _fetch_translation(text: str, target_locale: str, db: AsyncSession | None = None) -> str | None:
    """Call translation providers.
    DeepSeek primary → DeepSeek fallback model → None.
    Returns translated text or None if all providers fail."""
    # Ensure creds are loaded from DB; _get_translation_creds handles its own cache.
    creds = await _get_translation_creds(db)

    # deepseek-v4-flash is a reasoning model: on long inputs its reasoning eats
    # the entire 8000-token budget and returns empty content (finish=length) —
    # two guaranteed 60s timeouts before the pro model succeeds. Long texts go
    # straight to the pro model; flash stays the primary for short ones.
    fallback_model = creds.get("deepseek_fallback_model", "deepseek-v4-pro")
    long_text = len(text) > 1500
    first_model = fallback_model if long_text else None
    second_model = None if long_text else fallback_model

    translated = await _call_deepseek(text, target_locale, model=first_model, db=db)
    if translated is not None:
        return translated

    translated = await _call_deepseek(text, target_locale, model=second_model, db=db)
    if translated is not None:
        return translated

    logger.warning(f"All translation providers failed for {target_locale}, using English fallback")
    return None


async def auto_translate_text(
    db: AsyncSession,
    text: str,
    source_locale: str,
    target_locale: str,
) -> tuple[str, bool]:
    """Auto-translate text with caching.
    DeepSeek primary → DeepSeek fallback model → last resort: keep English.
    Returns (translated_text, was_cached)."""
    ctx = _get_cache_stats_ctx()

    cache_hash = _compute_hash(source_locale, target_locale, text)
    result = await db.execute(
        select(TranslationCache).where(TranslationCache.hash == cache_hash)
    )
    cached = result.scalar_one_or_none()
    if cached is not None:
        ctx.hits += 1
        return cached.translated_text, True

    ctx.misses += 1

    translated = await _fetch_translation(text, target_locale, db=db)
    if translated is None:
        translated = text

    cache_entry = TranslationCache(
        source_text=text,
        source_locale=source_locale,
        target_locale=target_locale,
        translated_text=translated,
        hash=cache_hash,
    )
    db.add(cache_entry)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
    return translated, False


# ──────────────────────────────────────────────────────────────────────
# Content Translation CRUD Hooks
# ──────────────────────────────────────────────────────────────────────

TRANSLATABLE_ENTITIES: dict[str, list[str]] = {
    "menu_items": ["item_name", "description", "long_description"],
    "information_cards": ["title", "short_description", "long_description"],
    "product_cards": ["title", "short_description", "long_description"],
    "event_cards": ["title", "short_description", "long_description"],
    "voucher_definitions": ["display_title", "description", "short_description", "long_description"],
    "stores": ["store_name"],
    "inventory_items": ["item_name", "description"],
    "inventory_categories": ["category_name", "description"],
    "menu_modifier_groups": ["group_name"],
    "menu_modifier_options": ["option_name"],
    "menu_categories": ["category_name"],
    "allergens": ["display_name", "description"],
    "dietary_tags": ["display_name"],
    "tax_categories": ["category_name"],
    "loyalty_tiers": ["display_name"],
    "reward_catalog": ["reward_name", "short_description", "long_description", "how_to_redeem", "terms_and_conditions"],
    "promo_banners": ["title", "short_description"],
    "survey_definitions": ["survey_name", "description"],
    "survey_questions": ["question_text"],
    "system_pages": ["title", "body_text"],
    "help_articles": ["title", "body_text"],
    "splash_screens": ["title", "subtitle"],
    "marketing_campaigns": ["campaign_name", "body_content"],
    "notification_templates": ["title", "body"],
    "admin_notifications": ["title", "body"],
    "bundle_products": ["title", "description"],
    "bundle_categories": ["name"],
    "bundle_types": ["name", "description"],
    "event_categories": ["name"],
}

# Map DB table names to UI namespace (used in admin Translations page filter)
TABLE_TO_NAMESPACE = {
    "menu_items": "menu", "menu_categories": "menu",
    "allergens": "allergens", "dietary_tags": "dietary",
    "tax_categories": "tax", "loyalty_tiers": "loyalty",
    "reward_catalog": "reward", "voucher_definitions": "voucher",
    "information_cards": "information", "product_cards": "product",
    "event_cards": "event", "stores": "store",
    "inventory_items": "inventory", "inventory_categories": "inventory",
    "menu_modifier_groups": "menu", "menu_modifier_options": "menu",
    "promo_banners": "promo",
    "system_pages": "content",
    "splash_screens": "content",
    "help_articles": "help",
    "survey_definitions": "survey",
    "marketing_campaigns": "campaign",
    "bundle_products": "bundle",
    "bundle_categories": "bundle-category",
    "bundle_types": "bundle-type",
    "event_categories": "event-category",
}


async def auto_translate_record(
    db: AsyncSession,
    table_name: str,
    record_id: int,
    fields: dict[str, str],
) -> int:
    """Translate only what needs translating, for all supported locales.

    Contract (round 35): fills MISSING rows and refreshes STALE rows (source
    text changed since the row was written). Rows whose translation already
    matches the current source are never rewritten — this protects manually
    reviewed translations (is_auto_translated=false) and avoids redundant
    API calls on every save/cron. Stale manual rows are re-translated and
    re-marked auto so the review cron picks them up again.
    Uses retry-on-conflict for concurrent upsert safety.
    API calls for missing translations are executed concurrently to reduce latency."""
    columns = TRANSLATABLE_ENTITIES.get(table_name, [])
    if not columns:
        return 0

    # Build the list of (column, locale, text) we need translations for.
    needed: list[tuple[str, str, str]] = []
    for col in columns:
        text = fields.get(col)
        if not text or not isinstance(text, str) or not text.strip():
            continue
        for loc in SUPPORTED_LOCALES:
            needed.append((col, loc, text))

    if not needed:
        return 0

    # Skip (column, locale) pairs that already have a translation for the
    # CURRENT source text — auto-translate fills gaps and refreshes stale
    # (source-changed) rows only; it never rewrites a translation that
    # matches its source. This protects manually reviewed rows AND avoids
    # pointless API calls on every save/cron run.
    existing_by_pair = {}
    for t in (await db.execute(
        select(Translation).where(
            Translation.table_name == table_name,
            Translation.record_id == record_id,
        )
    )).scalars().all():
        existing_by_pair[(t.column_name, t.locale)] = t
    needed = [
        (col, loc, text)
        for col, loc, text in needed
        if existing_by_pair.get((col, loc)) is None
        or existing_by_pair[(col, loc)].source_text != text
        # Empty translations are failures, not results — retry them
        or not (existing_by_pair[(col, loc)].translated_text or "").strip()
    ]

    if not needed:
        return 0

    # Load credentials once so concurrent API calls can reuse the in-memory cache.
    await _get_translation_creds(db)

    # Check the translation cache for all needed items in a single query.
    # (Round 35: the cache can no longer be poisoned with source-text
    # fallbacks — failures are skipped below, never cached — so a cached
    # entry equal to its source is a legitimate provider keep.)
    hashes = {_compute_hash(SOURCE_LOCALE, loc, text) for _, loc, text in needed}
    cache_result = await db.execute(
        select(TranslationCache).where(TranslationCache.hash.in_(hashes))
    )
    cache_map = {c.hash: c.translated_text for c in cache_result.scalars().all()}

    ops: list[dict] = []
    missing_tasks: list[asyncio.Task] = []
    missing_meta: list[tuple[str, str, str, str]] = []  # col, loc, text, cache_hash

    # Prime the credentials cache before fanning out — concurrent tasks must
    # not share the AsyncSession, so they read creds from the warm cache.
    await _get_translation_creds(db)

    for col, loc, text in needed:
        cache_hash = _compute_hash(SOURCE_LOCALE, loc, text)
        cached = cache_map.get(cache_hash)
        # Empty cache entries are poisoned failures, not results — treat as a miss
        if cached is not None and cached.strip():
            ops.append({"col": col, "loc": loc, "text": text, "translated": cached})
        else:
            task = asyncio.create_task(_fetch_translation(text, loc))
            missing_tasks.append(task)
            missing_meta.append((col, loc, text, cache_hash))

    # Fetch missing translations concurrently.
    if missing_tasks:
        fetched = await asyncio.gather(*missing_tasks, return_exceptions=True)
        for (col, loc, text, cache_hash), translated in zip(missing_meta, fetched):
            if isinstance(translated, Exception):
                logger.warning(f"Translation fetch failed for {loc}: {translated}")
                translated = None
            if translated is None:
                # All providers failed — SKIP the row entirely. Never store the
                # English source as the "translation" (round 35 bug: failures
                # were persisted and cached, so they looked done and never
                # retried). A missing row is retried by the next cron run.
                logger.warning(f"Skipping {table_name}.{record_id}.{col} [{loc}] — translation providers failed")
                cache_map.pop(cache_hash, None)
                continue
            ops.append({"col": col, "loc": loc, "text": text, "translated": translated})
            cache_map[cache_hash] = translated

    # Upsert Translation records.
    for attempt in range(2):
        try:
            count = 0
            for op in ops:
                result = await db.execute(
                    select(Translation).where(
                        Translation.table_name == table_name,
                        Translation.record_id == record_id,
                        Translation.column_name == op["col"],
                        Translation.locale == op["loc"],
                    )
                )
                existing = result.scalar_one_or_none()
                if existing:
                    if existing.source_text == op["text"] and (existing.translated_text or "").strip():
                        # Defense-in-depth (races): a NON-EMPTY translation that
                        # matches its current source is never rewritten. Empty
                        # stored translations are failures — always rewritten.
                        continue
                    # Stale row (source text changed): re-translate. Manual
                    # rows are re-marked auto so the review cron/queue picks
                    # them up for re-review.
                    existing.translated_text = op["translated"]
                    existing.source_text = op["text"]
                    existing.updated_at = datetime.now(timezone.utc)
                    existing.namespace = TABLE_TO_NAMESPACE.get(table_name, table_name)
                    existing.translation_key = f"{table_name}.{record_id}.{op['col']}"
                    existing.is_auto_translated = True
                else:
                    new_t = Translation(
                        table_name=table_name,
                        record_id=record_id,
                        column_name=op["col"],
                        locale=op["loc"],
                        translated_text=op["translated"],
                        source_text=op["text"],
                        namespace=TABLE_TO_NAMESPACE.get(table_name, table_name),
                        translation_key=f"{table_name}.{record_id}.{op['col']}",
                        is_auto_translated=True,
                    )
                    db.add(new_t)
                count += 1

            # Persist new cache entries in the same transaction.
            # Dedupe by hash — identical texts across fields/records would
            # otherwise violate the cache's unique hash constraint. Failed
            # fetches were skipped above (no cache_map entry) — never cache
            # failures.
            seen_hashes: set[str] = set()
            for _, loc, text, cache_hash in missing_meta:
                if cache_hash in seen_hashes or cache_hash not in cache_map:
                    continue
                seen_hashes.add(cache_hash)
                translated = cache_map[cache_hash]
                # Conflict-safe: a sibling record in the same outer transaction
                # may already have committed this hash (cache SELECTs can't see
                # unflushed rows under autoflush=False).
                await db.execute(
                    pg_insert(TranslationCache).values(
                        source_text=text,
                        source_locale=SOURCE_LOCALE,
                        target_locale=loc,
                        translated_text=translated,
                        hash=cache_hash,
                    ).on_conflict_do_nothing(index_elements=["hash"])
                )

            await db.commit()
            return count
        except IntegrityError:
            await db.rollback()
            if attempt == 0:
                continue
            raise
    return 0


def schedule_auto_translate(table_name: str, record_id: int, fields: dict[str, str]) -> None:
    """Fire-and-forget auto-translate with its own DB session.

    Reasoning-model translation calls take 5-60s — awaiting them inline made
    every admin create/update request block for seconds (6.6s per menu item
    create measured) and stacked into httpx timeouts under load. Translation
    is eventually consistent by design: missing rows are retried by the
    nightly cron, and reads fall back to the source text meanwhile.
    """
    async def _run() -> None:
        try:
            from app.core.database import AsyncSessionLocal
            async with AsyncSessionLocal() as db:
                await auto_translate_record(db, table_name, record_id, fields)
        except StaleDataError:
            # The record (or its translations) was deleted between schedule and
            # run — a normal race with admin deletes/E2E cleanup. Nothing to
            # translate anymore; not an error.
            logger.info("schedule_auto_translate skipped for %s.%s — record deleted", table_name, record_id)
        except Exception:
            logger.exception("schedule_auto_translate failed for %s.%s", table_name, record_id)

    try:
        asyncio.get_running_loop().create_task(_run())
    except RuntimeError:
        logger.warning("schedule_auto_translate called without a running loop — skipping")


async def delete_translations(
    db: AsyncSession,
    table_name: str,
    record_id: int,
) -> int:
    """Delete all translations for a record. Returns count deleted."""
    result = await db.execute(
        delete(Translation).where(
            Translation.table_name == table_name,
            Translation.record_id == record_id,
        )
    )
    await db.commit()
    return result.rowcount or 0


async def merge_translations(
    db: AsyncSession,
    items: list[dict],
    table_name: str,
    locale: str,
) -> list[dict]:
    """Merge translations into API response items.
    For each item, looks up translated_text for translatable columns
    and replaces the original value with the translated version."""
    if locale == SOURCE_LOCALE or not items:
        return items

    columns = TRANSLATABLE_ENTITIES.get(table_name, [])
    if not columns:
        return items

    # Some serializers emit plain strings (e.g. dietary tag keys) — only
    # dict records with an id can be merged.
    items = [item for item in items if isinstance(item, dict)]

    ids = [item.get("id") for item in items if item.get("id")]
    if not ids:
        return items

    result = await db.execute(
        select(Translation).where(
            Translation.table_name == table_name,
            Translation.record_id.in_(ids),
            Translation.locale == locale,
        )
    )
    translations = result.scalars().all()

    # Build lookup: {record_id: {column_name: translated_text}}
    lookup: dict[int, dict[str, str]] = {}
    for t in translations:
        if t.record_id not in lookup:
            lookup[t.record_id] = {}
        lookup[t.record_id][t.column_name] = t.translated_text

    for item in items:
        tid = item.get("id")
        if tid and tid in lookup:
            for col in columns:
                # Skip empty/whitespace translations — an empty row must fall
                # back to the source text, not blank the page (round 35 bug:
                # 17 zh help bodies rendered empty).
                if col in lookup[tid] and lookup[tid][col] and lookup[tid][col].strip() and col in item:
                    item[col] = lookup[tid][col]

    return items


async def translate_single(
    db: AsyncSession,
    item: dict,
    table_name: str,
    locale: str,
) -> dict:
    """Merge translations into a single API response item."""
    if locale == SOURCE_LOCALE or not item or not item.get("id"):
        return item
    await merge_translations(db, [item], table_name, locale)
    return item


async def translate_menu_response(
    db: AsyncSession,
    data: dict,
    locale: str,
) -> dict:
    """Merge translations into a public menu response dict.

    The response shape is:
    {
      categories: [MenuCategoryOut...],
      items: [
        {
          ...,
          allergens: [AllergenOut...],
          modifier_groups: [
            {..., options: [MenuModifierOptionOut...]}
          ],
          variants: [MenuVariantOut...],
          dietary_tags: [DietaryTagOut...],
        }
      ]
    }
    """
    if locale == SOURCE_LOCALE:
        return data

    # Collect flat lists per entity type
    categories: list[dict] = list(data.get("categories", []))
    items: list[dict] = list(data.get("items", []))
    allergens: list[dict] = []
    modifier_groups: list[dict] = []
    modifier_options: list[dict] = []
    variants: list[dict] = []
    dietary_tags: list[dict] = []

    for item in items:
        allergens.extend(item.get("allergens") or [])
        for mg in item.get("modifier_groups") or []:
            modifier_groups.append(mg)
            modifier_options.extend(mg.get("options") or [])
        variants.extend(item.get("variants") or [])
        dietary_tags.extend(item.get("dietary_tags") or [])

    await merge_translations(db, categories, "menu_categories", locale)
    await merge_translations(db, items, "menu_items", locale)
    await merge_translations(db, allergens, "allergens", locale)
    await merge_translations(db, modifier_groups, "menu_modifier_groups", locale)
    await merge_translations(db, modifier_options, "menu_modifier_options", locale)
    await merge_translations(db, variants, "menu_variants", locale)
    await merge_translations(db, dietary_tags, "dietary_tags", locale)

    return data


async def get_cache_stats(db: AsyncSession) -> dict:
    ctx = _get_cache_stats_ctx()
    total = (await db.execute(select(func.count(TranslationCache.id)))).scalar() or 0
    return {"hit_count": getattr(ctx, "hits", 0), "miss_count": getattr(ctx, "misses", 0), "total_entries": total}


async def clear_old_cache(db: AsyncSession, days: int) -> int:
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    result = await db.execute(
        delete(TranslationCache).where(TranslationCache.created_at < cutoff)
    )
    await db.commit()
    return result.rowcount or 0
