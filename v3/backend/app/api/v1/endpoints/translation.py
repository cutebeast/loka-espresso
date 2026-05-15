"""Translation endpoints."""

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select

from app.api.v1.deps import CurrentAdmin, DBDependency, HQAdmin
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
    per_page: int = Query(20, ge=1, le=100),
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
):
    """Create a translation record."""
    translation = Translation(**data.model_dump())
    db.add(translation)
    await db.commit()
    await db.refresh(translation)
    return APIResponse(data=TranslationOut.model_validate(translation))


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
