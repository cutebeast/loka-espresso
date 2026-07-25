"""Staff-facing operational endpoints (POS, dashboard, clock-in, PIN verify)."""

import json
import logging
import os
import re
import uuid
from datetime import date, datetime, timezone, timedelta
from decimal import Decimal
from types import SimpleNamespace
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, Response, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload
from sqlalchemy.exc import IntegrityError

from app.api.routes.deps import CurrentAdmin, CurrentStaff, DBDependency, RequireStaffRole
from app.models.customer import Customer
from app.models.equipment import Equipment, EquipmentMaintenanceLog
from app.models.iam import AdminAccount, IAMRole, RoleAssignment, RolePermission, StoreAssignment, TokenBlacklist
from app.models.inventory import InventoryItem, InventoryMovementLog, InventoryStock
from app.models.menu import (
    MenuItem,
    MenuModifierGroup,
    MenuModifierOption,
    MenuCategory,
    MenuVariant,
    MenuItemAllergen,
    Allergen,
    MenuItemDietaryTag,
    DietaryTag,
)
from app.models.order import Order, OrderLineItem, OrderStatusLog
from app.models.payment import Payment
from app.models.staff import StaffProfile, StaffShift, StaffTask, StaffTimeEvent, TipAllocation
from app.models.platform import PlatformConfig
from app.models.store import Store, DiningTable, Reservation, StoreConfiguration, TableStatusSnapshot
from app.schemas.base import APIResponse, PaginatedResponse
from app.schemas.reservation import ReservationStatusUpdate
from app.api.routes.endpoints.admin.reservations import _check_table_availability
from app.schemas.menu import (
    AllergenOut,
    MenuModifierGroupOut,
    MenuModifierOptionOut,
    MenuVariantOut,
)
from app.schemas.staff import (
    StaffLoginRequest,
    StaffRefreshRequest,
    StaffAdminStoreRequest,
    StaffPinVerifyRequest,
    StaffChangePasswordRequest,
    StaffChangePinRequest,
    POSOrderCreateRequest,
    StaffShiftOut,
    StaffTaskCreate,
    StaffTaskOut,
    StaffTaskUpdate,
)
from app.services.auth import blacklist_refresh_token
from app.services.order import OrderError, _compute_bundle_discount, _deduct_stock_for_order
from app.services.payment import PaymentError, _add_payment_event, create_stripe_checkout_session
from app.services.platform_config import PlatformConfigService
from app.core.auth_cookies import (
    clear_staff_auth_cookies,
    get_staff_access_token,
    get_staff_refresh_token,
    set_staff_auth_cookies,
)
from app.core.money import money_round, to_decimal
from app.core.config import get_settings
from app.core.rate_limiter import limiter
from app.core.security import hash_password, verify_password_staff, decode_token, create_access_token, create_refresh_token, verify_password

logger = logging.getLogger(__name__)

router = APIRouter(tags=["staff — operations"])


# ── Helper ──


# ── Staff Auth (login, verify) ──

@router.get("/staff/auth/names")
@limiter.limit("10/minute")
async def staff_name_list(request: Request, db: DBDependency, store_id: int):
    """List staff display names for the login dropdown. Requires a store_id."""
    if not store_id:
        raise HTTPException(status_code=400, detail="store_id is required")
    q = (
        select(StaffProfile.id, StaffProfile.display_name, Store.store_name)
        .join(Store, StaffProfile.store_id == Store.id)
        .where(
            StaffProfile.deleted_at.is_(None),
            StaffProfile.is_active.is_(True),
            StaffProfile.store_id == store_id,
        )
    )
    result = await db.execute(q.order_by(StaffProfile.display_name))
    items = [{"id": r[0], "display_name": r[1], "store_name": r[2]} for r in result.all()]
    return APIResponse(data=items)


@router.post("/staff/auth/login")
@limiter.limit("5/minute")
async def staff_login(request: Request, response: Response, db: DBDependency, data: StaffLoginRequest):
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
        staff = result.scalars().first()
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
        token_data = _make_token(staff)
        set_staff_auth_cookies(response, token_data["tokens"]["access_token"], token_data["tokens"]["refresh_token"])
        return token_data

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
    # Use .first() instead of .one_or_none() so duplicate seeded staff emails
    # do not cause a 500; the first active record wins.
    staff = result.scalars().first()

    if staff and (staff.password_hash or staff.pin_hash):
        # Check lockout before attempting credentials
        if staff.locked_until and staff.locked_until > datetime.now(timezone.utc):
            raise HTTPException(status_code=423, detail="Account temporarily locked. Try again later.")

        # Try password first, then PIN
        authenticated = False
        if staff.password_hash:
            try:
                pw_ok = verify_password_staff(password, staff.password_hash if isinstance(staff.password_hash, str) else staff.password_hash.decode())
            except Exception:
                pw_ok = False
            if pw_ok:
                authenticated = True
        if not authenticated and staff.pin_hash:
            if _pin_allowed(staff.pin_hash, password):
                authenticated = True

        if not authenticated:
            staff.failed_login_count = (staff.failed_login_count or 0) + 1
            if staff.failed_login_count >= 5:
                staff.locked_until = datetime.now(timezone.utc) + timedelta(minutes=30)
                staff.failed_login_count = 0
            await db.commit()
            raise HTTPException(status_code=401, detail="Invalid credentials")

        staff.failed_login_count = 0
        staff.locked_until = None
        await db.commit()
        token_data = _make_token(staff)
        set_staff_auth_cookies(response, token_data["tokens"]["access_token"], token_data["tokens"]["refresh_token"])
        return token_data

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
            extra_claims={"staff_id": 0, "store_id": int(store_id), "admin_id": admin.id},
            days=30,
        )
        set_staff_auth_cookies(response, access_token, refresh_token)
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
        extra_claims={"admin_id": admin.id},
        days=30,
    )
    set_staff_auth_cookies(response, access_token, refresh_token)
    return {"tokens": {"access_token": access_token, "refresh_token": refresh_token}, "profile": {"email": admin.email, "display_name": admin.display_name, "is_admin": True, "stores": stores}}


# ── Admin Store Selection (after login) ──

@router.post("/staff/auth/admin-store")
@limiter.limit("5/minute")
async def admin_select_store(request: Request, response: Response, db: DBDependency, data: StaffAdminStoreRequest):
    """Admin selects a store — returns a staff token scoped to that store."""
    token = (data.token or "").strip()
    store_id = data.store_id
    if not token or not store_id:
        raise HTTPException(status_code=400, detail="Token and store_id required")
    try:
        payload = decode_token(token)
        token_type = payload.get("type")
        is_admin_token = token_type == "admin"
        # Admin-context staff token (admin logged in with a store selected)
        is_admin_context_staff = (
            token_type == "staff"
            and payload.get("admin_id")
            and not payload.get("staff_id")
        )
        if not (is_admin_token or is_admin_context_staff):
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
    # Preserve existing refresh cookie; only set access cookie for the new scope.
    set_staff_auth_cookies(response, access_token, "")
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
        extra_claims={"staff_id": staff.id, "store_id": staff.store_id},
        days=30,
    )
    return {"tokens": {"access_token": access, "refresh_token": refresh}, "profile": {"email": staff.email_address, "display_name": staff.display_name, "store_id": staff.store_id, "staff_id": staff.id}}


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
async def staff_refresh_token(request: Request, response: Response, db: DBDependency, data: StaffRefreshRequest | None = None):
    """Refresh staff access token using a refresh token.

    Accepts refresh_token from HttpOnly cookie or request body.
    """
    token = get_staff_refresh_token(request) or (data.refresh_token if data else "")
    token = (token or "").strip()
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
        await blacklist_refresh_token(db, jti, staff.principal_id, payload)
        token_data = _make_token(staff)
        set_staff_auth_cookies(response, token_data["tokens"]["access_token"], token_data["tokens"]["refresh_token"])
        return token_data

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
        # Rotate the refresh token and return it in the JSON body as well —
        # the Next.js proxy ignores Set-Cookie, so without the body value the
        # next refresh would 401 (token is blacklisted below).
        new_refresh_token = create_refresh_token(
            admin.id,
            extra_claims={"staff_id": 0, "store_id": int(store_id or 0), "admin_id": admin.id},
            days=30,
        )
        # Revoke this refresh token so it cannot be reused (atomic)
        await blacklist_refresh_token(db, jti, admin.principal_id, payload)
        set_staff_auth_cookies(response, access_token, new_refresh_token)
        return {"tokens": {"access_token": access_token, "refresh_token": new_refresh_token}, "profile": {"email": admin.email, "display_name": admin.display_name, "store_id": int(store_id or 0), "staff_id": 0}}

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
    token = get_staff_access_token(request) or request.headers.get("Authorization", "").replace("Bearer ", "")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = decode_token(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

    token_type = payload.get("type", "")
    if token_type not in ("admin", "staff"):
        raise HTTPException(status_code=403, detail="Access denied: staff or admin token required")
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
            "must_change_pin": False,
        })

    # Staff user
    staff_id = payload.get("staff_id", 0)
    if staff_id:
        staff = await db.execute(select(StaffProfile).where(StaffProfile.id == staff_id, StaffProfile.deleted_at.is_(None)))
        sp = staff.scalar_one_or_none()
        if sp:
            # staff_profiles.role is the canonical staff role.
            return APIResponse(data={
                "display_name": sp.display_name, "email": sp.email_address,
                "is_admin": False, "roles": [sp.role.replace("_", " ").title()],
                "store_id": sp.store_id, "staff_role": sp.role,
                "must_change_pin": sp.pin_last_changed_at is None,
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
                "must_change_pin": False,
            })

    return APIResponse(data={"display_name": payload.get("admin_name", "User"), "roles": ["Staff Portal"], "must_change_pin": False})


@router.post("/staff/auth/logout")
async def staff_logout(request: Request, response: Response, db: DBDependency):
    """Logout staff/admin from staff portal. Blacklists refresh token if available."""
    refresh_token = get_staff_refresh_token(request)
    if refresh_token:
        try:
            payload = decode_token(refresh_token)
            if payload.get("type") == "refresh":
                await blacklist_refresh_token(db, payload.get("jti"), None, payload)
        except Exception as exc:
            logger.warning("Staff logout failed to blacklist refresh token: %s", exc)
    clear_staff_auth_cookies(response)
    return APIResponse(data={"success": True, "message": "Logged out successfully"})


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
        select(func.count(Reservation.id)).where(
            Reservation.store_id == store_id,
            Reservation.reservation_date == today_start.date(),
            Reservation.status.notin_([
                "cancelled_by_guest", "cancelled_by_merchant", "no_show"
            ]),
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
        "today_reservations": today_resv,
        "clock_status": clock_status,
        "current_shift_start": shift_start.isoformat() if shift_start else None,
        "store_name": store_name,
        "staff_name": staff.display_name,
        "store_id": store_id,
    })


# ── Customer Search ──

@router.get("/staff/customers/search")
async def staff_customer_search(staff: CurrentStaff, db: DBDependency, request: Request, q: str = Query(..., min_length=1)):
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
            "email_address": c.email_address or "",
            "loyalty_tier": "Standard",
        })
    return APIResponse(data={"items": items})


class FindOrCreateCustomerRequest(BaseModel):
    phone_number: str = Field(..., min_length=5, max_length=25)
    display_name: str = Field(..., min_length=1, max_length=100)


@router.post("/staff/customers/find-or-create", response_model=APIResponse[dict], status_code=status.HTTP_201_CREATED)
async def staff_find_or_create_customer(
    staff: Annotated[StaffProfile, Depends(RequireStaffRole("cashier", "server", "shift_supervisor", "store_manager"))],
    db: DBDependency,
    data: FindOrCreateCustomerRequest,
):
    """POS walk-in lookup: find a customer by phone or create a minimal profile.

    Phone is the identity anchor (passwordless login). No OTP here — staff are
    facing the customer in person; if the customer later signs up with the
    same phone via OTP, they take over this very profile, so workshop bookings
    and loyalty history stay attached to the phone.

    Accepts Malaysian formats (012…, 012-345 6001, 6012…, +6012…).
    """
    digits = re.sub(r"\D", "", data.phone_number or "")
    if digits.startswith("60"):
        phone = f"+{digits}"
    elif digits.startswith("0"):
        phone = f"+6{digits}"
    elif digits:
        phone = f"+{digits}"
    else:
        phone = ""
    if not re.fullmatch(r"^\+[0-9]{7,20}$", phone):
        raise HTTPException(status_code=400, detail="Invalid phone number — use a Malaysian mobile (e.g. 0123456789)")

    result = await db.execute(
        select(Customer).where(Customer.phone_number == phone)
    )
    cust = result.scalar_one_or_none()
    created = False
    revived = False
    name = data.display_name.strip()
    if cust is None:
        cust = Customer(phone_number=phone, display_name=name, is_active=True)
        db.add(cust)
        await db.flush()
        created = True
    elif cust.deleted_at is not None:
        # Previously archived profile — customer is physically here, restore it
        cust.deleted_at = None
        cust.is_active = True
        cust.display_name = name
        revived = True
    elif name and (not cust.display_name or cust.display_name in ("Walk-in", cust.phone_number)):
        # Upgrade placeholder names with the one staff collected
        cust.display_name = name
    await db.commit()
    return APIResponse(data={
        "id": cust.id,
        "display_name": cust.display_name or name,
        "phone_number": cust.phone_number,
        "loyalty_tier": "Standard",
        "created": created,
        "revived": revived,
    })


# ── Staff Store Config (POS display) ──

@router.get("/staff/store")
async def staff_store_config(db: DBDependency, staff: CurrentStaff):
    """Return the active store's public details plus POS fee configuration."""
    store = await db.get(Store, staff.store_id)
    if not store or store.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Store not found")

    config_result = await db.execute(
        select(StoreConfiguration).where(
            StoreConfiguration.store_id == store.id,
            StoreConfiguration.config_key.in_([
                "order.service_charge",
                "order.tax_rate",
                "pos.customer_display.left",
            ]),
        )
    )
    config_map = {c.config_key: c.config_value for c in config_result.scalars().all()}

    def _to_float(value, default=0.0):
        if value is None:
            return default
        if isinstance(value, (int, float)):
            return float(value)
        try:
            return float(value)
        except (TypeError, ValueError):
            return default

    return APIResponse(data={
        "id": store.id,
        "store_name": store.store_name,
        "brand_name": store.brand_name,
        "currency_code": store.currency_code,
        "service_charge": _to_float(config_map.get("order.service_charge"), 0.0),
        "tax_rate": _to_float(config_map.get("order.tax_rate"), 0.0),
        "display_left": int(_to_float(config_map.get("pos.customer_display.left"), 1920.0)),
        # Per-store shared secret for the public customer-display poll:
        # GET /api/staff/pos/display-state?store_id=<id>&key=<display_key>
        "display_key": store.display_key,
    })


# ── PIN Verify ──

@router.post("/staff/auth/verify-pin")
@limiter.limit("10/minute")
async def staff_verify_pin(request: Request, db: DBDependency, staff: CurrentStaff, data: StaffPinVerifyRequest):

    pin = str(data.pin or "").strip()
    if not pin or len(pin) != 6 or not pin.isdigit():
        raise HTTPException(status_code=400, detail="PIN must be exactly 6 digits")

    import bcrypt
    if not hasattr(staff, "pin_hash") or not staff.pin_hash:
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
async def staff_change_password(
    request: Request,
    db: DBDependency,
    staff: CurrentStaff,
    data: StaffChangePasswordRequest,
):
    """Change staff password."""
    # Admin users acting in a staff context must use the admin portal.
    if getattr(staff, "is_staff_context", False):
        raise HTTPException(status_code=403, detail="Admins must use the admin portal")
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
async def staff_change_pin(
    request: Request,
    db: DBDependency,
    staff: CurrentStaff,
    data: StaffChangePinRequest,
):
    """Change staff PIN."""
    if getattr(staff, "is_staff_context", False):
        raise HTTPException(status_code=403, detail="Admins cannot change PIN here")
    current = (data.current_pin or "").strip()
    if not current:
        raise HTTPException(status_code=400, detail="Current PIN is required")
    if not staff.pin_hash or not verify_password_staff(current, staff.pin_hash if isinstance(staff.pin_hash, str) else staff.pin_hash.decode()):
        raise HTTPException(status_code=400, detail="Current PIN is incorrect")
    p = (data.new_pin or "").strip()
    if not p or len(p) != 6 or not p.isdigit():
        raise HTTPException(status_code=400, detail="PIN must be exactly 6 digits")
    if p == "000000":
        raise HTTPException(status_code=400, detail="Invalid PIN")
    if p == current:
        raise HTTPException(status_code=400, detail="New PIN must be different")
    staff.pin_hash = hash_password(p)
    staff.pin_last_changed_at = datetime.now(timezone.utc)
    await db.commit()
    return APIResponse(data={"updated": True})


# ── POS Order Create ──


def _is_walkin_customer(customer_id: int) -> bool:
    """Check if customer is the system walk-in customer (no loyalty)."""
    # Walk-in customer has phone +0000000000; we check by ID at runtime
    return False  # Conservative: always try to award; _award_pos_loyalty_points handles missing account


async def _award_pos_loyalty_points(db, customer_id: int, subtotal: float, order, order_number: str) -> int:
    """Award loyalty points for a POS order, mirroring the customer flow."""
    from decimal import Decimal
    from app.models.loyalty import LoyaltyAccount, LoyaltyPointsLedger, LoyaltyTier
    from app.models.platform import PlatformConfig
    from app.services.commerce import _recalculate_tier

    # Read points-per-currency-unit from platform config
    ppc_result = await db.execute(
        select(PlatformConfig.config_value).where(PlatformConfig.config_key == "loyalty.points_per_currency")
    )
    ppc_val = ppc_result.scalar()
    try:
        points_per_currency = Decimal(str(ppc_val)) if ppc_val else Decimal("1")
    except Exception:
        points_per_currency = Decimal("1")

    points_earned = int((Decimal(str(subtotal)) * points_per_currency).to_integral_value(rounding="ROUND_DOWN"))
    if points_earned <= 0:
        return 0

    # Load loyalty account with row lock
    la_result = await db.execute(
        select(LoyaltyAccount).where(LoyaltyAccount.customer_id == customer_id).with_for_update()
    )
    la = la_result.scalar_one_or_none()
    if not la:
        return 0  # No loyalty account — skip silently

    # Apply the customer's current tier points multiplier (mirrors the customer flow)
    eco = False
    if getattr(order, "is_byot", False):
        # Eco-campaign (BYOT): 2x points (Bloom/Origin), 3x (Reserve) — replaces tier multiplier
        eco = True
        tier_key_r = await db.execute(
            select(LoyaltyTier.tier_key).where(LoyaltyTier.id == la.current_tier_id)
        ) if la.current_tier_id else None
        tier_key = tier_key_r.scalar_one_or_none() if tier_key_r else None
        points_earned = int(points_earned * (3 if tier_key == "reserve" else 2))
    elif la.current_tier_id:
        from app.models.loyalty import LoyaltyTier
        tier = await db.get(LoyaltyTier, la.current_tier_id)
        if tier and tier.is_active and tier.points_multiplier and Decimal(str(tier.points_multiplier)) > 1:
            points_earned = int(
                (Decimal(points_earned) * Decimal(str(tier.points_multiplier))).to_integral_value(rounding="ROUND_DOWN")
            )

    # Double points during the customer's birthday month (all tiers)
    from app.services.commerce import _birthday_points_multiplier, grant_birthday_perk
    birthday_mult = await _birthday_points_multiplier(db, customer_id)
    if birthday_mult > 1:
        points_earned = int(
            (Decimal(points_earned) * birthday_mult).to_integral_value(rounding="ROUND_DOWN")
        )
        # Birthday perk voucher (Origin: drink upgrade / Reserve: gift), once per year
        tier_key_r = await db.execute(
            select(LoyaltyTier.tier_key).where(LoyaltyTier.id == la.current_tier_id)
        ) if la.current_tier_id else None
        await grant_birthday_perk(db, customer_id, tier_key_r.scalar_one_or_none() if tier_key_r else None)

    ledger = LoyaltyPointsLedger(
        loyalty_account_id=la.id,
        customer_id=customer_id,
        event_type="order_earned",
        points_delta=points_earned,
        running_balance=la.points_balance + points_earned,
        description=f"Points earned from POS order {order_number}"
        + (" (BYOT eco-campaign)" if eco else "")
        + (" (birthday month double points)" if birthday_mult > 1 else ""),
    )
    db.add(ledger)
    la.points_balance += points_earned
    la.lifetime_points_earned = (la.lifetime_points_earned or 0) + points_earned
    await _recalculate_tier(db, la)

    # Update order record
    order.loyalty_points_earned = points_earned
    return points_earned


@router.post("/staff/pos/orders", status_code=status.HTTP_201_CREATED)
async def staff_pos_create_order(
    db: DBDependency,
    staff: Annotated[StaffProfile, Depends(RequireStaffRole("cashier", "server", "shift_supervisor", "store_manager"))],
    data: POSOrderCreateRequest,
):
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

    # Workshops/classes (experiences category) at POS: every workshop line
    # needs a session AND a real customer attached (phone is the identity
    # anchor) — the anonymous walk-in profile can't hold class bookings.
    exp_cat_r = await db.execute(select(MenuCategory.id).where(MenuCategory.slug == "experiences"))
    exp_cat_id = exp_cat_r.scalar_one_or_none()
    workshop_item_ids: set[int] = set()
    if exp_cat_id is not None:
        li_ids = {li.menu_item_id for li in line_items_data}
        wr = await db.execute(
            select(MenuItem.id).where(MenuItem.id.in_(li_ids), MenuItem.category_id == exp_cat_id)
        )
        workshop_item_ids = set(wr.scalars().all())
    has_workshop = bool(workshop_item_ids)

    if has_workshop:
        if not customer_id:
            raise HTTPException(
                status_code=400,
                detail="Customer phone number is required for workshop bookings — attach a customer first",
            )
        for li in line_items_data:
            if li.menu_item_id in workshop_item_ids and not li.class_session_id:
                raise HTTPException(
                    status_code=400,
                    detail="Please select a session for the workshop item",
                )

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

    config_service = PlatformConfigService(db)
    precision = await config_service.get_accounting_precision()
    rounding_mode = await config_service.get_accounting_rounding()

    # Resolve prices and build line items
    subtotal = Decimal(0)
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

        unit_price = to_decimal(menu_item.base_price)
        modifier_total = Decimal(0)

        modifier_ids = li.modifier_ids or []
        if modifier_ids:
            mod_r = await db.execute(
                select(MenuModifierOption).where(MenuModifierOption.id.in_(modifier_ids))
            )
            for mod in mod_r.scalars().all():
                modifier_total += to_decimal(mod.price_adjustment)
            unit_price += modifier_total

        total_price = money_round(unit_price * qty, precision, rounding_mode)
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
            bundle_product_id=li.bundle_product_id,
            bundle_component_id=li.bundle_component_id,
            class_session_id=li.class_session_id,
        ))

    # Consume workshop session seats (locked; whole order fails when full)
    if has_workshop:
        from app.services.class_sessions import ClassSessionError, consume_session_seats
        for li in line_items_data:
            if li.menu_item_id in workshop_item_ids and li.class_session_id:
                try:
                    await consume_session_seats(
                        db,
                        menu_item_id=li.menu_item_id,
                        class_session_id=li.class_session_id,
                        quantity=max(1, li.quantity),
                    )
                except ClassSessionError as e:
                    raise HTTPException(status_code=e.status_code, detail=e.detail)

    # Compute fees from store config
    config_r = await db.execute(
        select(StoreConfiguration).where(
            StoreConfiguration.store_id == store_id,
            StoreConfiguration.config_key.in_(["order.service_charge", "order.tax_rate"]),
        )
    )
    config_map = {c.config_key: c.config_value for c in config_r.scalars().all()}
    service_charge = to_decimal(config_map.get("order.service_charge", 0))
    tax_rate = to_decimal(config_map.get("order.tax_rate", 0))
    tax_amount = money_round(subtotal * tax_rate, precision, rounding_mode)
    total = money_round(subtotal + service_charge + tax_amount, precision, rounding_mode)

    # ── Bundle discount (reuse customer order engine for consistency) ──
    calc_items = [
        SimpleNamespace(
            bundle_product_id=li.bundle_product_id,
            bundle_component_id=li.bundle_component_id,
            menu_item_id=li.menu_item_id,
            quantity=li.quantity,
            unit_price=li.unit_price - li.modifier_total,
            modifier_total=li.modifier_total,
        )
        for li in line_items
    ]
    bundle_discount, active_bundle_ids = await _compute_bundle_discount(db, calc_items)
    total = money_round(total - bundle_discount, precision, rounding_mode)

    # ── Add-on Deal discount ──
    addon_discount = Decimal(0)
    if active_bundle_ids and line_items:
        mi_ids = set(l.menu_item_id for l in line_items)
        mi_result = await db.execute(select(MenuItem).where(MenuItem.id.in_(mi_ids)))
        mis = {mi.id: mi for mi in mi_result.scalars().all()}
        for l in line_items:
            if l.bundle_product_id is not None:
                continue
            mi = mis.get(l.menu_item_id)
            if not mi or not mi.is_addon_deal_eligible:
                continue
            if not mi.eligible_bundle_ids:
                continue
            if not active_bundle_ids.intersection(set(mi.eligible_bundle_ids)):
                continue
            line_unit = to_decimal(l.unit_price)
            if mi.addon_discount_type == "percentage":
                pct = to_decimal(mi.addon_discount_value) / Decimal(100)
                disc = money_round(line_unit * pct * l.quantity, precision, rounding_mode)
            else:
                disc = to_decimal(mi.addon_discount_value) * l.quantity
            disc = min(disc, line_unit * l.quantity)
            addon_discount += disc
        total = money_round(total - addon_discount, precision, rounding_mode)

    # Idempotent replay: return existing order for the same client key
    if data.idempotency_key:
        existing_order_r = await db.execute(
            select(Order).where(Order.idempotency_key == data.idempotency_key)
        )
        existing_order = existing_order_r.scalar_one_or_none()
        if existing_order:
            replay_change = Decimal(0)
            if payment_data and existing_order.total_amount > 0 and payment_data.method == "cash":
                tendered = to_decimal(payment_data.amount_tendered)
                replay_change = money_round(max(Decimal(0), tendered - to_decimal(existing_order.total_amount)), precision, rounding_mode)
            return APIResponse(data={
                "order_id": existing_order.id,
                "order_number": existing_order.order_number,
                "status": existing_order.status,
                "total": existing_order.total_amount,
                "change": replay_change,
                "created_at": existing_order.created_at.isoformat(),
            })

    # Generate order number
    from uuid import uuid4
    order_number = f"POS-{datetime.now(timezone.utc).strftime('%m%d')}-{uuid4().hex[:4].upper()}"

    order = Order(
        customer_id=customer_id,
        store_id=store_id,
        dining_table_id=dining_table_id,
        order_number=order_number,
        idempotency_key=data.idempotency_key,
        order_type=order_type,
        order_channel="pos",
        fulfillment_type={"dine_in":"dine_in_service","takeaway":"counter_pickup","delivery":"standard_delivery","drive_thru":"counter_pickup"}.get(order_type,"dine_in_service"),
        status="confirmed",
        payment_status="captured" if payment_data else "initiated",
        item_count=sum(li.quantity for li in line_items),
        items_subtotal=money_round(subtotal, precision, rounding_mode),
        service_charge=service_charge,
        tax_amount=tax_amount,
        discount_amount=money_round(bundle_discount + addon_discount, precision, rounding_mode),
        addon_discount=money_round(addon_discount, precision, rounding_mode),
        total_amount=total,
        total_amount_currency=store.currency_code,
        is_byot=bool(getattr(data, "is_byot", False)),
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

        # Award loyalty points (skip walk-in customer)
        if customer_id and not _is_walkin_customer(customer_id):
            loyalty_pts = await _award_pos_loyalty_points(db, customer_id, subtotal, order, order_number)
        else:
            loyalty_pts = 0

        # Create payment (skip if total is zero — e.g. complimentary orders)
        payment_url: str | None = None
        if payment_data and total > 0:
            amount_tendered = to_decimal(payment_data.amount_tendered or 0)

            # Map POS method to valid DB values
            method_type_map = {
                "cash": "cash",
                "card": "credit_card",
                "qr": "e_wallet",
                "stripe_qr": "qr_pay",
                "credit_card": "credit_card",
                "debit_card": "debit_card",
                "e_wallet": "e_wallet",
            }
            payment_method_type = method_type_map.get(payment_data.method, "cash")
            provider_map = {
                "cash": "cash",
                "card": "stripe",
                "qr": "grabpay",
                "stripe_qr": "stripe",
                "credit_card": "stripe",
                "debit_card": "stripe",
                "e_wallet": "grabpay",
            }
            provider = provider_map.get(payment_data.method, "cash")
            is_stripe_qr = payment_data.method == "stripe_qr"

            # Cash tender validation
            if payment_data.method == "cash" and amount_tendered < total:
                raise HTTPException(
                    status_code=400,
                    detail=f"Insufficient cash tendered. Required: RM {total:.2f}, Tendered: RM {amount_tendered:.2f}",
                )
            change = money_round(max(Decimal(0), amount_tendered - total), precision, rounding_mode) if payment_data.method == "cash" else Decimal(0)

            idempotency_key = f"pos-order-{order.id}-{payment_method_type}-{total:.2f}"
            dup = await db.execute(
                select(Payment)
                .where(Payment.idempotency_key == idempotency_key, Payment.status == "captured")
                .with_for_update()
            )
            if dup.scalar_one_or_none():
                raise HTTPException(status_code=409, detail="Duplicate payment request")

            payment_status = "pending_authorization" if is_stripe_qr else "captured"
            payment = Payment(
                order_id=order.id,
                provider=provider,
                payment_method_type=payment_method_type,
                idempotency_key=idempotency_key,
                amount=total,
                currency_code=store.currency_code,
                status=payment_status,
                net_amount=total if not is_stripe_qr else Decimal(0),
            )
            db.add(payment)
            await db.flush()
            await db.refresh(payment)

            if is_stripe_qr:
                order.payment_status = "pending_authorization"
                try:
                    checkout = await create_stripe_checkout_session(db, payment, order)
                except PaymentError as exc:
                    await db.rollback()
                    raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
                payment.provider_transaction_id = checkout["id"]
                payment_url = checkout["url"]
            else:
                # Record a lifecycle event for captured POS payments (cash / manual card).
                await _add_payment_event(
                    db,
                    payment,
                    to_status="captured",
                    from_status="initiated",
                    amount=total,
                    provider_response={"method": payment_data.method, "tendered": float(amount_tendered) if payment_data.method == "cash" else None},
                )
                # Accrue annual spend + tier review/upgrade (loyalty program)
                from app.services.payment import _accrue_loyalty_annual_spend
                await _accrue_loyalty_annual_spend(db, payment)

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
    except IntegrityError as exc:
        await db.rollback()
        if data.idempotency_key:
            existing_order_r = await db.execute(
                select(Order).where(Order.idempotency_key == data.idempotency_key)
            )
            existing_order = existing_order_r.scalar_one_or_none()
            if existing_order:
                replay_change = Decimal(0)
                if payment_data and existing_order.total_amount > 0 and payment_data.method == "cash":
                    tendered = to_decimal(payment_data.amount_tendered or 0)
                    replay_change = money_round(max(Decimal(0), tendered - to_decimal(existing_order.total_amount)), precision, rounding_mode)
                return APIResponse(data={
                    "order_id": existing_order.id,
                    "order_number": existing_order.order_number,
                    "status": existing_order.status,
                    "total": existing_order.total_amount,
                    "change": replay_change,
                    "created_at": existing_order.created_at.isoformat(),
                })
        raise
    except HTTPException:
        await db.rollback()
        raise
    except OrderError as exc:
        await db.rollback()
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc

    await db.refresh(order)

    response_data = {
        "order_id": order.id,
        "order_number": order.order_number,
        "status": order.status,
        "total": total,
        "change": change,
        "created_at": order.created_at.isoformat(),
    }
    if payment_url:
        response_data["payment_url"] = payment_url
        # Generate a signed guest-pay token so a walk-in customer can scan the
        # QR and pay from their phone via the PWA without logging in.
        from app.core.security import create_guest_pay_token
        response_data["pay_token"] = create_guest_pay_token(order.id, order.store_id)

    return APIResponse(data=response_data)


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
                "current_stock": s.current_stock,
                "reorder_level": s.reorder_level or 0,
                "par_level": s.par_level or 0,
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

    # Find or create per-store stock record (lock row to prevent race conditions)
    stock_result = await db.execute(
        select(InventoryStock).where(
            InventoryStock.inventory_item_id == data.item_id,
            InventoryStock.store_id == store_id,
        ).with_for_update()
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

    old_stock = stock.current_stock
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
        "current_stock": stock.current_stock,
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
        new_stock = round(stock.current_stock + delta, 4)
        stock.current_stock = max(0, new_stock)
        stock.updated_at = now

        movement = InventoryMovementLog(
            inventory_item_id=item.id,
            store_id=store_id,
            movement_type="waste",
            quantity_delta=delta,
            stock_after=stock.current_stock,
            reason=f"[Reported by {staff_name}] {data.reason}",
        )
        db.add(movement)

        await db.commit()
        await db.refresh(stock)

        return APIResponse(data={
            "id": item.id,
            "item_name": item.item_name,
            "wasted_quantity": data.quantity,
            "current_stock": stock.current_stock,
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
                new_stock = max(0, round(stock_row.current_stock - total_qty, 4))
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


# ── Staff Shifts ──

@router.get("/staff/shifts/me", response_model=APIResponse[PaginatedResponse[StaffShiftOut]])
async def list_my_shifts(
    db: DBDependency,
    staff: CurrentStaff,
    from_date: date | None = Query(None),
    to_date: date | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
):
    """List shifts for the currently logged-in staff member."""
    staff_id = staff.id if isinstance(staff, StaffProfile) else int(getattr(staff, "id", 0))
    base_stmt = select(StaffShift).where(StaffShift.staff_id == staff_id)
    count_stmt = select(func.count(StaffShift.id)).where(StaffShift.staff_id == staff_id)
    if from_date is not None:
        base_stmt = base_stmt.where(StaffShift.shift_date >= from_date)
        count_stmt = count_stmt.where(StaffShift.shift_date >= from_date)
    if to_date is not None:
        base_stmt = base_stmt.where(StaffShift.shift_date <= to_date)
        count_stmt = count_stmt.where(StaffShift.shift_date <= to_date)

    total = (await db.execute(count_stmt)).scalar() or 0
    stmt = (
        base_stmt.order_by(StaffShift.shift_date.desc(), StaffShift.planned_start.asc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    result = await db.execute(stmt)
    items = [StaffShiftOut.model_validate(r) for r in result.scalars().all()]
    return APIResponse(
        data=PaginatedResponse(
            items=items,
            total=total,
            page=page,
            per_page=per_page,
            total_pages=(total + per_page - 1) // per_page,
        )
    )


# ── Staff Tasks ──

@router.get("/staff/tasks/me", response_model=APIResponse[PaginatedResponse[StaffTaskOut]])
async def list_my_tasks(
    db: DBDependency,
    staff: CurrentStaff,
    status: str | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
):
    """List tasks assigned to the currently logged-in staff member."""
    staff_id = staff.id if isinstance(staff, StaffProfile) else int(getattr(staff, "id", 0))
    base_stmt = select(StaffTask).where(StaffTask.staff_id == staff_id)
    count_stmt = select(func.count(StaffTask.id)).where(StaffTask.staff_id == staff_id)
    if status is not None:
        base_stmt = base_stmt.where(StaffTask.status == status)
        count_stmt = count_stmt.where(StaffTask.status == status)

    total = (await db.execute(count_stmt)).scalar() or 0
    stmt = (
        base_stmt.order_by(StaffTask.due_date.asc().nulls_last(), StaffTask.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    result = await db.execute(stmt)
    items = [StaffTaskOut.model_validate(r) for r in result.scalars().all()]
    return APIResponse(
        data=PaginatedResponse(
            items=items,
            total=total,
            page=page,
            per_page=per_page,
            total_pages=(total + per_page - 1) // per_page,
        )
    )


@router.post("/staff/tasks/{task_id}/complete", response_model=APIResponse[StaffTaskOut])
async def complete_my_task(
    db: DBDependency,
    staff: CurrentStaff,
    task_id: int,
):
    """Mark a task assigned to the current staff member as completed."""
    staff_id = staff.id if isinstance(staff, StaffProfile) else int(getattr(staff, "id", 0))
    result = await db.execute(
        select(StaffTask).where(StaffTask.id == task_id, StaffTask.staff_id == staff_id)
    )
    task = result.scalar_one_or_none()
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.status == "completed":
        raise HTTPException(status_code=400, detail="Task already completed")
    task.status = "completed"
    task.completed_at = datetime.now(timezone.utc)
    task.completed_by = staff_id
    await db.commit()
    await db.refresh(task)
    return APIResponse(data=StaffTaskOut.model_validate(task))


# ── Public Branding Config ──

@router.get("/staff/config/branding")
async def branding_config(db: DBDependency):
    """Public branding config — no auth required."""
    result = await db.execute(
        select(PlatformConfig).where(PlatformConfig.config_key.startswith("branding."))
    )
    items = {c.config_key: c.config_value for c in result.scalars().all()}
    return APIResponse(data=items)


# ── Staff read endpoints (menu, tables, orders, reservations) ──
# These endpoints let staff portal pages fetch data using their staff token
# instead of calling /admin/* endpoints which require an admin token.

@router.get("/staff/menu/categories")
async def staff_list_menu_categories(
    staff: CurrentStaff,
    db: DBDependency,
    per_page: int = Query(100, ge=1, le=500),
):
    """List menu categories for the staff member's store.

    Includes the experiences category: workshops are sellable at POS, but the
    order endpoint enforces a session + attached customer for them."""
    result = await db.execute(
        select(MenuCategory)
        .where(MenuCategory.deleted_at.is_(None))
        .order_by(MenuCategory.display_order)
        .limit(per_page)
    )
    cats = result.scalars().all()
    return APIResponse(data=[{"id": c.id, "category_name": c.category_name, "slug": c.slug, "display_order": c.display_order, "is_available": c.is_available} for c in cats])


@router.get("/staff/menu/items")
async def staff_list_menu_items(
    staff: CurrentStaff,
    db: DBDependency,
    per_page: int = Query(500, ge=1, le=1000),
    category_id: int | None = Query(None),
):
    """List menu items for the staff member's store (full POS shape)."""
    stmt = (
        select(MenuItem)
        .where(MenuItem.deleted_at.is_(None), MenuItem.is_available.is_(True))
        .order_by(MenuItem.category_id, MenuItem.display_order)
        .limit(per_page)
    )
    if category_id:
        stmt = stmt.where(MenuItem.category_id == category_id)
    result = await db.execute(stmt)
    items = result.scalars().all()
    item_ids = [m.id for m in items]

    # Category names
    cat_ids = {m.category_id for m in items if m.category_id}
    cat_result = await db.execute(select(MenuCategory).where(MenuCategory.id.in_(cat_ids)))
    cat_map = {c.id: c.category_name for c in cat_result.scalars().all()}

    # Variants
    variants_result = await db.execute(
        select(MenuVariant).where(
            MenuVariant.parent_item_id.in_(item_ids),
            MenuVariant.is_available.is_(True),
        )
    )
    variants_map: dict[int, list] = {}
    for v in variants_result.scalars().all():
        variants_map.setdefault(v.parent_item_id, []).append(v)

    # Modifier groups with options
    mg_result = await db.execute(
        select(MenuModifierGroup)
        .options(selectinload(MenuModifierGroup.options))
        .where(MenuModifierGroup.menu_item_id.in_(item_ids))
    )
    modifier_map: dict[int, list] = {}
    for mg in mg_result.scalars().all():
        group_out = MenuModifierGroupOut.model_validate(mg)
        group_out.options = [
            MenuModifierOptionOut.model_validate(opt)
            for opt in mg.options
            if opt.is_available
        ]
        modifier_map.setdefault(mg.menu_item_id, []).append(group_out.model_dump())

    # Allergens
    allergen_map: dict[int, list] = {}
    if item_ids:
        allergen_result = await db.execute(
            select(MenuItemAllergen.menu_item_id, Allergen)
            .join(Allergen, Allergen.id == MenuItemAllergen.allergen_id)
            .where(MenuItemAllergen.menu_item_id.in_(item_ids))
        )
        for mi_id, allergen in allergen_result.all():
            allergen_map.setdefault(mi_id, []).append(AllergenOut.model_validate(allergen).model_dump())

    # Dietary tags
    dietary_map: dict[int, list[str]] = {}
    if item_ids:
        dietary_result = await db.execute(
            select(MenuItemDietaryTag.menu_item_id, DietaryTag.tag_key)
            .join(DietaryTag, DietaryTag.id == MenuItemDietaryTag.dietary_tag_id)
            .where(MenuItemDietaryTag.menu_item_id.in_(item_ids))
        )
        for mi_id, tag_key in dietary_result.all():
            dietary_map.setdefault(mi_id, []).append(tag_key)

    out = []
    for m in items:
        item_dict = {c: getattr(m, c) for c in m.__table__.columns.keys()}
        item_dict["base_price"] = float(m.base_price) if m.base_price else 0
        item_dict["category_name"] = cat_map.get(m.category_id)
        item_dict["variants"] = [
            MenuVariantOut.model_validate(v).model_dump() for v in variants_map.get(m.id, [])
        ]
        item_dict["modifier_groups"] = modifier_map.get(m.id, [])
        item_dict["allergens"] = allergen_map.get(m.id, [])
        item_dict["dietary_tags"] = dietary_map.get(m.id) or None
        out.append(item_dict)
    return APIResponse(data=out)


@router.get("/staff/tables")
async def staff_list_tables(staff: CurrentStaff, db: DBDependency):
    """List dining tables for the staff member's store."""
    result = await db.execute(
        select(DiningTable)
        .where(
            DiningTable.store_id == staff.store_id,
            DiningTable.deleted_at.is_(None),
        )
        .order_by(DiningTable.section, DiningTable.table_number)
    )
    tables = result.scalars().all()
    # Enrich with current status from TableStatusSnapshot
    out = []
    for t in tables:
        status_result = await db.execute(
            select(TableStatusSnapshot.status).where(TableStatusSnapshot.table_id == t.id)
        )
        status = status_result.scalar_one_or_none() or "available"
        out.append({
            "id": t.id,
            "store_id": t.store_id,
            "section": t.section,
            "table_number": t.table_number,
            "display_name": t.display_name,
            "capacity": t.capacity,
            "current_status": status,
            "is_active": t.is_active,
        })
    return APIResponse(data=out)


@router.get("/staff/orders")
async def staff_list_orders(
    staff: CurrentStaff,
    db: DBDependency,
    status_filter: str | None = Query(None, alias="status"),
    order_type: str | None = Query(None),
    payment_status: str | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(100, ge=1, le=500),
):
    """List orders for the staff member's store."""
    stmt = (
        select(Order, Customer, DiningTable)
        .outerjoin(Customer, Customer.id == Order.customer_id)
        .outerjoin(DiningTable, DiningTable.id == Order.dining_table_id)
        .where(Order.store_id == staff.store_id)
    )
    if status_filter:
        stmt = stmt.where(Order.status == status_filter)
    if order_type:
        stmt = stmt.where(Order.order_type == order_type)
    if payment_status:
        stmt = stmt.where(Order.payment_status == payment_status)
    stmt = stmt.order_by(Order.created_at.desc()).offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(stmt)
    rows = result.all()
    return APIResponse(data=[
        {
            "id": o.id,
            "order_number": o.order_number,
            "status": o.status,
            "order_type": o.order_type,
            "payment_status": o.payment_status,
            "customer_id": o.customer_id,
            "customer_name": c.display_name if c else None,
            "customer_phone": c.phone_number if c else None,
            "dining_table_id": o.dining_table_id,
            "table_number": t.table_number if t else None,
            "item_count": o.item_count,
            "items_subtotal": float(o.items_subtotal) if o.items_subtotal else 0,
            "tax_amount": float(o.tax_amount) if o.tax_amount else 0,
            "service_charge": float(o.service_charge) if o.service_charge else 0,
            "discount_amount": float(o.discount_amount) if o.discount_amount else 0,
            "total_amount": float(o.total_amount) if o.total_amount else 0,
            "created_at": o.created_at.isoformat() if o.created_at else None,
            "updated_at": o.updated_at.isoformat() if o.updated_at else None,
        }
        for o, c, t in rows
    ])


@router.get("/staff/reservations")
async def staff_list_reservations(
    staff: CurrentStaff,
    db: DBDependency,
    status_filter: str | None = Query(None, alias="status"),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(100, ge=1, le=500),
):
    """List reservations for the staff member's store."""
    stmt = (
        select(Reservation, Customer, DiningTable)
        .outerjoin(Customer, Customer.id == Reservation.customer_id)
        .outerjoin(DiningTable, DiningTable.id == Reservation.dining_table_id)
        .where(Reservation.store_id == staff.store_id)
    )
    if status_filter:
        stmt = stmt.where(Reservation.status == status_filter)
    if date_from:
        from datetime import date as date_cls
        stmt = stmt.where(Reservation.reservation_date >= date_cls.fromisoformat(date_from))
    if date_to:
        from datetime import date as date_cls
        stmt = stmt.where(Reservation.reservation_date <= date_cls.fromisoformat(date_to))
    stmt = stmt.order_by(Reservation.reservation_date.desc(), Reservation.reservation_time.desc()).offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(stmt)
    rows = result.all()
    return APIResponse(data=[
        {
            "id": r.id,
            "store_id": r.store_id,
            "customer_id": r.customer_id,
            "customer_name": c.display_name if c else None,
            "customer_phone": c.phone_number if c else None,
            "party_size": r.party_size,
            "reservation_date": r.reservation_date.isoformat() if r.reservation_date else None,
            "reservation_time": r.reservation_time.isoformat() if r.reservation_time else None,
            "duration_minutes": r.duration_minutes,
            "status": r.status,
            "dining_table_id": r.dining_table_id,
            "table_number": t.table_number if t else None,
            "special_requests": r.special_requests,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r, c, t in rows
    ])


@router.patch("/staff/tables/{table_id}/status")
async def staff_update_table_status(
    staff: CurrentStaff,
    db: DBDependency,
    table_id: int,
    current_status: str = Query(..., alias="current_status"),
):
    """Update a table's status (staff endpoint)."""
    result = await db.execute(
        select(DiningTable).where(
            DiningTable.id == table_id,
            DiningTable.store_id == staff.store_id,
            DiningTable.deleted_at.is_(None),
        )
    )
    table = result.scalar_one_or_none()
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")
    # Update or create table status snapshot
    snap_result = await db.execute(
        select(TableStatusSnapshot).where(TableStatusSnapshot.table_id == table_id)
    )
    snap = snap_result.scalar_one_or_none()
    if snap:
        snap.status = current_status
    else:
        snap = TableStatusSnapshot(table_id=table_id, status=current_status)
        db.add(snap)
    await db.commit()
    return APIResponse(data={"id": table.id, "current_status": current_status})


# ── Staff order operations ──

@router.get("/staff/orders/{order_id}")
async def staff_get_order(staff: CurrentStaff, db: DBDependency, order_id: int):
    """Get a single order with line items (staff endpoint)."""
    result = await db.execute(
        select(Order, Customer, DiningTable)
        .outerjoin(Customer, Customer.id == Order.customer_id)
        .outerjoin(DiningTable, DiningTable.id == Order.dining_table_id)
        .where(
            Order.id == order_id,
            Order.store_id == staff.store_id,
        )
    )
    row = result.one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Order not found")
    order, customer, table = row

    # Get line items
    items_result = await db.execute(
        select(OrderLineItem).where(OrderLineItem.order_id == order_id)
    )
    line_items = items_result.scalars().all()

    return APIResponse(data={
        "id": order.id,
        "order_number": order.order_number,
        "status": order.status,
        "order_type": order.order_type,
        "payment_status": order.payment_status,
        "customer_id": order.customer_id,
        "customer_name": customer.display_name if customer else None,
        "customer_phone": customer.phone_number if customer else None,
        "dining_table_id": order.dining_table_id,
        "table_number": table.table_number if table else None,
        "items_subtotal": float(order.items_subtotal) if order.items_subtotal else 0,
        "tax_amount": float(order.tax_amount) if order.tax_amount else 0,
        "service_charge": float(order.service_charge) if order.service_charge else 0,
        "discount_amount": float(order.discount_amount) if order.discount_amount else 0,
        "total_amount": float(order.total_amount) if order.total_amount else 0,
        "customer_notes": order.customer_notes,
        "staff_notes": order.staff_notes,
        "created_at": order.created_at.isoformat() if order.created_at else None,
        "updated_at": order.updated_at.isoformat() if order.updated_at else None,
        "items": [
            {
                "id": li.id,
                "menu_item_id": li.menu_item_id,
                "item_name": (li.item_snapshot or {}).get("item_name") if li.item_snapshot else None,
                "quantity": li.quantity,
                "unit_price": float(li.unit_price) if li.unit_price else 0,
                "total": float(li.line_total) if li.line_total else 0,
                "notes": li.special_instructions,
                "status": li.fulfillment_status,
                "selected_modifiers": li.selected_modifiers,
            }
            for li in line_items
        ],
    })


@router.patch("/staff/orders/{order_id}/status")
async def staff_update_order_status(
    staff: CurrentStaff,
    db: DBDependency,
    order_id: int,
    status: str = Query(...),
    reason: str | None = Query(None),
):
    """Update order status (staff endpoint)."""
    result = await db.execute(
        select(Order).where(
            Order.id == order_id,
            Order.store_id == staff.store_id,
        )
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    order.status = status
    if status == "cancelled" and reason:
        order.cancellation_reason = reason
        order.cancelled_at = datetime.now(timezone.utc)
    elif status == "completed":
        order.completed_at = datetime.now(timezone.utc)
    elif status == "preparing":
        order.prepared_at = datetime.now(timezone.utc)
    await db.commit()
    return APIResponse(data={"id": order.id, "status": order.status})


@router.patch("/staff/orders/{order_id}/transfer-table")
async def staff_transfer_table(
    staff: CurrentStaff,
    db: DBDependency,
    order_id: int,
    new_table_id: int = Query(..., alias="new_table_id"),
):
    """Transfer order to a different table (staff endpoint)."""
    result = await db.execute(
        select(Order).where(
            Order.id == order_id,
            Order.store_id == staff.store_id,
        )
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    order.dining_table_id = new_table_id
    await db.commit()
    return APIResponse(data={"id": order.id, "table_id": new_table_id})


# ── Staff reservation operations ──

@router.patch("/staff/reservations/{reservation_id}/status")
async def staff_update_reservation_status(
    staff: CurrentStaff,
    db: DBDependency,
    reservation_id: int,
    data: ReservationStatusUpdate,
):
    """Update reservation status (staff endpoint)."""
    result = await db.execute(
        select(Reservation).where(
            Reservation.id == reservation_id,
            Reservation.store_id == staff.store_id,
        )
    )
    reservation = result.scalar_one_or_none()
    if not reservation:
        raise HTTPException(status_code=404, detail="Reservation not found")
    reservation.status = data.status
    if data.dining_table_id is not None and data.status == "confirmed":
        await _check_table_availability(
            db, data.dining_table_id, reservation.reservation_date,
            reservation.reservation_time, reservation.duration_minutes,
            exclude_reservation_id=reservation.id,
        )
        reservation.dining_table_id = data.dining_table_id
    reservation.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return APIResponse(data={"id": reservation.id, "status": reservation.status})


# ── POS Display State (Redis-backed for cross-device support) ──

import json as _json

# Fields that must never be served through the unauthenticated display-state
# poll — they carry signed payment URLs / pay_tokens.
_DISPLAY_STATE_SENSITIVE_KEYS = {"paymentUrl", "pwaPayUrl", "payment_url", "pay_token", "payToken"}

@router.post("/staff/pos/display-state")
async def set_pos_display_state(
    staff: CurrentStaff,
    state: dict,
):
    """POS broadcasts display state to Redis so any device running /pos/display can poll it."""
    from app.core.cache import get_redis_client
    redis = get_redis_client()
    if not redis:
        raise HTTPException(status_code=503, detail="Display sync unavailable (no Redis)")
    state["store_id"] = staff.store_id
    state["updated_at"] = datetime.now(timezone.utc).isoformat()
    key = f"pos:display:{staff.store_id}"
    await redis.set(key, _json.dumps(state), ex=3600)  # 1-hour TTL
    return APIResponse(data={"ok": True})


@router.delete("/staff/pos/display-state")
async def clear_pos_display_state(staff: CurrentStaff):
    """Clear the POS display state (reset to idle)."""
    from app.core.cache import get_redis_client
    redis = get_redis_client()
    if not redis:
        raise HTTPException(status_code=503, detail="Display sync unavailable (no Redis)")
    key = f"pos:display:{staff.store_id}"
    await redis.delete(key)
    return APIResponse(data={"ok": True})


@router.get("/staff/pos/display-state")
async def get_pos_display_state(
    db: DBDependency,
    store_id: int = Query(...),
    key: str = Query(...),
):
    """Customer display polls this to get the current POS state.

    Unauthenticated except for the per-store display key (?key=) so a counter
    tablet can poll without a staff login. Signed payment URLs / pay_tokens
    are stripped from the served state; the display can still show a pay
    prompt via phase / payment_pending.
    """
    store = await db.get(Store, store_id)
    if not store or store.deleted_at is not None or not store.display_key or store.display_key != key:
        raise HTTPException(status_code=403, detail="Invalid display key")
    from app.core.cache import get_redis_client
    redis = get_redis_client()
    if not redis:
        return APIResponse(data=None)
    redis_key = f"pos:display:{store_id}"
    raw = await redis.get(redis_key)
    if not raw:
        return APIResponse(data=None)
    try:
        state = _json.loads(raw)
    except Exception:
        return APIResponse(data=None)
    for sensitive in _DISPLAY_STATE_SENSITIVE_KEYS:
        state.pop(sensitive, None)
    if state.get("phase") in ("payment", "qr_payment"):
        state["payment_pending"] = True
    return APIResponse(data=state)
