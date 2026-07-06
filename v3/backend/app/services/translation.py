"""Translation service layer — DeepL + DeepSeek v4 Pro integration, content merging, CRUD hooks."""

import asyncio
import hashlib
import logging
from datetime import datetime, timedelta, timezone

from httpx import AsyncClient
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.translation import Translation, TranslationCache

SUPPORTED_LOCALES = ["ms", "zh", "ta", "tr"]
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
    "integration.deepl_api_key",
    "integration.deepl_api_url",
    "integration.deepseek_api_key",
    "integration.deepseek_model",
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
            "deepl_key": rows.get("integration.deepl_api_key", ""),
            "deepl_url": rows.get("integration.deepl_api_url", "https://api-free.deepl.com/v2/translate"),
            "deepseek_key": rows.get("integration.deepseek_api_key", ""),
            "deepseek_model": rows.get("integration.deepseek_model", "deepseek-chat"),
            "deepseek_fallback_model": rows.get("integration.deepseek_fallback_model", "deepseek-reasoner"),
        }
        _creds_cache_ts = now
    except Exception:
        if _creds_cache is None:
            _creds_cache = {}
    return _creds_cache


def _compute_hash(source_locale: str, target_locale: str, text: str) -> str:
    payload = f"{source_locale}:{target_locale}:{text}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


async def _call_deepl(text: str, target_locale: str) -> str | None:
    """Call DeepL API (primary). Returns translated text or None."""
    creds = await _get_translation_creds()
    api_key = creds.get("deepl_key", "")
    api_url = creds.get("deepl_url", "https://api-free.deepl.com/v2/translate")
    if not api_key:
        return None
    # DeepL supported target languages: skip unsupported locales
    lang_map = {"ms": "MS", "zh": "ZH", "tr": "TR"}
    target_lang = lang_map.get(target_locale)
    if target_lang is None:
        return None  # Let DeepSeek handle it
    try:
        async with AsyncClient(timeout=15) as client:
            resp = await client.post(
                api_url,
                data={"text": text, "target_lang": target_lang},
                headers={"Authorization": f"DeepL-Auth-Key {api_key}"},
            )
            if resp.status_code == 200:
                data = resp.json()
                translations = data.get("translations", [])
                if translations:
                    return translations[0].get("text")
    except Exception as e:
        logger.error(f"DeepL API error: {e}")
        return None

    return None


async def _call_deepseek(text: str, target_locale: str, model: str | None = None) -> str | None:
    """Call DeepSeek LLM API. Returns translated text or None."""
    creds = await _get_translation_creds()
    api_key = creds.get("deepseek_key", "")
    if model is None:
        model = creds.get("deepseek_model", "deepseek-chat")
    if not api_key:
        return None
    locale_names = {"ms": "Bahasa Melayu", "zh": "Simplified Chinese", "ta": "Tamil", "tr": "Turkish"}
    lang = locale_names.get(target_locale, target_locale)
    prompt = (
        f"Translate the following text to {lang}. "
        f"Return ONLY the translated text, nothing else:\n\n{text}"
    )
    try:
        async with AsyncClient(timeout=30) as client:
            resp = await client.post(
                "https://api.deepseek.com/v1/chat/completions",
                json={
                    "model": model,
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": 2000,
                    "temperature": 0.1,
                },
                headers={"Authorization": f"Bearer {api_key}"},
            )
            if resp.status_code == 200:
                data = resp.json()
                choices = data.get("choices", [])
                if choices:
                    return choices[0].get("message", {}).get("content", "").strip()
    except Exception as e:
        logger.error(f"DeepSeek API error: {e}")
        return None


async def _fetch_translation(text: str, target_locale: str) -> str | None:
    """Call translation providers without touching the database.
    Primary: DeepL (if configured) → DeepSeek flash → DeepSeek pro fallback → None.
    Returns translated text or None if all providers fail."""
    # Ensure creds are loaded from DB; _get_translation_creds handles its own cache.
    creds = await _get_translation_creds()

    translated = await _call_deepl(text, target_locale)
    if translated is not None:
        return translated

    translated = await _call_deepseek(text, target_locale)
    if translated is not None:
        logger.info(f"DeepSeek primary success for {target_locale}: {translated[:30]}")
        return translated

    fallback_model = creds.get("deepseek_fallback_model", "deepseek-reasoner")
    translated = await _call_deepseek(text, target_locale, model=fallback_model)
    if translated is not None:
        logger.info(f"DeepSeek fallback success for {target_locale}: {translated[:30]}")
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
    Primary: DeepL (if configured) → DeepSeek flash → DeepSeek pro fallback → Last resort: keep English.
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

    translated = await _fetch_translation(text, target_locale)
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
    "splash_screens": ["title", "subtitle"],
    "marketing_campaigns": ["campaign_name", "body_content"],
    "notification_templates": ["title", "body"],
    "admin_notifications": ["title", "body"],
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
    "survey_definitions": "survey",
    "marketing_campaigns": "campaign",
}


async def auto_translate_record(
    db: AsyncSession,
    table_name: str,
    record_id: int,
    fields: dict[str, str],
) -> int:
    """Auto-translate all fields for all supported locales on create/update.
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

    # Load credentials once so concurrent API calls can reuse the in-memory cache.
    await _get_translation_creds(db)

    # Check the translation cache for all needed items in a single query.
    hashes = {_compute_hash(SOURCE_LOCALE, loc, text) for _, loc, text in needed}
    cache_result = await db.execute(
        select(TranslationCache).where(TranslationCache.hash.in_(hashes))
    )
    cache_map = {c.hash: c.translated_text for c in cache_result.scalars().all()}

    ops: list[dict] = []
    missing_tasks: list[asyncio.Task] = []
    missing_meta: list[tuple[str, str, str, str]] = []  # col, loc, text, cache_hash

    for col, loc, text in needed:
        cache_hash = _compute_hash(SOURCE_LOCALE, loc, text)
        cached = cache_map.get(cache_hash)
        if cached is not None:
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
            translated = translated or text  # Fallback to source text.
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
            for _, loc, text, cache_hash in missing_meta:
                translated = cache_map[cache_hash]
                db.add(TranslationCache(
                    source_text=text,
                    source_locale=SOURCE_LOCALE,
                    target_locale=loc,
                    translated_text=translated,
                    hash=cache_hash,
                ))

            await db.commit()
            return count
        except IntegrityError:
            await db.rollback()
            if attempt == 0:
                continue
            raise
    return 0


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
                if col in lookup[tid] and col in item:
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
        allergens.extend(item.get("allergens", []))
        for mg in item.get("modifier_groups", []):
            modifier_groups.append(mg)
            modifier_options.extend(mg.get("options", []))
        variants.extend(item.get("variants", []))
        dietary_tags.extend(item.get("dietary_tags", []))

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
