"""Translation service layer."""

import hashlib
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.translation import Translation, TranslationCache

# In-memory cache statistics counters
_cache_hits = 0
_cache_misses = 0


def _compute_hash(source_locale: str, target_locale: str, text: str) -> str:
    payload = f"{source_locale}:{target_locale}:{text}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


async def get_or_create_translation(
    db: AsyncSession,
    table_name: str,
    record_id: int,
    column_name: str,
    locale: str,
    text: str,
) -> Translation:
    """Get existing translation or create a new one."""
    result = await db.execute(
        select(Translation).where(
            Translation.table_name == table_name,
            Translation.record_id == record_id,
            Translation.column_name == column_name,
            Translation.locale == locale,
        )
    )
    translation = result.scalar_one_or_none()
    if translation is not None:
        translation.translated_text = text
        translation.updated_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(translation)
        return translation

    translation = Translation(
        table_name=table_name,
        record_id=record_id,
        column_name=column_name,
        locale=locale,
        translated_text=text,
    )
    db.add(translation)
    await db.commit()
    await db.refresh(translation)
    return translation


async def auto_translate(
    db: AsyncSession,
    text: str,
    source_locale: str,
    target_locale: str,
) -> tuple[str, bool]:
    """Auto-translate text with caching. Returns (translated_text, was_cached)."""
    global _cache_hits, _cache_misses

    cache_hash = _compute_hash(source_locale, target_locale, text)
    result = await db.execute(
        select(TranslationCache).where(TranslationCache.hash == cache_hash)
    )
    cached = result.scalar_one_or_none()

    if cached is not None:
        _cache_hits += 1
        return cached.translated_text, True

    _cache_misses += 1
    # Mock DeepL API call
    translated = f"[{target_locale.upper()}] {text}"

    cache_entry = TranslationCache(
        source_text=text,
        source_locale=source_locale,
        target_locale=target_locale,
        translated_text=translated,
        hash=cache_hash,
    )
    db.add(cache_entry)
    await db.commit()
    return translated, False


async def get_cache_stats(db: AsyncSession) -> dict:
    """Return cache statistics."""
    total_result = await db.execute(select(func.count(TranslationCache.id)))
    total_entries = total_result.scalar() or 0
    return {
        "hit_count": _cache_hits,
        "miss_count": _cache_misses,
        "total_entries": total_entries,
    }


async def clear_old_cache(db: AsyncSession, days: int) -> int:
    """Clear cache entries older than ``days`` days. Returns number of deleted rows."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    result = await db.execute(
        delete(TranslationCache).where(TranslationCache.created_at < cutoff)
    )
    await db.commit()
    return result.rowcount or 0
