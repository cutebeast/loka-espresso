from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import require_role
from app.models.user import User, RoleIDs
from app.models.splash import AppConfig
from app.schemas.admin import AppConfigOut, AppConfigUpdate

router = APIRouter(tags=["Config"])


@router.get("/config")
async def get_config(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(AppConfig))
    configs = {}
    for row in result.scalars().all():
        try:
            val = float(row.value)
            if val == int(val):
                val = int(val)
        except (ValueError, TypeError):
            val = row.value
        configs[row.key] = val
    defaults = {
        "delivery_fee": 3.0,
        "earn_rate": 1,
        "min_order": 0,
        "pickup_lead_minutes": 15,
        "currency": "MYR",
    }
    for k, v in defaults.items():
        if k not in configs:
            configs[k] = v
    return configs


@router.put("/admin/config")
async def update_config(
    key: str,
    req: AppConfigUpdate,
    user: User = Depends(require_role(RoleIDs.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(AppConfig).where(AppConfig.key == key))
    config = result.scalar_one_or_none()
    if not config:
        config = AppConfig(key=key, value=req.value)
        db.add(config)
    else:
        config.value = req.value
    await db.flush()
    return {"message": "Config updated", "key": key}
