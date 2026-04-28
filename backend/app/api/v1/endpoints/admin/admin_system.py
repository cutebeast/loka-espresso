from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, text

from app.core.database import get_db
from app.core.security import require_hq_access, require_role
from app.core.audit import log_action, get_client_ip
from app.models.admin_user import AdminUser
from app.models.customer import Customer
from app.models.user import OTPSession, RoleIDs
from app.models.audit import AuditLog
from app.models.store import Store
from app.schemas.admin_extras import (
    AuditLogOut,
)

router = APIRouter(prefix="/admin", tags=["Admin System"])


# ---------------------------------------------------------------------------
# OTP / Phone Lookup
# ---------------------------------------------------------------------------

@router.get("/otps")
async def lookup_otp(
    phone: str = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: AdminUser = Depends(require_hq_access()),
):
    from app.core.config import get_settings
    settings = get_settings()
    if settings.ENVIRONMENT.lower() == "production":
        raise HTTPException(status_code=403, detail="OTP lookup is not allowed in production")

    if len(phone) < 8:
        raise HTTPException(status_code=400, detail="Phone number must be at least 8 digits")
    result = await db.execute(
        select(OTPSession).where(
            OTPSession.phone == phone,
            OTPSession.expires_at > datetime.now(timezone.utc),
        ).order_by(OTPSession.created_at.desc()).limit(10)
    )
    entries = result.scalars().all()
    if not entries:
        raise HTTPException(status_code=404, detail="No recent OTP found for this phone")
    return {
        "phone": phone,
        "entries": [{"code": e.code, "expires_at": e.expires_at.isoformat() if e.expires_at else None, "verified": e.verified} for e in entries],
    }


# ---------------------------------------------------------------------------
# User Lookup
# ---------------------------------------------------------------------------

@router.get("/users/{user_id}")
async def get_user_by_id(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: AdminUser = Depends(require_hq_access()),
):
    result = await db.execute(
        select(Customer).where(Customer.id == user_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "phone": user.phone,
        "avatar_url": user.avatar_url,
        "referral_code": user.referral_code,
        "is_active": user.is_active,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }


# ---------------------------------------------------------------------------
# Audit Log
# ---------------------------------------------------------------------------

@router.get("/audit-log")
async def list_audit_log(
    user_id: int | None = None,
    store_id: int | None = None,
    action: str | None = None,
    from_date: datetime | None = None,
    to_date: datetime | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: AdminUser = Depends(require_hq_access()),
):
    base_query = select(AuditLog)
    if user_id is not None:
        base_query = base_query.where(AuditLog.user_id == user_id)
    if store_id is not None:
        base_query = base_query.where(AuditLog.store_id == store_id)
    if action is not None:
        base_query = base_query.where(AuditLog.action == action)
    if from_date is not None:
        base_query = base_query.where(AuditLog.created_at >= from_date)
    if to_date is not None:
        base_query = base_query.where(AuditLog.created_at <= to_date)

    count_query = select(func.count()).select_from(base_query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    result = await db.execute(
        base_query.order_by(AuditLog.created_at.desc())
        .offset((page - 1) * page_size).limit(page_size)
    )
    items = result.scalars().all()

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
    }


# ---------------------------------------------------------------------------
# System: Full Reset
# ---------------------------------------------------------------------------

@router.delete("/system/reset")
async def full_system_reset(
    request: Request,
    confirmation: str = "",
    db: AsyncSession = Depends(get_db),
    user: AdminUser = Depends(require_role(RoleIDs.ADMIN)),
):
    from app.core.config import get_settings
    settings = get_settings()
    if settings.ENVIRONMENT.lower() == "production":
        raise HTTPException(status_code=403, detail="System reset is not allowed in production")
    if confirmation != "CONFIRM_RESET":
        raise HTTPException(status_code=400, detail="Confirmation required: pass confirmation='CONFIRM_RESET'")
    try:
        _ALLOWED_RESET_TABLES = {
            "survey_answers", "survey_responses", "survey_questions",
            "promo_banners", "surveys", "user_vouchers", "vouchers",
            "user_rewards", "rewards", "menu_items", "menu_categories",
            "customization_options", "store_tables", "table_occupancy_snapshot",
            "inventory_movements", "inventory_items", "inventory_categories",
            "user_store_access", "staff", "staff_shifts", "marketing_campaigns",
            "notification_broadcasts", "notifications", "audit_log",
            "pin_attempts", "token_blacklist", "favorites", "feedback",
            "referrals", "payment_methods", "user_addresses", "device_tokens",
            "otp_sessions", "wallet_transactions", "wallets",
            "loyalty_transactions", "loyalty_accounts", "loyalty_tiers",
            "payments", "order_items", "order_status_history", "orders",
            "cart_items", "stores", "splash_content",
        }

        _ALLOWED_SEQUENCES = {
            "stores_id_seq", "staff_id_seq", "menu_categories_id_seq",
            "menu_items_id_seq", "store_tables_id_seq",
            "inventory_categories_id_seq", "inventory_items_id_seq",
            "orders_id_seq", "loyalty_accounts_id_seq", "wallets_id_seq",
            "audit_log_id_seq",
        }

        tables_to_clear = [
            "survey_answers",
            "survey_responses",
            "survey_questions",
            "promo_banners",
            "surveys",
            "user_vouchers",
            "vouchers",
            "user_rewards",
            "rewards",
            "menu_items",
            "menu_categories",
            "customization_options",
            "store_tables",
            "table_occupancy_snapshot",
            "inventory_movements",
            "inventory_items",
            "inventory_categories",
            "user_store_access",
            "staff",
            "staff_shifts",
            "marketing_campaigns",
            "notification_broadcasts",
            "notifications",
            "audit_log",
            "pin_attempts",
            "token_blacklist",
            "favorites",
            "feedback",
            "referrals",
            "payment_methods",
            "user_addresses",
            "device_tokens",
            "otp_sessions",
            "wallet_transactions",
            "wallets",
            "loyalty_transactions",
            "loyalty_accounts",
            "loyalty_tiers",
            "payments",
            "order_items",
            "order_status_history",
            "orders",
            "cart_items",
            "stores",
            "splash_content",
        ]

        for table_name in tables_to_clear:
            if table_name not in _ALLOWED_RESET_TABLES:
                raise HTTPException(status_code=400, detail=f"Invalid table name: {table_name}")
            await db.execute(text(f"DELETE FROM {table_name}"))

        await db.execute(text("DELETE FROM users WHERE id != 1"))

        sequences = [
            "stores_id_seq",
            "staff_id_seq",
            "menu_categories_id_seq",
            "menu_items_id_seq",
            "store_tables_id_seq",
            "inventory_categories_id_seq",
            "inventory_items_id_seq",
            "orders_id_seq",
            "loyalty_accounts_id_seq",
            "wallets_id_seq",
            "audit_log_id_seq",
        ]
        for seq in sequences:
            if seq not in _ALLOWED_SEQUENCES:
                raise HTTPException(status_code=400, detail=f"Invalid sequence name: {seq}")
            await db.execute(text(f"SELECT setval('{seq}', 1, false)"))

        ip = get_client_ip(request)
        await log_action(
            db, action="SYSTEM_RESET", user_id=user.id,
            entity_type="system", entity_id=0,
            details={"tables_cleared": len(tables_to_clear), "environment": settings.ENVIRONMENT},
            ip_address=ip, status="success",
        )

        return {
            "message": "Full system reset complete",
            "tables_cleared": len(tables_to_clear),
            "admin_preserved": True,
            "acl_preserved": True,
        }
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Reset failed: {str(e)}")


# ---------------------------------------------------------------------------
# System: Initialize HQ Store
# ---------------------------------------------------------------------------

@router.post("/system/init-hq")
async def init_hq_store(
    db: AsyncSession = Depends(get_db),
    user: AdminUser = Depends(require_role(RoleIDs.ADMIN)),
):
    existing = await db.execute(select(Store).where(Store.id == 0))
    hq = existing.scalar_one_or_none()
    if hq:
        return {
            "message": "HQ store already exists",
            "store_id": 0,
            "name": hq.name,
        }

    hq = Store(
        id=0,
        name="HQ (Headquarters)",
        slug="hq",
        address="Virtual Store - HQ",
        lat=3.1390,
        lng=101.6869,
        phone="+60300000000",
        is_active=True,
    )
    db.add(hq)
    await db.flush()

    await db.execute(
        text("SELECT setval('stores_id_seq', (SELECT COALESCE(MAX(id), 0) + 1 FROM stores))")
    )

    return {
        "message": "HQ store initialized",
        "store_id": 0,
        "name": "HQ (Headquarters)",
    }
