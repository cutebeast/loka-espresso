from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import require_role
from app.core.audit import log_action, get_client_ip
from app.models.user import User, RoleIDs
from app.models.splash import AppConfig
from app.schemas.admin import AppConfigOut, AppConfigUpdate

router = APIRouter(tags=["Config"])

# Known safe business config keys. Reject anything that looks like a secret or infra key.
ALLOWED_CONFIG_KEYS = {
    "delivery_fee", "min_order_delivery", "min_order", "min_order_amount",
    "currency", "currency_symbol", "earn_rate", "pickup_lead_minutes",
    "loyalty_enabled", "loyalty_points_per_rmse", "max_vouchers_per_user",
    "voucher_expiry_days", "points_redemption_rate", "referral_bonus_points",
    "otp_bypass_enabled", "otp_bypass_code", "pwa_phone_country_code",
}

SENSITIVE_KEY_PATTERNS = {"secret", "password", "token", "api_key", "private", "jwt", "credential"}

# Whitelist of keys safe to expose via the public /config endpoint.
# NEVER add `otp_bypass_*`, secrets, API keys, or feature flags that would
# leak attack-surface information.
PUBLIC_CONFIG_KEYS = {
    "delivery_fee",
    "earn_rate",
    "min_order",
    "min_order_amount",
    "min_order_delivery",
    "pickup_lead_minutes",
    "currency",
    "currency_symbol",
    "loyalty_enabled",
    "loyalty_points_per_rmse",
    "max_vouchers_per_user",
    "voucher_expiry_days",
    "points_redemption_rate",
    "referral_bonus_points",
}


@router.get("/config")
async def get_config(db: AsyncSession = Depends(get_db)):
    """Return only the whitelisted, non-sensitive runtime config the PWA
    needs. Sensitive flags (e.g. otp_bypass_*) are intentionally omitted."""
    result = await db.execute(select(AppConfig))
    configs = {}
    for row in result.scalars().all():
        if row.key not in PUBLIC_CONFIG_KEYS:
            continue
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
        "min_order_delivery": 0,
        "pickup_lead_minutes": 15,
        "currency": "MYR",
        "currency_symbol": "RM",
    }
    for k, v in defaults.items():
        if k not in configs:
            configs[k] = v
    return configs


@router.get("/admin/config")
async def get_admin_config(
    key: list[str] | None = Query(default=None),
    user: User = Depends(require_role(RoleIDs.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    query = select(AppConfig)
    if key:
        query = query.where(AppConfig.key.in_(key))

    result = await db.execute(query)
    configs = {row.key: row.value for row in result.scalars().all()}
    return {"configs": configs}


@router.put("/admin/config")
async def update_config(
    request: Request,
    key: str,
    req: AppConfigUpdate,
    user: User = Depends(require_role(RoleIDs.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    # Reject keys that look like secrets or infrastructure
    lower_key = key.lower()
    if any(pattern in lower_key for pattern in SENSITIVE_KEY_PATTERNS):
        raise HTTPException(status_code=400, detail="This key cannot be modified via admin config")

    result = await db.execute(select(AppConfig).where(AppConfig.key == key))
    config = result.scalar_one_or_none()
    old_value = config.value if config else None
    if not config:
        config = AppConfig(key=key, value=req.value)
        db.add(config)
    else:
        config.value = req.value
    await db.flush()

    ip = get_client_ip(request)
    await log_action(
        db,
        action="config_update",
        user_id=user.id,
        entity_type="app_config",
        entity_id=None,
        details={"key": key, "old_value": old_value, "new_value": req.value},
        ip_address=ip,
        status="success",
        method="PUT",
        path=str(request.url.path),
    )

    return {"message": "Config updated", "key": key}
