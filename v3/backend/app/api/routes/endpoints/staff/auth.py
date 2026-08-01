"""Staff authentication endpoints (login, refresh, PIN, password)."""

import logging
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, HTTPException, Request, Response
from sqlalchemy import select

from app.api.routes.deps import CurrentStaff, DBDependency
from app.models.iam import AdminAccount, IAMRole, RoleAssignment, StoreAssignment, TokenBlacklist
from app.models.staff import StaffProfile
from app.models.store import Store
from app.schemas.base import APIResponse
from app.schemas.staff import (
    StaffLoginRequest,
    StaffRefreshRequest,
    StaffAdminStoreRequest,
    StaffPinVerifyRequest,
    StaffChangePasswordRequest,
    StaffChangePinRequest,
)
from app.services.auth import DUMMY_PASSWORD_HASH, blacklist_refresh_token
from app.core.auth_cookies import (
    clear_staff_auth_cookies,
    get_staff_access_token,
    get_staff_refresh_token,
    set_staff_auth_cookies,
)
from app.core.rate_limiter import limiter
from app.core.security import hash_password, verify_password_staff, decode_token, create_access_token, create_refresh_token, verify_password

logger = logging.getLogger(__name__)

router = APIRouter(tags=["staff — auth"])


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
        # Same argon2 cost as a real account — without it the response time
        # reveals which emails belong to admin accounts.
        verify_password(password, DUMMY_PASSWORD_HASH)
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # Verify the password BEFORE evaluating the lock: a 423 on a wrong
    # password would confirm the email belongs to an admin account and let an
    # attacker observe the lockout taking effect.
    if not verify_password(password, admin.password_hash):
        admin.failed_login_count = (admin.failed_login_count or 0) + 1
        if admin.failed_login_count >= 5:
            admin.locked_until = datetime.now(timezone.utc) + timedelta(minutes=30)
            admin.failed_login_count = 0
        await db.commit()
        raise HTTPException(status_code=401, detail="Invalid credentials")
    # Lock state is only revealed to a caller with the correct password.
    if admin.locked_until and admin.locked_until > datetime.now(timezone.utc):
        raise HTTPException(status_code=423, detail="Account temporarily locked. Try again later.")
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
        # Authorize the requested store: HQ roles may act at any store;
        # everyone else needs an explicit StoreAssignment — same rule as
        # /staff/auth/admin-store. Without this check any admin (incl.
        # readonly_analyst) could mint a staff-context token for an arbitrary
        # store and pass RequireStaffRole's admin override on money endpoints.
        from app.api.routes.deps import _get_admin_role_keys
        role_keys = await _get_admin_role_keys(db, admin.id)
        if not (role_keys & {"system_admin", "regional_manager", "readonly_analyst"}):
            assignment_result = await db.execute(
                select(StoreAssignment).where(
                    StoreAssignment.assignee_id == admin.id,
                    StoreAssignment.store_id == int(store_id),
                )
            )
            if not assignment_result.scalar_one_or_none():
                raise HTTPException(status_code=403, detail="Admin not assigned to this store")
        access_token = create_access_token(
            admin.id,
            token_type="staff",
            extra_claims={"staff_id": 0, "store_id": int(store_id), "admin_id": admin.id, "admin_name": admin.display_name, "token_version": admin.token_version or 0}
        )
        refresh_token = create_refresh_token(
            admin.id,
            extra_claims={"staff_id": 0, "store_id": int(store_id), "admin_id": admin.id, "token_version": admin.token_version or 0},
            days=7,  # admin principals get the admin-portal lifetime, not the 30-day staff one
        )
        set_staff_auth_cookies(response, access_token, refresh_token)
        return {"tokens": {"access_token": access_token, "refresh_token": refresh_token}, "profile": {"email": admin.email, "display_name": admin.display_name, "store_id": int(store_id), "is_admin": True}}
    # No store_id — return admin token with store list for store selection
    store_list = await db.execute(select(Store).where(Store.deleted_at.is_(None), Store.is_active.is_(True)))
    stores = [{"id": s.id, "store_name": s.store_name} for s in store_list.scalars().all()]
    access_token = create_access_token(
        admin.id,
        token_type="admin",
        extra_claims={"admin_id": admin.id, "token_version": admin.token_version or 0}
    )
    refresh_token = create_refresh_token(
        admin.id,
        extra_claims={"admin_id": admin.id, "token_version": admin.token_version or 0},
        days=7,  # admin principals get the admin-portal lifetime, not the 30-day staff one
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
        extra_claims={"staff_id": 0, "store_id": int(store_id), "admin_id": admin.id, "admin_name": admin.display_name, "token_version": admin.token_version or 0}
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
        extra_claims={"staff_id": staff.id, "store_id": staff.store_id, "token_version": staff.token_version or 0}
    )
    refresh = create_refresh_token(
        staff.principal_id,
        extra_claims={"staff_id": staff.id, "store_id": staff.store_id, "token_version": staff.token_version or 0},
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
        # Session revocation: refresh tokens minted before a credential change
        # carry a stale token_version.
        if int(payload.get("token_version", 0)) != (staff.token_version or 0):
            raise HTTPException(status_code=401, detail="Invalid refresh token")
        # Revoke this refresh token so it cannot be reused (atomic)
        try:
            await blacklist_refresh_token(db, jti, staff.principal_id, payload)
        except HTTPException as exc:
            if exc.status_code == 401:
                # Refresh-token reuse — the family is compromised; revoke every
                # token for this staff member, not just the replayed one.
                staff.token_version = (staff.token_version or 0) + 1
                await db.commit()
            raise
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
        if int(payload.get("token_version", 0)) != (admin.token_version or 0):
            raise HTTPException(status_code=401, detail="Invalid refresh token")
        access_token = create_access_token(
            admin.id,
            token_type="staff",
            extra_claims={"staff_id": 0, "store_id": int(store_id or 0), "admin_id": admin.id, "admin_name": admin.display_name, "token_version": admin.token_version or 0}
        )
        # Rotate the refresh token and return it in the JSON body as well —
        # the Next.js proxy ignores Set-Cookie, so without the body value the
        # next refresh would 401 (token is blacklisted below).
        new_refresh_token = create_refresh_token(
            admin.id,
            extra_claims={"staff_id": 0, "store_id": int(store_id or 0), "admin_id": admin.id, "token_version": admin.token_version or 0},
            days=7,  # admin principals get the admin-portal lifetime, not the 30-day staff one
        )
        # Revoke this refresh token so it cannot be reused (atomic)
        try:
            await blacklist_refresh_token(db, jti, admin.principal_id, payload)
        except HTTPException as exc:
            if exc.status_code == 401:
                # Refresh-token reuse — kill the admin's whole session family.
                admin.token_version = (admin.token_version or 0) + 1
                await db.commit()
            raise
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
@limiter.limit("10/minute")
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


# ── PIN Verify ──

@router.post("/staff/auth/verify-pin")
@limiter.limit("10/minute")
async def staff_verify_pin(request: Request, db: DBDependency, staff: CurrentStaff, data: StaffPinVerifyRequest):

    pin = str(data.pin or "").strip()
    if not pin or len(pin) != 6 or not pin.isdigit():
        raise HTTPException(status_code=400, detail="PIN must be exactly 6 digits")

    if not hasattr(staff, "pin_hash") or not staff.pin_hash:
        return APIResponse(data={"valid": False, "message": "No PIN set"})

    # Per-account throttling using the same counters as PIN login — the
    # 10/min per-IP limit alone would let a stolen staff session brute-force
    # the 6-digit PIN space (or lock the victim out deliberately is
    # preferable to silent disclosure; login clears the lock on success).
    now = datetime.now(timezone.utc)
    if staff.locked_until and staff.locked_until > now:
        return APIResponse(data={"valid": False, "message": "Account temporarily locked. Try again later."})

    try:
        valid = verify_password_staff(pin, staff.pin_hash if isinstance(staff.pin_hash, str) else staff.pin_hash.decode())
    except Exception:
        valid = False

    if not valid:
        staff.failed_login_count = (staff.failed_login_count or 0) + 1
        if staff.failed_login_count >= 5:
            staff.locked_until = now + timedelta(minutes=30)
            staff.failed_login_count = 0
        await db.commit()
        return APIResponse(data={"valid": False, "message": "Invalid PIN"})

    staff.failed_login_count = 0
    await db.commit()
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
    if len(pw) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    staff.password_hash = hash_password(pw)
    # Revoke all existing sessions — tokens carry the old token_version.
    staff.token_version = (staff.token_version or 0) + 1
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
    # Revoke all existing sessions — tokens carry the old token_version.
    staff.token_version = (staff.token_version or 0) + 1
    await db.commit()
    return APIResponse(data={"updated": True})
