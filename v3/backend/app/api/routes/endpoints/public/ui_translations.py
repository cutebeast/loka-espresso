"""Public UI translation endpoint — serves PWA/portal UI labels from the DB.

GET /api/public/translations/ui?locale=ms&namespace=pwa-ui

Returns a flat dict { "auth.login.button": "Log Masuk", ... } that the PWA
can consume directly (identical format to the static JSON files it currently uses).
Missing translations fall back to English automatically.
"""

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select, text

from app.api.routes.deps import DBDependency
from app.models.translation import Translation
from app.schemas.base import APIResponse

router = APIRouter(tags=["public — translations"])


@router.get("/ui", response_model=APIResponse[dict])
async def get_ui_translations(
    db: DBDependency,
    locale: str = Query("en", min_length=2, max_length=5),
    namespace: str = Query("pwa-ui"),
):
    """Return all UI translation key/value pairs for a given locale and namespace.

    Keys matching the namespace are returned as a flat dict. If a key has no
    translated text for the requested locale, the English (en) record is used
    as fallback. If no English record exists either, the key is returned with
    its source_text.
    """
    if locale == "en":
        # Direct query — no fallback needed
        result = await db.execute(
            select(Translation.translation_key, Translation.translated_text)
            .where(
                Translation.namespace == namespace,
                Translation.locale == "en",
            )
        )
        data = {row[0]: row[1] or "" for row in result.all()}
        return APIResponse(data=data)

    # For non-en locales: fetch target locale + en fallback in one query
    result = await db.execute(
        select(Translation.translation_key, Translation.locale, Translation.translated_text)
        .where(
            Translation.namespace == namespace,
            Translation.locale.in_([locale, "en"]),
        )
    )

    # Build: key -> {en: text, target: text_or_none}
    en_map: dict[str, str] = {}
    target_map: dict[str, str] = {}
    for key, loc, text in result.all():
        if loc == "en":
            en_map[key] = text or ""
        else:
            target_map[key] = text or ""

    # Merge: prefer target locale, fall back to en
    data: dict[str, str] = {}
    for key, en_text in en_map.items():
        data[key] = target_map.get(key) or en_text

    return APIResponse(data=data)


@router.get("/locales", response_model=APIResponse[list[str]])
async def list_available_locales(
    db: DBDependency,
    namespace: str = Query("pwa-ui"),
):
    """List locales that have translations for the given namespace."""
    result = await db.execute(
        select(Translation.locale)
        .where(Translation.namespace == namespace)
        .distinct()
    )
    locales = sorted(set(r[0] for r in result.all()))
    if "en" not in locales:
        locales.insert(0, "en")
    return APIResponse(data=locales)
