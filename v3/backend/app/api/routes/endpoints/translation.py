"""Translation endpoints."""

import json
import os
from collections import defaultdict
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select

from app.api.routes.deps import CurrentAdmin, DBDependency, HQAdmin
from app.models.translation import Translation, TranslationCache
from app.schemas.base import APIResponse, PaginatedResponse
from app.schemas.translation import (
    CacheStatsOut,
    TranslationCreate,
    TranslationOut,
    TranslationUpdate,
    TranslateRequest,
    TranslateResponse,
)
from app.services.translation import (
    auto_translate_text,
    clear_old_cache,
    get_cache_stats,
)

router = APIRouter(tags=["translations"])


async def _get_translation_or_404(db, translation_id: int) -> Translation:
    result = await db.execute(
        select(Translation).where(Translation.id == translation_id)
    )
    translation = result.scalar_one_or_none()
    if translation is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Translation not found"
        )
    return translation


@router.get("", response_model=APIResponse[PaginatedResponse[TranslationOut]])
async def list_translations(
    db: DBDependency,
    namespace: str | None = Query(None),
    locale: str | None = Query(None),
    table_name: str | None = Query(None),
    record_id: int | None = Query(None),
    column_name: str | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=5000),
):
    """List translations with optional filters."""
    stmt = select(Translation)
    count_stmt = select(func.count(Translation.id))

    if namespace is not None:
        stmt = stmt.where(Translation.namespace == namespace)
        count_stmt = count_stmt.where(Translation.namespace == namespace)
    if locale is not None:
        stmt = stmt.where(Translation.locale == locale)
        count_stmt = count_stmt.where(Translation.locale == locale)
    if table_name is not None:
        stmt = stmt.where(Translation.table_name == table_name)
        count_stmt = count_stmt.where(Translation.table_name == table_name)
    if record_id is not None:
        stmt = stmt.where(Translation.record_id == record_id)
        count_stmt = count_stmt.where(Translation.record_id == record_id)
    if column_name is not None:
        stmt = stmt.where(Translation.column_name == column_name)
        count_stmt = count_stmt.where(Translation.column_name == column_name)

    total_result = await db.execute(count_stmt)
    total = total_result.scalar() or 0

    stmt = stmt.order_by(Translation.id.desc()).offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(stmt)
    items = [TranslationOut.model_validate(r) for r in result.scalars().all()]

    return APIResponse(
        data=PaginatedResponse(
            items=items,
            total=total,
            page=page,
            per_page=per_page,
            total_pages=(total + per_page - 1) // per_page,
        )
    )


@router.post("", response_model=APIResponse[TranslationOut], status_code=status.HTTP_201_CREATED)
async def create_translation(
    db: DBDependency,
    admin: CurrentAdmin,
    data: TranslationCreate,
):  # Updated from PUT to handle composite key upsert
    """Create a translation record."""
    translation = Translation(**data.model_dump())
    db.add(translation)
    await db.commit()
    await db.refresh(translation)
    return APIResponse(data=TranslationOut.model_validate(translation))


@router.put("/upsert", response_model=APIResponse[TranslationOut])
async def upsert_translation(
    db: DBDependency,
    admin: CurrentAdmin,
    data: TranslationCreate,
):
    """Upsert a translation by composite key."""
    result = await db.execute(
        select(Translation).where(
            Translation.namespace == data.namespace,
            Translation.table_name == data.table_name,
            Translation.record_id == data.record_id,
            Translation.column_name == data.column_name,
            Translation.locale == data.locale,
        ).with_for_update()
    )
    existing = result.scalar_one_or_none()
    if existing:
        existing.translated_text = data.translated_text
        existing.updated_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(existing)
        return APIResponse(data=TranslationOut.model_validate(existing))
    else:
        translation = Translation(**data.model_dump())
        db.add(translation)
        await db.commit()
        await db.refresh(translation)
        return APIResponse(data=TranslationOut.model_validate(translation))


@router.post("/translate", response_model=APIResponse[TranslateResponse])
async def translate_text(
    db: DBDependency,
    admin: CurrentAdmin,
    data: TranslateRequest,
):
    """Auto-translate text with caching."""
    translated_text, was_cached = await auto_translate_text(
        db,
        text=data.text,
        source_locale=data.source_locale,
        target_locale=data.target_locale,
    )

    return APIResponse(
        data=TranslateResponse(
            translated_text=translated_text,
            source_text=data.text,
            source_locale=data.source_locale,
            target_locale=data.target_locale,
            cached=was_cached,
        )
    )


@router.get("/cache/stats", response_model=APIResponse[CacheStatsOut])
async def cache_stats(
    db: DBDependency,
    admin: HQAdmin,
):
    """Get translation cache statistics (admin only)."""
    stats = await get_cache_stats(db)
    return APIResponse(data=CacheStatsOut.model_validate(stats))


@router.delete("/cache", response_model=APIResponse[dict])
async def clear_cache(
    db: DBDependency,
    admin: HQAdmin,
    days: int = Query(30, ge=1),
):
    """Clear old translation cache entries (admin only)."""
    deleted = await clear_old_cache(db, days)
    return APIResponse(data={"deleted": deleted})


@router.get("/{translation_id}", response_model=APIResponse[TranslationOut])
async def get_translation(
    db: DBDependency,
    translation_id: int,
):
    """Get a single translation by ID."""
    translation = await _get_translation_or_404(db, translation_id)
    return APIResponse(data=TranslationOut.model_validate(translation))


@router.put("/{translation_id}", response_model=APIResponse[TranslationOut])
async def update_translation(
    db: DBDependency,
    admin: CurrentAdmin,
    translation_id: int,
    data: TranslationUpdate,
):
    """Update a translation."""
    translation = await _get_translation_or_404(db, translation_id)

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(translation, field, value)

    translation.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(translation)
    return APIResponse(data=TranslationOut.model_validate(translation))


@router.delete("/{translation_id}", response_model=APIResponse[dict])
async def delete_translation(
    db: DBDependency,
    admin: CurrentAdmin,
    translation_id: int,
):
    """Delete a translation."""
    translation = await _get_translation_or_404(db, translation_id)
    await db.delete(translation)
    await db.commit()
    return APIResponse(data={"id": translation.id, "deleted": True})


@router.post("/sync-to-json", response_model=APIResponse[dict])
async def sync_to_json(
    db: DBDependency,
    admin: CurrentAdmin,
):
    """Sync pwa-ui DB translations to static JSON locale files."""
    LOCALES = ["ms", "zh", "ta", "tr"]
    PWA_LOCALES_DIR = os.path.join(
        os.path.dirname(__file__), "..", "..", "..", "..", "..",
        "customer-pwa", "src", "locales",
    )
    PWA_LOCALES_DIR = os.path.abspath(PWA_LOCALES_DIR)

    def set_nested(d, key, value):
        parts = key.split(".")
        current = d
        for part in parts[:-1]:
            current = current.setdefault(part, {})
        current[parts[-1]] = value

    def sort_dict(d):
        return {k: sort_dict(v) if isinstance(v, dict) else v for k, v in sorted(d.items())}

    results = {}
    for locale in LOCALES:
        result = await db.execute(
            select(Translation.translation_key, Translation.translated_text)
            .where(
                Translation.namespace == "pwa-ui",
                Translation.locale == locale,
                Translation.translated_text.isnot(None),
                Translation.translated_text != "",
            )
        )
        rows = result.all()

        nested: dict = {}
        for key, text in rows:
            set_nested(nested, key, text)

        out_path = os.path.join(PWA_LOCALES_DIR, f"{locale}.json")
        os.makedirs(os.path.dirname(out_path), exist_ok=True)

        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(sort_dict(nested), f, ensure_ascii=False, indent=2)
            f.write("\n")

        results[locale] = len(rows)

    # Bump version.json builtAt timestamp so PWA service worker detects update
    import time
    version_path = os.path.join(PWA_LOCALES_DIR, "..", "..", "public", "version.json")
    version_path = os.path.abspath(version_path)
    try:
        with open(version_path, "r") as f:
            version_info = json.load(f)
        version_info["builtAt"] = int(time.time() * 1000)
        version_info["updatedAt"] = datetime.now(timezone.utc).isoformat()
        with open(version_path, "w") as f:
            json.dump(version_info, f, indent=2)
            f.write("\n")
        results["_version"] = version_info.get("version")
    except Exception as e:
        results["_version_error"] = str(e)

    # Trigger PWA rebuild so new JSON is bundled
    import subprocess
    try:
        pwa_dir = os.path.abspath(os.path.join(PWA_LOCALES_DIR, "..", ".."))
        subprocess.run(["npm", "run", "build"], cwd=pwa_dir, capture_output=True, timeout=180)
        subprocess.run(["pm2", "restart", "customer-pwa-v3"], capture_output=True, timeout=30)
        results["_rebuild"] = "ok"
    except Exception as e:
        results["_rebuild_error"] = str(e)

    return APIResponse(data={
        "message": "Translations synced to JSON files",
        "results": results,
    })
