"""Staff-facing operational endpoints (POS, dashboard, clock-in, PIN verify)."""

import json
import jwt
import os
import uuid
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, HTTPException, Query, Request, status
from sqlalchemy import func, select

from app.api.v1.deps import CurrentAdmin, CurrentStaff, DBDependency
from app.models.customer import Customer
from app.models.iam import AdminAccount, IAMRole, RoleAssignment, RolePermission, StoreAssignment, TokenBlacklist
from app.models.inventory import InventoryItem
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

router = APIRouter(tags=["staff — operations"])


# ── Helper ──


# ── Staff Auth (login, verify) ──

@router.get("/staff/auth/names")
async def staff_name_list(db: DBDependency, admin: CurrentAdmin, store_id: int | None = None):
    """List staff display names for the login dropdown, optionally filtered by store."""
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
    import bcrypt, jwt, os
    from datetime import timedelta

    from app.core.config import get_settings
    secret = get_settings().jwt_secret
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
        if not _pin_allowed(staff.pin_hash, password):
            raise HTTPException(status_code=401, detail="Default PIN not allowed for login. Use password or change PIN first.")
        ok = bcrypt.checkpw(password.encode(), staff.pin_hash.encode() if isinstance(staff.pin_hash, str) else staff.pin_hash)
        if not ok:
            raise HTTPException(status_code=401, detail="Invalid PIN")
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
        # Try password first, then PIN
        if staff.password_hash:
            try:
                pw_ok = bcrypt.checkpw(password.encode(), staff.password_hash.encode() if isinstance(staff.password_hash, str) else staff.password_hash)
            except Exception:
                pw_ok = False
            if pw_ok:
                return _make_token(staff)
        # Fallback: try PIN (but reject default 000000)
        if staff.pin_hash:
            if not _pin_allowed(staff.pin_hash, password):
                raise HTTPException(status_code=401, detail="Default PIN not allowed. Use password or change PIN first.")
            try:
                pin_ok = bcrypt.checkpw(password.encode(), staff.pin_hash.encode() if isinstance(staff.pin_hash, str) else staff.pin_hash)
            except Exception:
                pin_ok = False
            if pin_ok:
                return _make_token(staff)
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

    from app.core.security import verify_password
    if not verify_password(password, admin.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # Admin verified — if store_id provided, return staff token. Otherwise return admin token with store list.
    store_id = data.store_id
    if store_id:
        # Verify store exists
        store_check = await db.execute(select(Store).where(Store.id == int(store_id), Store.deleted_at.is_(None), Store.is_active.is_(True)))
        if not store_check.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Store not found")
        now = datetime.now(timezone.utc)
        payload = {"sub": str(admin.id), "type": "staff", "staff_id": 0, "store_id": int(store_id),
                   "admin_id": admin.id, "admin_name": admin.display_name,
                   "iat": now, "jti": uuid.uuid4().hex,
                   "iss": "fnb-enterprise-v3", "aud": "fnb-app",
                   "exp": now + timedelta(minutes=30)}
        access_token = jwt.encode(payload, secret, algorithm="HS256")
        refresh_payload = {"sub": str(admin.id), "type": "refresh", "staff_id": 0, "store_id": int(store_id),
                           "admin_id": admin.id, "iat": now, "jti": uuid.uuid4().hex,
                           "iss": "fnb-enterprise-v3", "aud": "fnb-app",
                           "exp": now + timedelta(days=7)}
        refresh_token = jwt.encode(refresh_payload, secret, algorithm="HS256")
        return {"tokens": {"access_token": access_token, "refresh_token": refresh_token}, "profile": {"email": admin.email, "display_name": admin.display_name, "store_id": int(store_id), "is_admin": True}}
    # No store_id — return admin token with store list for store selection
    store_list = await db.execute(select(Store).where(Store.deleted_at.is_(None), Store.is_active.is_(True)))
    stores = [{"id": s.id, "store_name": s.store_name} for s in store_list.scalars().all()]
    now = datetime.now(timezone.utc)
    payload = {"sub": str(admin.id), "type": "admin", "admin_id": admin.id, "iat": now, "jti": uuid.uuid4().hex, "iss": "fnb-enterprise-v3", "aud": "fnb-app", "exp": now + timedelta(minutes=30)}
    access_token = jwt.encode(payload, secret, algorithm="HS256")
    refresh_payload = {"sub": str(admin.id), "type": "refresh", "admin_id": admin.id, "iat": now, "jti": uuid.uuid4().hex, "iss": "fnb-enterprise-v3", "aud": "fnb-app", "exp": now + timedelta(days=7)}
    refresh_token = jwt.encode(refresh_payload, secret, algorithm="HS256")
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
    secret = get_settings().jwt_secret
    try:
        payload = jwt.decode(token, secret, algorithms=["HS256"], options={"verify_aud": False})
        if payload.get("type") != "admin":
            raise HTTPException(status_code=401, detail="Not an admin token")
    except jwt.InvalidTokenError:
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

    from datetime import timedelta
    now = datetime.now(timezone.utc)
    payload = {"sub": str(admin.id), "type": "staff", "staff_id": 0, "store_id": int(store_id),
               "admin_id": admin.id, "admin_name": admin.display_name,
               "iat": now, "jti": uuid.uuid4().hex,
               "iss": "fnb-enterprise-v3", "aud": "fnb-app",
               "exp": now + timedelta(minutes=30)}
    access_token = jwt.encode(payload, secret, algorithm="HS256")
    return {"tokens": {"access_token": access_token}, "profile": {
        "email": admin.email, "display_name": admin.display_name, "store_id": int(store_id),
        "staff_id": 0,
    }}


def _make_token(staff):
    from datetime import timedelta
    secret = get_settings().jwt_secret
    now = datetime.now(timezone.utc)
    payload = {"sub": str(staff.principal_id), "type": "staff", "staff_id": staff.id, "store_id": staff.store_id, "iat": now, "jti": uuid.uuid4().hex, "iss": "fnb-enterprise-v3", "aud": "fnb-app", "exp": now + timedelta(minutes=30)}
    access_token = jwt.encode(payload, secret, algorithm="HS256")
    refresh_jti = uuid.uuid4().hex
    refresh_payload = {"sub": str(staff.principal_id), "type": "refresh", "staff_id": staff.id, "store_id": staff.store_id, "iat": now, "jti": refresh_jti, "iss": "fnb-enterprise-v3", "aud": "fnb-app", "exp": now + timedelta(days=7)}
    refresh_token = jwt.encode(refresh_payload, secret, algorithm="HS256")
    return {"tokens": {"access_token": access_token, "refresh_token": refresh_token}, "profile": {"email": staff.email_address, "display_name": staff.display_name, "store_id": staff.store_id, "staff_id": staff.id}}


def _pin_allowed(pin_hash, attempted_pin):
    """Check if PIN is allowed for login (not the default 000000)."""
    if not pin_hash:
        return False
    try:
        import bcrypt
        return not bcrypt.checkpw(b"000000", pin_hash.encode() if isinstance(pin_hash, str) else pin_hash)
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
    secret = get_settings().jwt_secret
    try:
        payload = jwt.decode(token, secret, algorithms=["HS256"], options={"verify_aud": False})
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
    except jwt.InvalidTokenError:
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
        if jti:
            from sqlalchemy.dialects.postgresql import insert as pg_insert
            exp_ts = payload.get("exp")
            expires_at = datetime.fromtimestamp(exp_ts, tz=timezone.utc) if exp_ts else datetime.now(timezone.utc) + timedelta(days=7)
            stmt = pg_insert(TokenBlacklist).values(
                jti=jti,
                token_type="refresh",
                principal_id=staff.principal_id,
                expires_at=expires_at,
                reason="refresh_token_reuse",
            ).on_conflict_do_nothing(index_elements=["jti"])
            result = await db.execute(stmt)
            await db.commit()
            if result.rowcount == 0:
                raise HTTPException(status_code=401, detail="Refresh token has already been used")
        return _make_token(staff)

    # Admin refresh (staff_id == 0)
    admin_id = payload.get("admin_id")
    if admin_id:
        admin_result = await db.execute(select(AdminAccount).where(AdminAccount.id == int(admin_id), AdminAccount.is_active.is_(True)))
        admin = admin_result.scalar_one_or_none()
        if not admin:
            raise HTTPException(status_code=401, detail="Admin not found")
        from datetime import timedelta
        now = datetime.now(timezone.utc)
        new_payload = {"sub": str(admin.id), "type": "staff", "staff_id": 0, "store_id": int(store_id or 0),
                       "admin_id": admin.id, "admin_name": admin.display_name,
                       "iat": now, "jti": uuid.uuid4().hex,
                       "iss": "fnb-enterprise-v3", "aud": "fnb-app",
                       "exp": now + timedelta(minutes=30)}
        access_token = jwt.encode(new_payload, secret, algorithm="HS256")
        # Revoke this refresh token so it cannot be reused (atomic)
        if jti:
            from sqlalchemy.dialects.postgresql import insert as pg_insert
            exp_ts = payload.get("exp")
            expires_at = datetime.fromtimestamp(exp_ts, tz=timezone.utc) if exp_ts else datetime.now(timezone.utc) + timedelta(days=7)
            stmt = pg_insert(TokenBlacklist).values(
                jti=jti,
                token_type="refresh",
                principal_id=admin.principal_id,
                expires_at=expires_at,
                reason="refresh_token_reuse",
            ).on_conflict_do_nothing(index_elements=["jti"])
            result = await db.execute(stmt)
            await db.commit()
            if result.rowcount == 0:
                raise HTTPException(status_code=401, detail="Refresh token has already been used")
        return {"tokens": {"access_token": access_token}, "profile": {"email": admin.email, "display_name": admin.display_name, "store_id": int(store_id or 0), "staff_id": 0}}

    raise HTTPException(status_code=401, detail="Invalid token")


# ── Staff Profile (me) ──

@router.get("/staff/auth/me")
async def staff_profile_me(db: DBDependency, request: Request):
    """Get the current user's profile with IAM roles."""
    token = request.headers.get("Authorization", "").replace("Bearer ", "")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    secret = get_settings().jwt_secret
    try:
        payload = jwt.decode(token, secret, algorithms=["HS256"], options={"verify_aud": False})
    except jwt.InvalidTokenError:
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
            role_result = await db.execute(
                select(IAMRole.display_name).join(RoleAssignment, RoleAssignment.role_id == IAMRole.id)
                .where(RoleAssignment.assignee_id == sp.principal_id, RoleAssignment.is_active.is_(True))
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
async def staff_customer_search(db: DBDependency, admin: CurrentAdmin, q: str = Query(..., min_length=1)):
    await _get_staff_profile(db, admin)

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
        valid = bcrypt.checkpw(pin.encode(), staff.pin_hash.encode() if isinstance(staff.pin_hash, str) else staff.pin_hash)
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
    secret = get_settings().jwt_secret
    try:
        payload = jwt.decode(token, secret, algorithms=["HS256"], options={"verify_aud": False})
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    if payload.get("type") == "admin":
        raise HTTPException(status_code=403, detail="Admins must use the admin portal")
    staff_id = payload.get("staff_id", 0)
    if not staff_id:
        raise HTTPException(status_code=404, detail="Staff profile not found")
    result = await db.execute(select(StaffProfile).where(StaffProfile.id == staff_id))
    staff = result.scalar_one_or_none()
    if not staff:
        raise HTTPException(status_code=404, detail="Staff not found")
    pw = (data.new_password or "").strip()
    if len(pw) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    staff.password_hash = bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()
    await db.commit()
    return APIResponse(data={"updated": True})


@router.post("/staff/auth/change-pin")
@limiter.limit("5/minute")
async def staff_change_pin(request: Request, db: DBDependency, data: StaffChangePinRequest):
    """Change staff PIN."""
    token = request.headers.get("Authorization", "").replace("Bearer ", "")
    if not token: raise HTTPException(status_code=401, detail="Not authenticated")
    secret = get_settings().jwt_secret
    try:
        payload = jwt.decode(token, secret, algorithms=["HS256"], options={"verify_aud": False})
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    if payload.get("type") == "admin":
        raise HTTPException(status_code=403, detail="Admins cannot change PIN here")
    staff_id = payload.get("staff_id", 0)
    result = await db.execute(select(StaffProfile).where(StaffProfile.id == staff_id))
    staff = result.scalar_one_or_none()
    if not staff: raise HTTPException(status_code=404, detail="Staff not found")
    p = (data.new_pin or "").strip()
    if len(p) < 4: raise HTTPException(status_code=400, detail="PIN must be at least 4 digits")
    staff.pin_hash = bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()
    await db.commit()
    return APIResponse(data={"updated": True})


# ── POS Order Create ──

@router.post("/staff/pos/orders", status_code=status.HTTP_201_CREATED)
async def staff_pos_create_order(db: DBDependency, admin: CurrentAdmin, data: POSOrderCreateRequest):
    staff = await _get_staff_profile(db, admin)
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

        # Create payment
        if payment_data:
            amount_tendered = float(payment_data.amount_tendered or 0)
            change = round(max(0, amount_tendered - total), 2)
            payment = Payment(
                order_id=order.id,
                provider="cash",
                payment_method_type=payment_data.method,
                amount=total,
                currency_code=store.currency_code,
                status="captured",
                net_amount=total,
            )
            db.add(payment)

        # Update table status if dine-in
        if dining_table_id and order_type == "dine_in":
            existing = await db.execute(
                select(TableStatusSnapshot).where(TableStatusSnapshot.table_id == dining_table_id)
            )
            snap = existing.scalar_one_or_none()
            if snap:
                snap.status = "occupied"
                snap.current_order_id = order.id

        await db.commit()
    except Exception:
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


# ── Public Branding Config ──

@router.get("/staff/config/branding")
async def branding_config(db: DBDependency):
    """Public branding config — no auth required."""
    result = await db.execute(
        select(PlatformConfig).where(PlatformConfig.config_key.startswith("branding."))
    )
    items = {c.config_key: c.config_value for c in result.scalars().all()}
    return APIResponse(data=items)
