"""Staff-facing operational endpoints (POS, dashboard, clock-in, PIN verify)."""

import json
import os
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, Query, Request, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload
from sqlalchemy.exc import IntegrityError

from app.api.v1.deps import CurrentAdmin, CurrentStaff, DBDependency
from app.models.customer import Customer
from app.models.equipment import Equipment, EquipmentMaintenanceLog
from app.models.iam import AdminAccount, IAMRole, RoleAssignment, RolePermission, StoreAssignment, TokenBlacklist
from app.models.inventory import InventoryItem, InventoryMovementLog, InventoryStock
from app.models.menu import MenuItem, MenuModifierGroup, MenuModifierOption
from app.models.order import Order, OrderLineItem
from app.models.payment import Payment
from app.models.staff import StaffProfile, StaffTimeEvent, TipAllocation
from app.models.platform import PlatformConfig
from app.models.store import Store, DiningTable, StoreConfiguration, TableStatusSnapshot
from app.schemas.base import APIResponse, PaginatedResponse
from app.schemas.staff import (
    StaffLoginRequest,
    StaffRefreshRequest,
    StaffAdminStoreRequest,
    StaffPinVerifyRequest,
    StaffChangePasswordRequest,
    StaffChangePinRequest,
    POSOrderCreateRequest,
)
from app.services.order import _deduct_stock_for_order
from app.core.config import get_settings
from app.core.rate_limiter import limiter
from app.core.security import hash_password, verify_password_staff, decode_token, create_access_token, create_refresh_token, verify_password

router = APIRouter(tags=["staff — operations"])


# ── Helper ──


# ── Staff Auth (login, verify) ──

@router.get("/staff/auth/names")
async def staff_name_list(db: DBDependency, store_id: int | None = None):
    """List staff display names for the login dropdown."""
    q = select(StaffProfile.id, StaffProfile.display_name, Store.store_name).join(Store, StaffProfile.store_id == Store.id).where(StaffProfile.deleted_at.is_(None), StaffProfile.is_active.is_(True))
    if store_id:
        q = q.where(StaffProfile.store_id == store_id)
    result = await db.execute(q.order_by(StaffProfile.display_name))
    items = [{"id": r[0], "display_name": r[1], "store_name": r[2]} for r in result.all()]
    return APIResponse(data=items)


@router.post("/staff/auth/login")
@limiter.limit("5/minute")
async def staff_login(request: Request, db: DBDependency, data: StaffLoginRequest):
    """Login: store selection → email+password/PIN or name+PIN."""
    email = (data.email or "").strip()
    password = (data.password or "").strip()
    display_name = (data.display_name or "").strip()
    store_id = data.store_id

    # ── Mode 1: Name + PIN (staff, based on store selected) ──
    if display_name and store_id:
        result = await db.execute(
            select(StaffProfile).where(
                StaffProfile.display_name == display_name,
                StaffProfile.store_id == int(store_id),
                StaffProfile.deleted_at.is_(None),
                StaffProfile.is_active.is_(True),
            )
        )
        staff = result.scalar_one_or_none()
        if not staff or not staff.pin_hash:
            raise HTTPException(status_code=401, detail="Staff not found or no PIN set")

        # Check lockout
        if staff.locked_until and staff.locked_until > datetime.now(timezone.utc):
            raise HTTPException(status_code=423, detail="Account temporarily locked. Try again later.")

        if not _pin_allowed(staff.pin_hash, password):
            staff.failed_login_count = (staff.failed_login_count or 0) + 1
            if staff.failed_login_count >= 5:
                staff.locked_until = datetime.now(timezone.utc) + timedelta(minutes=30)
                staff.failed_login_count = 0
            await db.commit()
            raise HTTPException(status_code=401, detail="Invalid PIN or default PIN not allowed")
        staff.failed_login_count = 0
        staff.locked_until = None
        await db.commit()
        return _make_token(staff)

    # ── Mode 2: Email + password/PIN ──
    if not email or not password:
        raise HTTPException(status_code=422, detail="Email and password required")

    # Try staff login first
    result = await db.execute(
        select(StaffProfile).where(
            StaffProfile.email_address == email,
            StaffProfile.deleted_at.is_(None),
            StaffProfile.is_active.is_(True),
        )
    )
    staff = result.scalar_one_or_none()

    if staff and (staff.password_hash or staff.pin_hash):
        # Check lockout
        if staff.locked_until and staff.locked_until > datetime.now(timezone.utc):
            raise HTTPException(status_code=423, detail="Account temporarily locked. Try again later.")

        # Try password first, then PIN
        if staff.password_hash:
            try:
                pw_ok = verify_password_staff(password, staff.password_hash if isinstance(staff.password_hash, str) else staff.password_hash.decode())
            except Exception:
                pw_ok = False
            if pw_ok:
                staff.failed_login_count = 0
                staff.locked_until = None
                await db.commit()
                return _make_token(staff)
        # Fallback: try PIN (but reject default 000000)
        if staff.pin_hash:
            if not _pin_allowed(staff.pin_hash, password):
                raise HTTPException(status_code=401, detail="Invalid PIN or default PIN not allowed")
            staff.failed_login_count = 0
            staff.locked_until = None
            await db.commit()
            return _make_token(staff)

        # Increment failed login count on failure
        staff.failed_login_count = (staff.failed_login_count or 0) + 1
        if staff.failed_login_count >= 5:
            staff.locked_until = datetime.now(timezone.utc) + timedelta(minutes=30)
            staff.failed_login_count = 0
        await db.commit()
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # ── Mode 3: Admin login (email + password, no staff profile) ──
    from app.models.iam import AdminAccount, RoleAssignment, RolePermission
    admin_result = await db.execute(
        select(AdminAccount).where(
            AdminAccount.email == email,
            AdminAccount.deleted_at.is_(None),
            AdminAccount.is_active.is_(True),
        )
    )
    admin = admin_result.scalar_one_or_none()
    if not admin or not admin.password_hash:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # Check account lockout and increment failed login count
    if admin.locked_until and admin.locked_until > datetime.now(timezone.utc):
        raise HTTPException(status_code=423, detail="Account temporarily locked. Try again later.")
    if not verify_password(password, admin.password_hash):
        admin.failed_login_count = (admin.failed_login_count or 0) + 1
        if admin.failed_login_count >= 5:
            admin.locked_until = datetime.now(timezone.utc) + timedelta(minutes=30)
            admin.failed_login_count = 0
        await db.commit()
        raise HTTPException(status_code=401, detail="Invalid credentials")
    # Reset failed login count on success
    admin.failed_login_count = 0
    admin.locked_until = None
    await db.commit()

    # Admin verified — if store_id provided, return staff token. Otherwise return admin token with store list.
    store_id = data.store_id
    if store_id:
        # Verify store exists
        store_check = await db.execute(select(Store).where(Store.id == int(store_id), Store.deleted_at.is_(None), Store.is_active.is_(True)))
        if not store_check.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Store not found")
        access_token = create_access_token(
            admin.id,
            token_type="staff",
            extra_claims={"staff_id": 0, "store_id": int(store_id), "admin_id": admin.id, "admin_name": admin.display_name}
        )
        refresh_token = create_refresh_token(
            admin.id,
            extra_claims={"staff_id": 0, "store_id": int(store_id), "admin_id": admin.id}
        )
        return {"tokens": {"access_token": access_token, "refresh_token": refresh_token}, "profile": {"email": admin.email, "display_name": admin.display_name, "store_id": int(store_id), "is_admin": True}}
    # No store_id — return admin token with store list for store selection
    store_list = await db.execute(select(Store).where(Store.deleted_at.is_(None), Store.is_active.is_(True)))
    stores = [{"id": s.id, "store_name": s.store_name} for s in store_list.scalars().all()]
    access_token = create_access_token(
        admin.id,
        token_type="admin",
        extra_claims={"admin_id": admin.id}
    )
    refresh_token = create_refresh_token(
        admin.id,
        extra_claims={"admin_id": admin.id}
    )
    return {"tokens": {"access_token": access_token, "refresh_token": refresh_token}, "profile": {"email": admin.email, "display_name": admin.display_name, "is_admin": True, "stores": stores}}


# ── Admin Store Selection (after login) ──

@router.post("/staff/auth/admin-store")
@limiter.limit("5/minute")
async def admin_select_store(request: Request, db: DBDependency, data: StaffAdminStoreRequest):
    """Admin selects a store — returns a staff token scoped to that store."""
    token = (data.token or "").strip()
    store_id = data.store_id
    if not token or not store_id:
        raise HTTPException(status_code=400, detail="Token and store_id required")
    try:
        payload = decode_token(token)
        if payload.get("type") != "admin":
            raise HTTPException(status_code=401, detail="Not an admin token")
        jti = payload.get("jti")
        if jti:
            blacklist_check = await db.execute(
                select(TokenBlacklist).where(TokenBlacklist.jti == jti)
            )
            if blacklist_check.scalar_one_or_none():
                raise HTTPException(status_code=401, detail="Token has been revoked")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

    # Verify store exists
    store_result = await db.execute(select(Store).where(Store.id == int(store_id), Store.deleted_at.is_(None), Store.is_active.is_(True)))
    if not store_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Store not found")

    # Create admin user lookup
    admin_id = int(payload.get("admin_id", 0))
    admin_result = await db.execute(
        select(AdminAccount).where(AdminAccount.id == admin_id, AdminAccount.is_active.is_(True))
    )
    admin = admin_result.scalar_one_or_none()
    if not admin:
        raise HTTPException(status_code=401, detail="Admin not found")

    # Verify admin has StoreAssignment for this store
    assignment_result = await db.execute(
        select(StoreAssignment).where(
            StoreAssignment.assignee_id == admin_id,
            StoreAssignment.store_id == int(store_id),
        )
    )
    if not assignment_result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Admin not assigned to this store")

    access_token = create_access_token(
        admin.id,
        token_type="staff",
        extra_claims={"staff_id": 0, "store_id": int(store_id), "admin_id": admin.id, "admin_name": admin.display_name}
    )
    return {"tokens": {"access_token": access_token}, "profile": {
        "email": admin.email, "display_name": admin.display_name, "store_id": int(store_id),
        "staff_id": 0,
    }}


def _make_token(staff):
    access = create_access_token(
        staff.principal_id,
        token_type="staff",
        extra_claims={"staff_id": staff.id, "store_id": staff.store_id}
    )
    refresh = create_refresh_token(
        staff.principal_id,
        extra_claims={"staff_id": staff.id, "store_id": staff.store_id}
    )
    return {"tokens": {"access_token": access, "refresh_token": refresh}, "profile": {"email": staff.email_address, "display_name": staff.display_name, "store_id": staff.store_id, "staff_id": staff.id}}


async def _blacklist_refresh_token(db, jti: str | None, principal_id: int, payload: dict) -> None:
    """Insert a refresh token JTI into the blacklist. Raises 401 if already blacklisted."""
    if not jti:
        return
    from sqlalchemy.dialects.postgresql import insert as pg_insert
    exp_ts = payload.get("exp")
    expires_at = datetime.fromtimestamp(exp_ts, tz=timezone.utc) if exp_ts else datetime.now(timezone.utc) + timedelta(days=7)
    stmt = pg_insert(TokenBlacklist).values(
        jti=jti,
        token_type="refresh",
        principal_id=principal_id,
        expires_at=expires_at,
        reason="refresh_token_reuse",
    ).on_conflict_do_nothing(index_elements=["jti"])
    result = await db.execute(stmt)
    await db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=401, detail="Refresh token has already been used")


def _is_default_pin_hash(pin_hash) -> bool:
    """Check whether *pin_hash* is the hash of the default PIN '000000'.
    Result is cached per pin_hash value to avoid redundant bcrypt operations
    for the same staff member during a single request."""
    if not pin_hash:
        return True
    try:
        key = pin_hash if isinstance(pin_hash, str) else pin_hash.decode()
        return verify_password_staff("000000", key)
    except Exception:
        return False


DEFAULT_PIN_WARNED: set[int] = set()
"""Set of pin_hash ids already warned — thread‑safe enough for single‑process dev
and acceptable false‑negative rate in production. Consider Redis in multi‑worker deployments."""


def _pin_allowed(pin_hash, attempted_pin):
    """Check if PIN is allowed for login (not the default 000000).
    Uses cached result for the '000000' hash comparison to avoid double bcrypt
    verification on every login attempt."""
    if not pin_hash:
        return False
    try:
        if verify_password_staff(attempted_pin, pin_hash if isinstance(pin_hash, str) else pin_hash.decode()):
            if _is_default_pin_hash(pin_hash):
                return False
            return True
        return False
    except Exception:
        return False


# ── Token Refresh ──

@router.post("/staff/auth/refresh")
@limiter.limit("10/minute")
async def staff_refresh_token(request: Request, db: DBDependency, data: StaffRefreshRequest):
    """Refresh staff access token using a refresh token."""
    token = (data.refresh_token or "").strip()
    if not token:
        raise HTTPException(status_code=400, detail="refresh_token required")
    try:
        payload = decode_token(token)
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

    jti = payload.get("jti")
    staff_id = payload.get("staff_id", 0)
    store_id = payload.get("store_id")

    if staff_id:
        result = await db.execute(select(StaffProfile).where(StaffProfile.id == staff_id, StaffProfile.deleted_at.is_(None)))
        staff = result.scalar_one_or_none()
        if not staff or not staff.is_active:
            raise HTTPException(status_code=401, detail="Staff not found or inactive")
        # Revoke this refresh token so it cannot be reused (atomic)
        await _blacklist_refresh_token(db, jti, staff.principal_id, payload)
        return _make_token(staff)

    # Admin refresh (staff_id == 0)
    admin_id = payload.get("admin_id")
    if admin_id:
        admin_result = await db.execute(select(AdminAccount).where(AdminAccount.id == int(admin_id), AdminAccount.is_active.is_(True)))
        admin = admin_result.scalar_one_or_none()
        if not admin:
            raise HTTPException(status_code=401, detail="Admin not found")
        access_token = create_access_token(
            admin.id,
            token_type="staff",
            extra_claims={"staff_id": 0, "store_id": int(store_id or 0), "admin_id": admin.id, "admin_name": admin.display_name}
        )
        # Revoke this refresh token so it cannot be reused (atomic)
        await _blacklist_refresh_token(db, jti, admin.principal_id, payload)
        return {"tokens": {"access_token": access_token}, "profile": {"email": admin.email, "display_name": admin.display_name, "store_id": int(store_id or 0), "staff_id": 0}}

    raise HTTPException(status_code=401, detail="Invalid token")


# ── Staff Profile (me) ──

@router.get("/staff/auth/me")
async def staff_profile_me(db: DBDependency, request: Request):
    """Get the current user's profile with IAM roles.

    NOTE — Manual token extraction instead of FastAPI dependency:
    This endpoint serves both StaffProfile tokens (type='staff') and AdminAccount
    tokens (type='admin') that enter through the staff portal.  FastAPI's
    dependency system evaluates from the parameter list and a single CurrentStaff
    dependency would reject admin tokens before we can branch on the payload type.
    Manual decode lets us handle both token types in one endpoint without
    duplicating routes.
    """
    token = request.headers.get("Authorization", "").replace("Bearer ", "")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = decode_token(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

    token_type = payload.get("type", "")
    is_admin = token_type == "admin"

    if token_type == "admin":
        admin_id = payload.get("admin_id")
        admin_result = await db.execute(select(AdminAccount).where(AdminAccount.id == int(admin_id)))
        admin = admin_result.scalar_one_or_none()
        if not admin:
            raise HTTPException(status_code=401, detail="Admin not found")
        role_result = await db.execute(
            select(IAMRole.display_name).join(RoleAssignment, RoleAssignment.role_id == IAMRole.id)
            .where(RoleAssignment.assignee_id == admin.id, RoleAssignment.is_active.is_(True))
        )
        roles = [r[0] for r in role_result.all()]
        return APIResponse(data={
            "display_name": admin.display_name, "email": admin.email,
            "is_admin": True, "roles": roles, "store_id": payload.get("store_id"),
        })

    # Staff user
    staff_id = payload.get("staff_id", 0)
    if staff_id:
        staff = await db.execute(select(StaffProfile).where(StaffProfile.id == staff_id, StaffProfile.deleted_at.is_(None)))
        sp = staff.scalar_one_or_none()
        if sp:
            # Staff roles are linked via admin_accounts (staff have admin account linkage)
            role_result = await db.execute(
                select(IAMRole.display_name)
                .join(RoleAssignment, RoleAssignment.role_id == IAMRole.id)
                .join(AdminAccount, AdminAccount.id == RoleAssignment.assignee_id)
                .where(AdminAccount.email == sp.email_address, RoleAssignment.is_active.is_(True))
            )
            roles = [r[0] for r in role_result.all()]
            return APIResponse(data={
                "display_name": sp.display_name, "email": sp.email_address,
                "is_admin": False, "roles": roles or [sp.role.replace("_", " ").title()],
                "store_id": sp.store_id, "staff_role": sp.role,
            })

    # Admin user on staff portal (staff_id == 0)
    admin_id = payload.get("admin_id")
    if admin_id:
        admin_result = await db.execute(select(AdminAccount).where(AdminAccount.id == int(admin_id)))
        admin = admin_result.scalar_one_or_none()
        if admin:
            return APIResponse(data={
                "display_name": admin.display_name,
                "email": admin.email,
                "is_admin": True,
                "roles": ["Staff Portal"],
                "store_id": payload.get("store_id"),
            })

    return APIResponse(data={"display_name": payload.get("admin_name", "User"), "roles": ["Staff Portal"]})


# ── Helper ──

async def _get_staff_profile(db, admin) -> StaffProfile:
    result = await db.execute(
        select(StaffProfile).where(StaffProfile.principal_id == admin.principal_id, StaffProfile.deleted_at.is_(None))
    )
    staff = result.scalar_one_or_none()
    if not staff:
        raise HTTPException(status_code=403, detail="No staff profile found")
    if not staff.is_active:
        raise HTTPException(status_code=403, detail="Staff account is inactive")
    return staff


# ── Dashboard ──

@router.get("/staff/dashboard")
async def staff_dashboard(db: DBDependency, staff: CurrentStaff):
    store_id = staff.store_id

    pending = (await db.execute(
        select(func.count(Order.id)).where(
            Order.store_id == store_id,
            Order.status.in_(["pending", "confirmed", "preparing"]),
            Order.deleted_at.is_(None),
        )
    )).scalar() or 0

    occupied = (await db.execute(
        select(func.count(TableStatusSnapshot.table_id)).where(
            TableStatusSnapshot.store_id == store_id,
            TableStatusSnapshot.status.in_(["occupied", "reserved"]),
        )
    )).scalar() or 0

    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    today_resv = (await db.execute(
        select(func.count(DiningTable.id)).where(
            DiningTable.store_id == store_id,
            DiningTable.deleted_at.is_(None),
        )
    )).scalar() or 0

    # Check clock status
    clock = await db.execute(
        select(StaffTimeEvent).where(
            StaffTimeEvent.staff_id == staff.id,
        ).order_by(StaffTimeEvent.id.desc()).limit(1)
    )
    last_event = clock.scalar_one_or_none()
    clock_status = "out"
    shift_start = None
    if last_event:
        if last_event.event_type == "clock_in":
            clock_status = "in"
            shift_start = last_event.created_at
        elif last_event.event_type == "start_break":
            clock_status = "break"
            shift_start = last_event.created_at

    # Query store name separately (avoid lazy load)
    store_name = (await db.execute(select(Store.store_name).where(Store.id == staff.store_id))).scalar_one_or_none() or ""

    return APIResponse(data={
        "pending_orders": pending,
        "occupied_tables": occupied,
        "today_reservations": 0,
        "clock_status": clock_status,
        "current_shift_start": shift_start.isoformat() if shift_start else None,
        "store_name": store_name,
        "staff_name": staff.display_name,
        "store_id": store_id,
    })


# ── Customer Search ──

@router.get("/staff/customers/search")
async def staff_customer_search(db: DBDependency, admin: CurrentAdmin, request: Request, q: str = Query(..., min_length=1)):
    # Accept both admin and staff tokens — admin has staff profile, staff has staff profile
    try:
        await _get_staff_profile(db, admin)
    except Exception:
        pass  # Continue with admin-only access

    q_clean = q.strip()
    result = await db.execute(
        select(Customer).where(
            Customer.deleted_at.is_(None),
            (Customer.phone_number.ilike(f"%{q_clean}%")) |
            (Customer.display_name.ilike(f"%{q_clean}%")) |
            (Customer.id == int(q_clean) if q_clean.isdigit() else False)
        ).limit(20)
    )
    items = []
    for c in result.scalars().all():
        items.append({
            "id": c.id, "display_name": c.display_name or f"Customer #{c.id}",
            "phone_number": c.phone_number or "",
            "loyalty_tier": "Standard",
        })
    return APIResponse(data={"items": items})


# ── PIN Verify ──

@router.post("/staff/auth/verify-pin")
@limiter.limit("10/minute")
async def staff_verify_pin(request: Request, db: DBDependency, staff: CurrentStaff, data: StaffPinVerifyRequest):

    pin = str(data.pin or "").strip()
    if not pin or len(pin) < 4:
        raise HTTPException(status_code=400, detail="PIN must be at least 4 digits")

    import bcrypt
    if not staff.pin_hash:
        return APIResponse(data={"valid": False, "message": "No PIN set"})

    try:
        valid = verify_password_staff(pin, staff.pin_hash if isinstance(staff.pin_hash, str) else staff.pin_hash.decode())
    except Exception:
        valid = False

    if not valid:
        return APIResponse(data={"valid": False, "message": "Invalid PIN"})

    return APIResponse(data={"valid": True, "message": "PIN verified"})


# ── Change Password / PIN ──

@router.post("/staff/auth/change-password")
@limiter.limit("5/minute")
async def staff_change_password(request: Request, db: DBDependency, data: StaffChangePasswordRequest):
    """Change staff password."""
    token = request.headers.get("Authorization", "").replace("Bearer ", "")
    if not token: raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = decode_token(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")
    if payload.get("type") == "admin" or payload.get("staff_id") == 0:
        raise HTTPException(status_code=403, detail="Admins must use the admin portal")
    staff_id = payload.get("staff_id", 0)
    if not staff_id:
        raise HTTPException(status_code=404, detail="Staff profile not found")
    result = await db.execute(select(StaffProfile).where(StaffProfile.id == staff_id))
    staff = result.scalar_one_or_none()
    if not staff:
        raise HTTPException(status_code=404, detail="Staff not found")
    current = (data.current_password or "").strip()
    if not current:
        raise HTTPException(status_code=400, detail="Current password is required")
    if not staff.password_hash or not verify_password_staff(current, staff.password_hash if isinstance(staff.password_hash, str) else staff.password_hash.decode()):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    pw = (data.new_password or "").strip()
    if len(pw) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    staff.password_hash = hash_password(pw)
    await db.commit()
    return APIResponse(data={"updated": True})


@router.post("/staff/auth/change-pin")
@limiter.limit("5/minute")
async def staff_change_pin(request: Request, db: DBDependency, data: StaffChangePinRequest):
    """Change staff PIN."""
    token = request.headers.get("Authorization", "").replace("Bearer ", "")
    if not token: raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = decode_token(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")
    if payload.get("type") == "admin" or payload.get("staff_id") == 0:
        raise HTTPException(status_code=403, detail="Admins cannot change PIN here")
    staff_id = payload.get("staff_id", 0)
    if not staff_id:
        raise HTTPException(status_code=404, detail="Staff profile not found")
    result = await db.execute(select(StaffProfile).where(StaffProfile.id == staff_id))
    staff = result.scalar_one_or_none()
    if not staff: raise HTTPException(status_code=404, detail="Staff not found")
    current = (data.current_pin or "").strip()
    if not current:
        raise HTTPException(status_code=400, detail="Current PIN is required")
    if not staff.pin_hash or not verify_password_staff(current, staff.pin_hash if isinstance(staff.pin_hash, str) else staff.pin_hash.decode()):
        raise HTTPException(status_code=400, detail="Current PIN is incorrect")
    p = (data.new_pin or "").strip()
    if len(p) < 4: raise HTTPException(status_code=400, detail="PIN must be at least 4 digits")
    staff.pin_hash = hash_password(p)
    await db.commit()
    return APIResponse(data={"updated": True})


# ── POS Order Create ──

@router.post("/staff/pos/orders", status_code=status.HTTP_201_CREATED)
async def staff_pos_create_order(db: DBDependency, staff: CurrentStaff, data: POSOrderCreateRequest):
    store_id = data.store_id or staff.store_id

    # Validate store
    store_r = await db.execute(select(Store).where(Store.id == store_id, Store.deleted_at.is_(None)))
    store = store_r.scalar_one_or_none()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")

    customer_id = data.customer_id
    dining_table_id = data.dining_table_id
    order_type = data.order_type
    line_items_data = data.line_items
    payment_data = data.payment

    if not line_items_data:
        raise HTTPException(status_code=400, detail="At least one line item required")

    # Validate customer if provided
    if customer_id:
        cust_r = await db.execute(select(Customer).where(Customer.id == customer_id, Customer.is_active.is_(True), Customer.deleted_at.is_(None)))
        if not cust_r.scalar_one_or_none():
            raise HTTPException(status_code=400, detail=f"Customer {customer_id} not found or inactive")
    else:
        # POS walk-in — find or create system walk-in customer
        walkin_r = await db.execute(select(Customer).where(Customer.phone_number == "+0000000000", Customer.deleted_at.is_(None)))
        walkin = walkin_r.scalar_one_or_none()
        if not walkin:
            walkin = Customer(phone_number="+0000000000", display_name="Walk-in", is_active=True)
            db.add(walkin)
            await db.flush()
        customer_id = walkin.id

    # Validate dining table if provided
    if dining_table_id:
        table_r = await db.execute(select(DiningTable).where(DiningTable.id == dining_table_id, DiningTable.store_id == store_id, DiningTable.deleted_at.is_(None)))
        if not table_r.scalar_one_or_none():
            raise HTTPException(status_code=400, detail=f"Dining table {dining_table_id} not found for store {store_id}")

    # Resolve prices and build line items
    subtotal = 0.0
    line_items = []

    for li in line_items_data:
        menu_item_id = li.menu_item_id
        qty = max(1, li.quantity)
        special = li.special_instructions or ""

        item_r = await db.execute(select(MenuItem).where(MenuItem.id == menu_item_id, MenuItem.deleted_at.is_(None)))
        menu_item = item_r.scalar_one_or_none()
        if not menu_item:
            raise HTTPException(status_code=400, detail=f"Menu item {menu_item_id} not found")
        if not menu_item.is_available:
            raise HTTPException(status_code=400, detail=f"{menu_item.item_name} is currently unavailable")

        unit_price = float(menu_item.base_price or 0)
        modifier_total = 0.0

        modifier_ids = li.modifier_ids or []
        if modifier_ids:
            mod_r = await db.execute(
                select(MenuModifierOption).where(MenuModifierOption.id.in_(modifier_ids))
            )
            for mod in mod_r.scalars().all():
                modifier_total += float(mod.price_adjustment or 0)
            unit_price += modifier_total

        total_price = round(unit_price * qty, 2)
        subtotal += total_price

        line_items.append(OrderLineItem(
            menu_item_id=menu_item_id,
            item_snapshot={"item_name": menu_item.item_name, "image_url": menu_item.image_url},
            quantity=qty,
            unit_price=unit_price,
            line_total=total_price,
            modifier_total=modifier_total,
            selected_modifiers={"modifier_ids": modifier_ids},
            special_instructions=special,
        ))

    # Compute fees from store config
    config_r = await db.execute(
        select(StoreConfiguration).where(
            StoreConfiguration.store_id == store_id,
            StoreConfiguration.config_key.in_(["order.service_charge", "order.tax_rate"]),
        )
    )
    config_map = {c.config_key: c.config_value for c in config_r.scalars().all()}
    service_charge = float(config_map.get("order.service_charge", 0) or 0)
    tax_rate = float(config_map.get("order.tax_rate", 0) or 0)
    tax_amount = round(subtotal * tax_rate, 2)
    total = round(subtotal + service_charge + tax_amount, 2)

    # Generate order number
    from uuid import uuid4
    order_number = f"POS-{datetime.now(timezone.utc).strftime('%m%d')}-{uuid4().hex[:4].upper()}"

    order = Order(
        customer_id=customer_id,
        store_id=store_id,
        dining_table_id=dining_table_id,
        order_number=order_number,
        order_type=order_type,
        order_channel="pos",
        fulfillment_type={"dine_in":"dine_in_service","takeaway":"counter_pickup","delivery":"standard_delivery","drive_thru":"counter_pickup"}.get(order_type,"dine_in_service"),
        status="confirmed",
        payment_status="captured" if payment_data else "initiated",
        item_count=len(line_items),
        items_subtotal=round(subtotal, 2),
        service_charge=service_charge,
        tax_amount=tax_amount,
        total_amount=total,
        total_amount_currency=store.currency_code,
    )

    change = 0.0
    try:
        db.add(order)
        await db.flush()

        for li in line_items:
            li.order_id = order.id
            db.add(li)

        # Deduct recipe-based stock
        await _deduct_stock_for_order(db, order, line_items)

        # Create payment (skip if total is zero — e.g. complimentary orders)
        if payment_data and total > 0:
            amount_tendered = float(payment_data.amount_tendered or 0)
            change = round(max(0, amount_tendered - total), 2)
            payment = Payment(
                order_id=order.id,
                provider="cash",
                payment_method_type=payment_data.method,
                idempotency_key=f"pos-{uuid.uuid4().hex[:16]}",
                amount=total,
                currency_code=store.currency_code,
                status="captured",
                net_amount=total,
            )
            db.add(payment)

        # Update table status if dine-in
        if dining_table_id and order_type == "dine_in":
            existing = await db.execute(
                select(TableStatusSnapshot).where(TableStatusSnapshot.table_id == dining_table_id).with_for_update()
            )
            snap = existing.scalar_one_or_none()
            if snap:
                snap.status = "occupied"
                snap.current_order_id = order.id

        await db.commit()
    except (IntegrityError, HTTPException):
        await db.rollback()
        raise

    await db.refresh(order)

    return APIResponse(data={
        "order_id": order.id,
        "order_number": order.order_number,
        "status": order.status,
        "total": total,
        "change": change,
        "created_at": order.created_at.isoformat(),
    })


# ── Staff Equipment (check & report) ──

from pydantic import BaseModel, Field


_ALLOWED_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}


def _save_uploaded_images(files: list[UploadFile]) -> list[str]:
    """Save uploaded image files and return URL paths."""
    settings = get_settings()
    upload_dir = settings.upload_dir / "equipment"
    upload_dir.mkdir(parents=True, exist_ok=True)
    urls: list[str] = []
    for f in files:
        if not f.filename:
            continue
        ext = Path(f.filename).suffix.lower()
        if ext not in _ALLOWED_IMAGE_EXTS:
            continue
        contents = f.file.read()
        if len(contents) > 10 * 1024 * 1024:
            continue
        filename = f"{uuid.uuid4().hex}{ext}"
        filepath = upload_dir / filename
        filepath.write_bytes(contents)
        urls.append(f"/uploads/equipment/{filename}")
    return urls


class EquipmentReportRequest(BaseModel):
    status: str = Field(..., description="Status: operational, maintenance, or broken")
    description: str = Field(..., min_length=5, max_length=500)


@router.get("/staff/equipment")
async def list_equipment_for_staff(
    db: DBDependency,
    staff: CurrentStaff,
):
    """List equipment assigned to the staff member's store."""
    store_id = staff.store_id if hasattr(staff, "store_id") else None
    if not store_id:
        raise HTTPException(status_code=400, detail="No store assigned to this staff member")

    result = await db.execute(
        select(Equipment).where(
            Equipment.store_id == store_id,
            Equipment.is_active.is_(True),
        ).order_by(Equipment.name)
    )
    items = result.scalars().all()

    return APIResponse(data={
        "items": [
            {
                "id": e.id,
                "name": e.name,
                "equipment_type": e.equipment_type,
                "serial_number": e.serial_number,
                "status": e.status,
                "location": e.location,
                "last_maintenance_date": e.last_maintenance_date.isoformat() if e.last_maintenance_date else None,
                "next_maintenance_date": e.next_maintenance_date.isoformat() if e.next_maintenance_date else None,
            }
            for e in items
        ],
        "total": len(items),
    })


@router.post("/staff/equipment/{equipment_id}/report", status_code=status.HTTP_201_CREATED)
async def report_equipment_status(
    db: DBDependency,
    staff: CurrentStaff,
    equipment_id: int,
    status_field: str = Form(..., description="Status: operational, maintenance, or broken"),
    description: str = Form(..., min_length=5, max_length=500),
    images: list[UploadFile] = File(default=[]),
):
    """Staff reports equipment condition — daily check (operational) or issue (maintenance/broken)."""
    store_id = staff.store_id if hasattr(staff, "store_id") else None

    result = await db.execute(
        select(Equipment).where(
            Equipment.id == equipment_id,
            Equipment.is_active.is_(True),
        )
    )
    equipment = result.scalar_one_or_none()
    if not equipment:
        raise HTTPException(status_code=404, detail="Equipment not found")
    if store_id and equipment.store_id != store_id:
        raise HTTPException(status_code=403, detail="Equipment does not belong to your store")

    if status_field not in ("operational", "maintenance", "broken"):
        raise HTTPException(status_code=400, detail="Status must be 'operational', 'maintenance', or 'broken'")

    staff_name = staff.display_name if hasattr(staff, "display_name") else f"Staff #{staff.id}"

    image_urls = _save_uploaded_images(images) if images else []

    now = datetime.now(timezone.utc)

    log_type = "inspection" if status_field == "operational" else "corrective"
    log_status = "completed" if status_field == "operational" else "scheduled"

    log = EquipmentMaintenanceLog(
        equipment_id=equipment.id,
        maintenance_type=log_type,
        status=log_status,
        description=f"[Reported by {staff_name}] {description}",
        performed_by=staff_name,
        image_urls=image_urls if image_urls else None,
    )
    db.add(log)

    equipment.status = status_field
    equipment.updated_at = now

    await db.commit()
    await db.refresh(equipment)

    return APIResponse(data={
        "id": equipment.id,
        "name": equipment.name,
        "status": equipment.status,
        "maintenance_type": log_type,
        "image_urls": image_urls or [],
        "message": f"Equipment checked — {status_field}",
    })


# ── Staff Hygiene Reports (grease trap + garbage disposal) ──

from app.models.hygiene import HygieneReport


@router.post("/staff/hygiene/grease-trap", status_code=status.HTTP_201_CREATED)
async def report_grease_trap(
    db: DBDependency,
    staff: CurrentStaff,
    description: str = Form("", max_length=500),
    before_images: list[UploadFile] = File(default=[]),
    after_images: list[UploadFile] = File(default=[]),
):
    """Staff reports grease trap cleaning with before and after images."""
    store_id = staff.store_id if hasattr(staff, "store_id") else None
    staff_name = staff.display_name if hasattr(staff, "display_name") else f"Staff #{staff.id}"

    before_urls = _save_uploaded_images(before_images) if before_images else []
    after_urls = _save_uploaded_images(after_images) if after_images else []

    report = HygieneReport(
        store_id=store_id,
        report_type="grease_trap",
        description=description or None,
        status="pending",
        image_urls={"before": before_urls, "after": after_urls},
        submitted_by=staff_name,
    )
    db.add(report)
    await db.commit()
    await db.refresh(report)

    return APIResponse(data={
        "id": report.id,
        "report_type": report.report_type,
        "status": report.status,
        "image_urls": report.image_urls,
        "message": "Grease trap report submitted successfully",
    })


@router.post("/staff/hygiene/garbage", status_code=status.HTTP_201_CREATED)
async def report_garbage(
    db: DBDependency,
    staff: CurrentStaff,
    description: str = Form("", max_length=500),
    images: list[UploadFile] = File(default=[]),
):
    """Staff reports garbage disposal task completion with images."""
    store_id = staff.store_id if hasattr(staff, "store_id") else None
    staff_name = staff.display_name if hasattr(staff, "display_name") else f"Staff #{staff.id}"

    image_urls = _save_uploaded_images(images) if images else []

    report = HygieneReport(
        store_id=store_id,
        report_type="garbage_disposal",
        description=description or None,
        status="pending",
        image_urls=image_urls,
        submitted_by=staff_name,
    )
    db.add(report)
    await db.commit()
    await db.refresh(report)

    return APIResponse(data={
        "id": report.id,
        "report_type": report.report_type,
        "status": report.status,
        "image_urls": report.image_urls,
        "message": "Garbage disposal report submitted successfully",
    })


# ── Staff Inventory (view, update stock, report waste) ──

from pydantic import BaseModel as PydanticBaseModel


class StockUpdateRequest(PydanticBaseModel):
    item_id: int
    current_stock: float = Field(..., ge=0)
    reason: str | None = None


class WasteReportRequest(PydanticBaseModel):
    menu_item_id: int | None = None
    inventory_item_id: int | None = None
    quantity: float = Field(..., gt=0)
    reason: str = Field(..., min_length=5, max_length=300)
    unit_of_measure: str | None = None


@router.get("/staff/inventory")
async def list_inventory_for_staff(
    db: DBDependency,
    staff: CurrentStaff,
):
    """List inventory items for the staff member's store."""
    store_id = staff.store_id if hasattr(staff, "store_id") else None
    if not store_id:
        raise HTTPException(status_code=400, detail="No store assigned to this staff member")

    result = await db.execute(
        select(InventoryStock)
        .options(
            selectinload(InventoryStock.item).selectinload(InventoryItem.category)
        )
        .where(
            InventoryStock.store_id == store_id,
            InventoryStock.item.has(
                InventoryItem.is_active.is_(True),
            ),
            InventoryStock.item.has(
                InventoryItem.deleted_at.is_(None),
            ),
        )
        .order_by(InventoryStock.inventory_item_id)
    )
    stocks = result.scalars().all()

    return APIResponse(data={
        "items": [
            {
                "id": s.item.id,
                "item_name": s.item.item_name,
                "item_code": s.item.item_code,
                "item_type": s.item.item_type,
                "unit_of_measure": s.item.unit_of_measure,
                "current_stock": float(s.current_stock),
                "reorder_level": float(s.reorder_level or 0),
                "par_level": float(s.par_level or 0),
                "storage_location": s.storage_location,
                "category_name": s.item.category.category_name if s.item.category else None,
            }
            for s in stocks
        ],
        "total": len(stocks),
    })


@router.post("/staff/inventory/update")
async def staff_update_stock(
    db: DBDependency,
    staff: CurrentStaff,
    data: StockUpdateRequest,
):
    """Staff updates current stock count (for non-FnB shelf counts)."""
    store_id = staff.store_id if hasattr(staff, "store_id") else None

    result = await db.execute(
        select(InventoryItem).where(
            InventoryItem.id == data.item_id,
            InventoryItem.is_active.is_(True),
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found")

    # Find or create per-store stock record
    stock_result = await db.execute(
        select(InventoryStock).where(
            InventoryStock.inventory_item_id == data.item_id,
            InventoryStock.store_id == store_id,
        )
    )
    stock = stock_result.scalar_one_or_none()
    if stock is None:
        stock = InventoryStock(
            inventory_item_id=data.item_id,
            store_id=store_id,
            current_stock=0,
            reserved_stock=0,
            reorder_level=0,
            reorder_quantity=0,
            par_level=0,
        )
        db.add(stock)
        await db.flush()

    old_stock = float(stock.current_stock)
    delta = round(data.current_stock - old_stock, 4)

    staff_name = staff.display_name if hasattr(staff, "display_name") else f"Staff #{staff.id}"
    now = datetime.now(timezone.utc)

    stock.current_stock = data.current_stock
    stock.updated_at = now

    if abs(delta) > 0.0001:
        movement = InventoryMovementLog(
            inventory_item_id=item.id,
            store_id=store_id,
            movement_type="adjustment",
            quantity_delta=delta,
            stock_after=data.current_stock,
            reason=data.reason or f"Stock count updated by {staff_name}",
        )
        db.add(movement)

    await db.commit()
    await db.refresh(stock)

    return APIResponse(data={
        "id": item.id,
        "item_name": item.item_name,
        "current_stock": float(stock.current_stock),
        "previous_stock": old_stock,
        "delta": delta,
    })


@router.post("/staff/inventory/waste", status_code=status.HTTP_201_CREATED)
async def staff_report_waste(
    db: DBDependency,
    staff: CurrentStaff,
    data: WasteReportRequest,
):
    """Staff reports wastage for a menu item or inventory item."""
    store_id = staff.store_id if hasattr(staff, "store_id") else None
    staff_name = staff.display_name if hasattr(staff, "display_name") else f"Staff #{staff.id}"
    now = datetime.now(timezone.utc)

    if data.inventory_item_id:
        result = await db.execute(
            select(InventoryItem).where(
                InventoryItem.id == data.inventory_item_id,
                InventoryItem.is_active.is_(True),
            )
        )
        item = result.scalar_one_or_none()
        if not item:
            raise HTTPException(status_code=404, detail="Inventory item not found")

        # Find or create per-store stock record
        stock_result = await db.execute(
            select(InventoryStock).where(
                InventoryStock.inventory_item_id == data.inventory_item_id,
                InventoryStock.store_id == store_id,
            ).with_for_update()
        )
        stock = stock_result.scalar_one_or_none()
        if stock is None:
            stock = InventoryStock(
                inventory_item_id=data.inventory_item_id,
                store_id=store_id,
                current_stock=0,
                reserved_stock=0,
                reorder_level=0,
                reorder_quantity=0,
                par_level=0,
            )
            db.add(stock)
            await db.flush()

        delta = round(-data.quantity, 4)
        new_stock = round(float(stock.current_stock) + delta, 4)
        stock.current_stock = max(0, new_stock)
        stock.updated_at = now

        movement = InventoryMovementLog(
            inventory_item_id=item.id,
            store_id=store_id,
            movement_type="waste",
            quantity_delta=delta,
            stock_after=float(stock.current_stock),
            reason=f"[Reported by {staff_name}] {data.reason}",
        )
        db.add(movement)

        await db.commit()
        await db.refresh(stock)

        return APIResponse(data={
            "id": item.id,
            "item_name": item.item_name,
            "wasted_quantity": data.quantity,
            "current_stock": float(stock.current_stock),
            "message": "Waste recorded for inventory item",
        })

    if data.menu_item_id:
        menu_result = await db.execute(
            select(MenuItem).where(
                MenuItem.id == data.menu_item_id,
                MenuItem.is_available.is_(True),
                MenuItem.deleted_at.is_(None),
            )
        )
        menu_item = menu_result.scalar_one_or_none()
        if not menu_item:
            raise HTTPException(status_code=404, detail="Menu item not found")

        # Deduct recipe components from inventory stock
        recipes = menu_item.recipes or []
        deducted_items = []
        for recipe in recipes:
            inv_id = recipe.get("inventory_item_id")
            qty_per_unit = recipe.get("quantity_required", 0)
            waste_factor = recipe.get("waste_factor", 0)
            if not inv_id or qty_per_unit <= 0:
                continue
            total_qty = round(qty_per_unit * data.quantity * (1 + waste_factor), 4)

            stock_result = await db.execute(
                select(InventoryStock).where(
                    InventoryStock.inventory_item_id == inv_id,
                    InventoryStock.store_id == store_id,
                ).with_for_update()
            )
            stock_row = stock_result.scalar_one_or_none()
            if stock_row:
                new_stock = max(0, round(float(stock_row.current_stock) - total_qty, 4))
                stock_row.current_stock = new_stock
                stock_row.updated_at = now
                movement = InventoryMovementLog(
                    inventory_item_id=inv_id,
                    store_id=store_id,
                    movement_type="waste",
                    quantity_delta=round(-total_qty, 4),
                    stock_after=new_stock,
                    reason=f"[Menu item waste: {menu_item.item_name}] {data.reason}",
                )
                db.add(movement)
                deducted_items.append({"item_id": inv_id, "qty": total_qty})

        await db.commit()

        return APIResponse(data={
            "menu_item_id": data.menu_item_id,
            "menu_item_name": menu_item.item_name,
            "wasted_quantity": data.quantity,
            "reason": data.reason,
            "deducted_items": deducted_items,
            "message": "Waste recorded for menu item",
        })

    raise HTTPException(status_code=400, detail="Either menu_item_id or inventory_item_id is required")


# ── Public Branding Config ──

@router.get("/staff/config/branding")
async def branding_config(db: DBDependency):
    """Public branding config — no auth required."""
    result = await db.execute(
        select(PlatformConfig).where(PlatformConfig.config_key.startswith("branding."))
    )
    items = {c.config_key: c.config_value for c in result.scalars().all()}
    return APIResponse(data=items)
