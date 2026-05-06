from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional, List

from app.core.database import get_db
from app.core.security import require_role
from app.core.audit import log_action, get_client_ip
from app.models.admin_user import AdminUser
from app.models.user import RoleIDs
from app.models.splash import AppConfig
from app.models.loyalty import LoyaltyTier
from app.schemas.admin import AppConfigOut, AppConfigUpdate

router = APIRouter(tags=["Config"])

# Known safe business config keys. Reject anything that looks like a secret or infra key.
ALLOWED_CONFIG_KEYS = {
    "delivery_fee", "min_order_delivery", "min_order", "min_order_amount",
    "currency", "currency_symbol", "earn_rate", "pickup_lead_minutes",
    "loyalty_enabled", "loyalty_points_per_rmse", "max_vouchers_per_user",
    "voucher_expiry_days", "points_redemption_rate",
    "referral_reward_points", "referral_min_orders",
    "pos_integration_enabled", "delivery_integration_enabled",
    "payment_gateway_provider",
    "otp_bypass_enabled", "otp_bypass_code",
    "notification_retention_days",
    "pos_api_url",
    "otp_rate_limit",
    "topup_presets", "topup_min_amount",
    "order_polling_interval_seconds",
}

SENSITIVE_KEY_PATTERNS = {"secret", "password", "token", "api_key", "private", "jwt", "credential", "bypass_code"}

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
    "referral_reward_points",
    "referral_min_orders",
    "notification_retention_days",
    "topup_presets",
    "topup_min_amount",
    "order_polling_interval_seconds",
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
        "topup_presets": "10,20,50,100,200",
        "topup_min_amount": 5,
        "referral_reward_points": 50,
        "referral_min_orders": 1,
        "notification_retention_days": 30,
        "order_polling_interval_seconds": 30,
    }
    for k, v in defaults.items():
        if k not in configs:
            configs[k] = v
    return configs


# ---------------------------------------------------------------------------
# Bootstrap endpoint — single fetch for all PWA startup data
# ---------------------------------------------------------------------------

class TierBootstrapOut(BaseModel):
    id: int
    name: str
    min_points: int
    points_multiplier: Optional[float] = 1.0
    benefits: Optional[dict] = None
    sort_order: int = 0

    class Config:
        from_attributes = True


class BootstrapOut(BaseModel):
    config: dict
    tiers: List[TierBootstrapOut]


@router.get("/config/bootstrap", response_model=BootstrapOut)
async def get_bootstrap(db: AsyncSession = Depends(get_db)):
    """Return all PWA startup data in a single request: config + loyalty tiers."""
    # ── config (same logic as GET /config) ──
    result = await db.execute(select(AppConfig))
    configs: dict = {}
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
        "delivery_fee": 3.0, "earn_rate": 1, "min_order": 0,
        "min_order_delivery": 0, "pickup_lead_minutes": 15,
        "currency": "MYR", "currency_symbol": "RM",
        "topup_presets": "10,20,50,100,200", "topup_min_amount": 5,
        "referral_reward_points": 50, "referral_min_orders": 1,
        "notification_retention_days": 30,
    }
    for k, v in defaults.items():
        if k not in configs:
            configs[k] = v

    # ── loyalty tiers ──
    tiers_result = await db.execute(
        select(LoyaltyTier).order_by(LoyaltyTier.sort_order, LoyaltyTier.min_points)
    )
    tiers_raw = tiers_result.scalars().all()

    return BootstrapOut(
        config=configs,
        tiers=[TierBootstrapOut.model_validate(t) for t in tiers_raw],
    )


@router.get("/admin/config")
async def get_admin_config(
    key: list[str] | None = Query(default=None),
    user: AdminUser = Depends(require_role(RoleIDs.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    query = select(AppConfig)
    if key:
        # Filter out any requested keys that match sensitive patterns
        # Exception: allow otp_ prefixed keys that are in ALLOWED_CONFIG_KEYS
        allowed_keys = [k for k in key if k in ALLOWED_CONFIG_KEYS or not any(p in k.lower() for p in SENSITIVE_KEY_PATTERNS)]
        if allowed_keys:
            query = query.where(AppConfig.key.in_(allowed_keys))
        else:
            return {"configs": {}}

    result = await db.execute(query)
    configs = {row.key: row.value for row in result.scalars().all()}
    # Double-filter results to ensure no sensitive keys leak
    # Exception: keys in ALLOWED_CONFIG_KEYS are safe to expose
    filtered = {k: v for k, v in configs.items() if k in ALLOWED_CONFIG_KEYS or not any(p in k.lower() for p in SENSITIVE_KEY_PATTERNS)}
    return {"configs": filtered}


@router.put("/admin/config")
async def update_config(
    request: Request,
    key: str,
    req: AppConfigUpdate,
    user: AdminUser = Depends(require_role(RoleIDs.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    # Reject keys not in the allowlist
    if key not in ALLOWED_CONFIG_KEYS:
        raise HTTPException(status_code=400, detail="This key is not allowed to be modified via admin config")

    # Reject keys that look like secrets or infrastructure
    # Exception: keys explicitly in ALLOWED_CONFIG_KEYS bypass this check
    lower_key = key.lower()
    if key not in ALLOWED_CONFIG_KEYS and any(pattern in lower_key for pattern in SENSITIVE_KEY_PATTERNS):
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
    # Redact sensitive values in audit log
    is_sensitive = any(p in key.lower() for p in SENSITIVE_KEY_PATTERNS)
    await log_action(
        db,
        action="config_update",
        user_id=user.id,
        entity_type="app_config",
        entity_id=None,
        details={
            "key": key,
            "old_value": "***REDACTED***" if is_sensitive else old_value,
            "new_value": "***REDACTED***" if is_sensitive else req.value,
        },
        ip_address=ip,
        status="success",
        method="PUT",
        path=str(request.url.path),
    )

    return {"message": "Config updated", "key": key}
