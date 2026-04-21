import os
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func, and_, text

from app.core.database import get_db
from app.core.security import get_current_user, require_hq_access, require_role
from app.core.audit import log_action, get_client_ip
from app.models.user import User, OTPSession, RoleIDs
from app.models.audit import AuditLog
from app.models.notification import NotificationBroadcast
from app.models.promotions import PromoBanner
from app.models.loyalty import LoyaltyTier
from app.models.store import Store
from app.schemas.admin_extras import (
    AuditLogOut,
    BroadcastCreate,
    BroadcastOut,
    PromoBannerCreate,
    PromoBannerUpdate,
    PromoBannerOut,
    LoyaltyTierOut,
    LoyaltyTierUpdate,
    LoyaltyTierCreate,
)

router = APIRouter()


# ---------------------------------------------------------------------------
# OTP Lookup (for testing/seed scripts only)
# ---------------------------------------------------------------------------

@router.get("/admin/otps")
async def lookup_otp(
    phone: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_hq_access()),
):
    """Admin-only endpoint to retrieve the most recent unverified OTP for a phone.
    For testing and seed script use only."""
    result = await db.execute(
        select(OTPSession)
        .where(OTPSession.phone == phone, OTPSession.verified == False)
        .order_by(desc(OTPSession.created_at))
        .limit(1)
    )
    otp = result.scalar_one_or_none()
    if not otp:
        return {"code": None, "message": "No unverified OTP found"}
    return {"code": otp.code, "expires_at": otp.expires_at}


# ---------------------------------------------------------------------------
# User Lookup (for admin/seed scripts)
# ---------------------------------------------------------------------------

@router.get("/admin/users/{user_id}")
async def get_user_by_id(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_hq_access()),
):
    """Admin-only endpoint to retrieve user details by ID."""
    from app.models.acl import UserType as ACLUserType, Role
    result = await db.execute(
        select(User, ACLUserType.name, Role.name)
        .outerjoin(ACLUserType, User.user_type_id == ACLUserType.id)
        .outerjoin(Role, User.role_id == Role.id)
        .where(User.id == user_id)
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    user, ut_name, role_name = row
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "phone": user.phone,
        "user_type_id": user.user_type_id,
        "role_id": user.role_id,
        "user_type": ut_name,
        "role": role_name,
        "avatar_url": user.avatar_url,
        "referral_code": user.referral_code,
        "is_active": user.is_active,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }


# ---------------------------------------------------------------------------
# Audit Log
# ---------------------------------------------------------------------------

@router.get("/admin/audit-log")
async def list_audit_log(
    user_id: int | None = None,
    store_id: int | None = None,
    action: str | None = None,
    from_date: datetime | None = None,
    to_date: datetime | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_hq_access()),
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

    # Total count
    count_query = select(func.count()).select_from(AuditLog)
    if user_id is not None:
        count_query = count_query.where(AuditLog.user_id == user_id)
    if store_id is not None:
        count_query = count_query.where(AuditLog.store_id == store_id)
    if action is not None:
        count_query = count_query.where(AuditLog.action == action)
    if from_date is not None:
        count_query = count_query.where(AuditLog.created_at >= from_date)
    if to_date is not None:
        count_query = count_query.where(AuditLog.created_at <= to_date)
    count_result = await db.execute(count_query)
    total = count_result.scalar() or 0

    # Paginated results
    paginated_query = base_query.order_by(desc(AuditLog.created_at)).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(paginated_query)
    logs = result.scalars().all()
    user_ids = [log.user_id for log in logs if log.user_id]
    if user_ids:
        users_result = await db.execute(
            select(User.id, User.email).where(User.id.in_(user_ids))
        )
        user_map = {u.id: u.email for u in users_result.all()}
    else:
        user_map = {}

    items = []
    for log in logs:
        user_email = user_map.get(log.user_id, "System") if log.user_id else "System"
        items.append({
            "id": log.id,
            "user_id": log.user_id,
            "store_id": log.store_id,
            "action": log.action,
            "details": log.details,
            "ip_address": log.ip_address or "-",
            "status": log.status,
            "created_at": log.created_at,
            "timestamp": log.created_at.isoformat() if log.created_at else None,
            "user_email": user_email,
        })
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
        "entries": items,
    }


# ---------------------------------------------------------------------------
# Broadcasts
# ---------------------------------------------------------------------------

@router.get("/admin/broadcasts")
async def list_broadcasts(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    is_archived: bool | None = Query(None),
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_hq_access()),
):
    query = select(NotificationBroadcast)
    count_query = select(func.count(NotificationBroadcast.id))

    if is_archived is not None:
        query = query.where(NotificationBroadcast.is_archived == is_archived)
        count_query = count_query.where(NotificationBroadcast.is_archived == is_archived)
    else:
        query = query.where(NotificationBroadcast.is_archived == False)
        count_query = count_query.where(NotificationBroadcast.is_archived == False)

    if from_date:
        try:
            fd = datetime.fromisoformat(from_date)
            query = query.where(NotificationBroadcast.created_at >= fd)
            count_query = count_query.where(NotificationBroadcast.created_at >= fd)
        except ValueError:
            pass
    if to_date:
        try:
            td = datetime.fromisoformat(to_date + "T23:59:59")
            query = query.where(NotificationBroadcast.created_at <= td)
            count_query = count_query.where(NotificationBroadcast.created_at <= td)
        except ValueError:
            pass

    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    query = query.order_by(desc(NotificationBroadcast.created_at)).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    items = result.scalars().all()

    return {
        "broadcasts": [
            {
                "id": b.id,
                "title": b.title,
                "body": b.body,
                "audience": b.audience,
                "store_id": b.store_id,
                "scheduled_at": b.scheduled_at.isoformat() if b.scheduled_at else None,
                "sent_at": b.sent_at.isoformat() if b.sent_at else None,
                "sent_count": b.sent_count,
                "open_count": b.open_count,
                "is_archived": b.is_archived,
                "status": b.status or "draft",
                "created_at": b.created_at.isoformat() if b.created_at else None,
            }
            for b in items
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
    }


@router.patch("/admin/broadcasts/{broadcast_id}/archive")
async def toggle_archive_broadcast(
    broadcast_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_hq_access()),
):
    result = await db.execute(select(NotificationBroadcast).where(NotificationBroadcast.id == broadcast_id))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(404, "Broadcast not found")
    obj.is_archived = not obj.is_archived
    ip = get_client_ip(request)
    action = "ARCHIVE_BROADCAST" if obj.is_archived else "UNARCHIVE_BROADCAST"
    await log_action(db, action=action, user_id=user.id, entity_type="broadcast", entity_id=broadcast_id, details={"title": obj.title}, ip_address=ip)
    await db.flush()
    await db.refresh(obj)
    return {"id": obj.id, "is_archived": obj.is_archived}


@router.post("/admin/broadcasts", response_model=BroadcastOut)
async def create_broadcast(
    request: Request,
    data: BroadcastCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_hq_access()),
):
    obj = NotificationBroadcast(created_by=user.id, status=data.status, **data.model_dump(exclude={"status"}))
    db.add(obj)
    await db.flush()
    ip = get_client_ip(request)
    await log_action(db, action="CREATE_BROADCAST", user_id=user.id, entity_type="broadcast", entity_id=obj.id, details={"title": obj.title, "audience": obj.audience, "status": obj.status}, ip_address=ip)
    await db.flush()
    await db.refresh(obj)
    return obj


@router.put("/admin/broadcasts/{broadcast_id}")
async def update_broadcast(
    broadcast_id: int,
    request: Request,
    data: dict,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_hq_access()),
):
    result = await db.execute(select(NotificationBroadcast).where(NotificationBroadcast.id == broadcast_id))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(404, "Broadcast not found")
    if obj.status not in ("draft", "pending"):
        raise HTTPException(400, "Can only edit draft broadcasts")
    allowed = {"title", "body", "audience", "store_id", "scheduled_at"}
    changes = {}
    for k, v in data.items():
        if k in allowed and hasattr(obj, k):
            setattr(obj, k, v)
            changes[k] = v
    ip = get_client_ip(request)
    await log_action(db, action="UPDATE_BROADCAST", user_id=user.id, entity_type="broadcast", entity_id=broadcast_id, details={"changes": changes}, ip_address=ip)
    await db.flush()
    await db.refresh(obj)
    return {"id": obj.id, "title": obj.title, "status": obj.status}


@router.delete("/admin/broadcasts/{broadcast_id}")
async def delete_broadcast(
    broadcast_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_hq_access()),
):
    result = await db.execute(select(NotificationBroadcast).where(NotificationBroadcast.id == broadcast_id))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(404, "Broadcast not found")
    if obj.status not in ("draft", "pending"):
        raise HTTPException(400, "Can only delete draft broadcasts")
    ip = get_client_ip(request)
    await log_action(db, action="DELETE_BROADCAST", user_id=user.id, entity_type="broadcast", entity_id=broadcast_id, details={"title": obj.title}, ip_address=ip)
    await db.delete(obj)
    await db.flush()
    return {"detail": "Broadcast deleted"}


@router.post("/admin/broadcasts/{broadcast_id}/send")
async def send_broadcast(
    broadcast_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_hq_access()),
):
    result = await db.execute(select(NotificationBroadcast).where(NotificationBroadcast.id == broadcast_id))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(404, "Broadcast not found")
    if obj.status not in ("draft", "pending"):
        raise HTTPException(400, "Can only send draft broadcasts")
    obj.status = "sent"
    obj.sent_at = datetime.now(timezone.utc)
    obj.sent_count = 0
    ip = get_client_ip(request)
    await log_action(db, action="SEND_BROADCAST", user_id=user.id, entity_type="broadcast", entity_id=broadcast_id, details={"title": obj.title}, ip_address=ip)
    await db.flush()
    await db.refresh(obj)
    return {"id": obj.id, "status": obj.status, "sent_at": obj.sent_at.isoformat() if obj.sent_at else None}


# ---------------------------------------------------------------------------
# Banners (Promo)
# ---------------------------------------------------------------------------

@router.get("/banners", response_model=list[PromoBannerOut])
async def list_active_banners(
    db: AsyncSession = Depends(get_db),
):
    """Public endpoint — returns active banners for the customer app."""
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(PromoBanner).where(
            PromoBanner.is_active == True,
            (PromoBanner.start_date == None) | (PromoBanner.start_date <= now),
        ).order_by(PromoBanner.position)
    )
    return result.scalars().all()


@router.get("/admin/banners")
async def list_banners(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_hq_access()),
):
    count_q = select(func.count()).select_from(PromoBanner)
    total_result = await db.execute(count_q)
    total = total_result.scalar() or 0

    result = await db.execute(
        select(PromoBanner).order_by(desc(PromoBanner.created_at))
        .offset((page - 1) * page_size).limit(page_size)
    )
    banners = result.scalars().all()
    return {
        "banners": banners,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
    }


@router.post("/admin/banners", status_code=201, response_model=PromoBannerOut)
async def create_banner(
    request: Request,
    data: PromoBannerCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_hq_access()),
):
    obj = PromoBanner(**data.model_dump())
    db.add(obj)
    await db.flush()
    ip = get_client_ip(request)
    await log_action(db, action="CREATE_BANNER", user_id=user.id, entity_type="banner", entity_id=obj.id, details={"title": obj.title}, ip_address=ip)
    await db.flush()
    await db.refresh(obj)
    return obj


@router.put("/admin/banners/{banner_id}", response_model=PromoBannerOut)
async def update_banner(
    banner_id: int,
    request: Request,
    data: PromoBannerUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_hq_access()),
):
    result = await db.execute(select(PromoBanner).where(PromoBanner.id == banner_id))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(404)
    changes = data.model_dump(exclude_unset=True)
    for key, value in changes.items():
        setattr(obj, key, value)
    ip = get_client_ip(request)
    await log_action(db, action="UPDATE_BANNER", user_id=user.id, entity_type="banner", entity_id=banner_id, details={"changes": changes}, ip_address=ip)
    await db.flush()
    await db.refresh(obj)
    return obj


@router.delete("/admin/banners/{banner_id}")
async def delete_banner(
    banner_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_hq_access()),
):
    result = await db.execute(select(PromoBanner).where(PromoBanner.id == banner_id))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(404)
    ip = get_client_ip(request)
    await log_action(db, action="DELETE_BANNER", user_id=user.id, entity_type="banner", entity_id=banner_id, details={"title": obj.title}, ip_address=ip)
    await db.delete(obj)
    await db.flush()
    return {"detail": "Banner deleted"}


# ---------------------------------------------------------------------------
# Loyalty Tiers
# ---------------------------------------------------------------------------

@router.get("/admin/loyalty-tiers", response_model=list[LoyaltyTierOut])
async def list_loyalty_tiers(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_hq_access()),
):
    result = await db.execute(select(LoyaltyTier).order_by(LoyaltyTier.sort_order, LoyaltyTier.min_points))
    return result.scalars().all()


@router.post("/admin/loyalty-tiers", status_code=201, response_model=LoyaltyTierOut)
async def create_loyalty_tier(
    request: Request,
    data: LoyaltyTierCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_hq_access()),
):
    obj = LoyaltyTier(**data.model_dump())
    db.add(obj)
    await db.flush()
    ip = get_client_ip(request)
    await log_action(db, action="CREATE_LOYALTY_TIER", user_id=user.id, entity_type="loyalty_tier", entity_id=obj.id, details={"name": obj.name, "min_points": obj.min_points}, ip_address=ip)
    await db.flush()
    await db.refresh(obj)
    return obj


@router.put("/admin/loyalty-tiers/{tier_id}", response_model=LoyaltyTierOut)
async def update_loyalty_tier(
    tier_id: int,
    request: Request,
    data: LoyaltyTierUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_hq_access()),
):
    result = await db.execute(select(LoyaltyTier).where(LoyaltyTier.id == tier_id))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(404)
    changes = data.model_dump(exclude_unset=True)
    for key, value in changes.items():
        setattr(obj, key, value)
    ip = get_client_ip(request)
    await log_action(db, action="UPDATE_LOYALTY_TIER", user_id=user.id, entity_type="loyalty_tier", entity_id=tier_id, details={"changes": changes}, ip_address=ip)
    await db.flush()
    await db.refresh(obj)
    return obj


@router.delete("/admin/loyalty-tiers/{tier_id}")
async def delete_loyalty_tier(
    tier_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_hq_access()),
):
    result = await db.execute(select(LoyaltyTier).where(LoyaltyTier.id == tier_id))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(404, "Tier not found")
    ip = get_client_ip(request)
    await log_action(db, action="DELETE_LOYALTY_TIER", user_id=user.id, entity_type="loyalty_tier", entity_id=tier_id, details={"name": obj.name}, ip_address=ip)
    await db.delete(obj)
    await db.flush()
    return {"message": "Tier deleted", "id": tier_id}


# ---------------------------------------------------------------------------
# System: Full Reset
# ---------------------------------------------------------------------------

@router.delete("/admin/system/reset")
async def full_system_reset(
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(RoleIDs.ADMIN)),
):
    """Full system reset — wipes ALL data except:
    - Admin user (id=1)
    - ACL tables: user_types, roles, role_user_type, permissions, role_permissions
    - app_config

    Use with caution. This is irreversible.
    """
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
            "cart_items", "stores", "splash_content", "users",
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

        # Delete non-admin users
        await db.execute(text("DELETE FROM users WHERE id != 1"))

        # Reset all sequences
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


        # No audit log for system reset — we wipe it anyway

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

@router.post("/admin/system/init-hq")
async def init_hq_store(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(RoleIDs.ADMIN)),
):
    """Create or ensure HQ virtual store (id=0) exists.
    This is idempotent — if HQ store already exists, returns 200.

    The HQ store is a sentinel used throughout the codebase for:
    - Universal menu (all menu items under store_id=0)
    - HQ staff default store_id=0
    - Store operations that apply globally

    Since POST /admin/stores uses auto-increment, we need a dedicated
    endpoint to create the HQ store with explicit id=0.
    """
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


# ---------------------------------------------------------------------------
# PWA Management: Version & Cache
# ---------------------------------------------------------------------------

@router.post("/admin/pwa/rebuild")
async def pwa_rebuild(
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_hq_access()),
):
    """Trigger a new PWA build with incremented version.
    Updates manifest.json and service worker, then rebuilds.
    """
    import subprocess
    import json
    from datetime import datetime, timezone

    customer_dir = "/root/fnb-super-app/customer-app"
    manifest_path = f"{customer_dir}/public/manifest.json"
    sw_path = f"{customer_dir}/public/sw.js"

    # Generate new version
    timestamp = int(datetime.now(timezone.utc).timestamp())
    version = f"1.0.{timestamp}"
    build_date = datetime.now(timezone.utc).isoformat()

    # Update manifest.json
    try:
        with open(manifest_path, 'r') as f:
            manifest = json.load(f)
        manifest['version'] = version
        manifest['build_date'] = build_date
        with open(manifest_path, 'w') as f:
            json.dump(manifest, f, indent=2)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update manifest: {str(e)}")

    # Update service worker
    try:
        with open(sw_path, 'r') as f:
            sw_content = f.read()
        sw_content = sw_content.replace(
            "const CACHE_VERSION = '",
            f"const CACHE_VERSION = 'v{version}'; // Updated by rebuild\n// const CACHE_VERSION = '"
        )
        with open(sw_path, 'w') as f:
            f.write(sw_content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update service worker: {str(e)}")

    # Clear build cache
    import shutil
    next_dir = f"{customer_dir}/.next"
    if os.path.exists(next_dir):
        shutil.rmtree(next_dir)

    # Run build
    try:
        result = subprocess.run(
            ["npm", "run", "build"],
            cwd=customer_dir,
            capture_output=True,
            text=True,
            timeout=300
        )
        if result.returncode != 0:
            raise HTTPException(status_code=500, detail=f"Build failed: {result.stderr}")
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=500, detail="Build timed out")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Build error: {str(e)}")

    # Log action
    ip = get_client_ip(request)
    await log_action(
        db, action="PWA_REBUILD", user_id=user.id,
        entity_type="pwa", entity_id=0,
        details={"version": version, "build_date": build_date},
        ip_address=ip
    )

    return {
        "version": version,
        "build_date": build_date,
        "cache_name": f"loka-pwa-v{version}",
        "message": "PWA rebuilt successfully"
    }


@router.post("/admin/pwa/clear-cache")
async def pwa_clear_cache(
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_hq_access()),
):
    """Clear PWA build cache without rebuilding.
    Forces fresh content on next deployment.
    """
    import shutil
    import os

    customer_dir = "/root/fnb-super-app/customer-app"
    next_dir = f"{customer_dir}/.next"

    cleared = False
    if os.path.exists(next_dir):
        shutil.rmtree(next_dir)
        cleared = True

    # Log action
    ip = get_client_ip(request)
    await log_action(
        db, action="PWA_CLEAR_CACHE", user_id=user.id,
        entity_type="pwa", entity_id=0,
        details={"cache_cleared": cleared},
        ip_address=ip
    )

    return {
        "cache_cleared": cleared,
        "message": "PWA cache cleared" if cleared else "No cache to clear"
    }


@router.get("/admin/pwa/version")
async def pwa_get_version(
    user: User = Depends(require_hq_access()),
):
    """Get current PWA version info from manifest."""
    import json
    from datetime import datetime, timezone

    manifest_path = "/root/fnb-super-app/customer-app/public/manifest.json"

    try:
        with open(manifest_path, 'r') as f:
            manifest = json.load(f)
        return {
            "version": manifest.get('version', '1.0.0'),
            "build_date": manifest.get('build_date', datetime.now(timezone.utc).isoformat()),
            "name": manifest.get('name', 'Loka Espresso'),
            "cache_name": f"loka-pwa-v{manifest.get('version', '1.0.0')}",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read manifest: {str(e)}")


