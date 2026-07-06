"""Admin platform config endpoint."""

import json

from fastapi import APIRouter, Body, HTTPException, Query
from sqlalchemy import select

from app.api.routes.deps import CurrentAdmin, DBDependency
from app.models.platform import PlatformConfig
from app.schemas.base import APIResponse

router = APIRouter(prefix="/admin/config", tags=["admin — config"])


@router.get("", response_model=APIResponse[list[dict]])
async def list_config(
    admin: CurrentAdmin,
    db: DBDependency,
    prefix: str | None = Query(None, description="Filter by config_key prefix (e.g. 'reservation.'"),
):
    """List all platform config entries, optionally filtered by prefix."""
    query = select(PlatformConfig).order_by(PlatformConfig.config_key)
    if prefix:
        query = query.where(PlatformConfig.config_key.startswith(prefix))
    result = await db.execute(query)
    configs = result.scalars().all()
    items = [
        {
            "id": c.id,
            "config_key": c.config_key,
            "config_value": c.config_value,
            "value_type": c.value_type,
            "environment": c.environment,
            "is_sensitive": c.is_sensitive,
            "is_editable": c.is_editable,
        }
        for c in configs
    ]
    return APIResponse(data=items)


@router.put("", response_model=APIResponse[dict])
async def update_config(
    admin: CurrentAdmin,
    db: DBDependency,
    key: str = Query(""),
    value: str = Query(""),
    data: dict = Body({}),
):
    """Update a platform config value.

    Accepts key/value via query params (legacy) or JSON body. Body is preferred
    for sensitive values such as API tokens.
    """
    effective_key = key or data.get("key") or data.get("config_key")
    effective_value = value if value != "" else data.get("value") or data.get("config_value")
    if not effective_key or effective_value == "" or effective_value is None:
        raise HTTPException(status_code=400, detail="Both 'key' and 'value' are required")

    result = await db.execute(
        select(PlatformConfig).where(PlatformConfig.config_key == effective_key)
    )
    config = result.scalar_one_or_none()
    if config is None:
        raise HTTPException(status_code=404, detail=f"Config key '{effective_key}' not found")
    if not config.is_editable:
        raise HTTPException(status_code=403, detail=f"Config key '{effective_key}' is not editable")

    # Parse value based on value_type before storing in JSONB
    vt = config.value_type or "string"
    if vt == "json":
        try:
            config.config_value = json.loads(effective_value)
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail=f"Invalid JSON for config key '{effective_key}'")
    elif vt == "integer":
        try:
            config.config_value = int(effective_value)
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail=f"Invalid integer for config key '{effective_key}'")
    elif vt in ("float", "decimal"):
        try:
            config.config_value = float(effective_value)
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail=f"Invalid number for config key '{effective_key}'")
    elif vt == "boolean":
        config.config_value = str(effective_value).lower() in ("true", "1", "yes")
    else:
        config.config_value = effective_value
    await db.commit()
    await db.refresh(config)

    return APIResponse(
        data={
            "config_key": config.config_key,
            "config_value": config.config_value,
            "message": f"Config '{effective_key}' updated",
        }
    )
