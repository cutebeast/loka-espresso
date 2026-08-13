"""FastAPI dependencies for API v1."""
import logging
from datetime import datetime, timezone
from typing import Annotated, Any

logger = logging.getLogger(__name__)

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth_cookies import get_admin_access_token, get_customer_access_token, get_staff_access_token
from app.core.config import get_settings
from app.core.database import get_db
from app.core.security import decode_token
import jwt as pyjwt
from app.models.customer import Customer
from app.models.iam import AdminAccount, IAMRole, RoleAssignment, StoreAssignment
from app.models.staff import StaffProfile

settings = get_settings()
security_scheme = HTTPBearer(auto_error=False)

# Active locales (2026-08-07): EN + CN only at launch; ms may return later,
# ta/tr dropped. Unknown/stale stored locales fall back to English.
SUPPORTED_LOCALES = {"en", "zh"}
SOURCE_LOCALE = "en"


def enum_filter_or_400(value: str | None, enum_type, param_name: str) -> str | None:
    """Validate a query-filter value against a native PG enum's labels.

    A raw string reaching an enum cast raises InvalidTextRepresentationError
    (bare 500). Reject unknown values with 400 + the valid list instead.
    """
    if value is None:
        return None
    if value not in enum_type.enums:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid {param_name} '{value}'. Valid: {enum_type.enums}",
        )
    return value


def _normalize_locale(raw: str | None) -> str | None:
    """Return a supported base locale, normalising regional variants (e.g. zh-CN -> zh)."""
    if not raw:
        return None
    locale = raw.strip().lower()
    if locale in SUPPORTED_LOCALES:
        return locale
    if "-" in locale:
        prefix = locale.split("-")[0]
        if prefix in SUPPORTED_LOCALES:
            return prefix
    return None


def get_locale_from_request(request: Request) -> str:
    """Extract locale from query param or Accept-Language header.
    Falls back to SOURCE_LOCALE. Regional variants are normalised to the supported base locale."""
    # 1. Check query param
    locale = _normalize_locale(request.query_params.get("locale"))
    if locale:
        return locale

    # 2. Check Accept-Language header
    accept_lang = request.headers.get("accept-language", "")
    if accept_lang:
        for part in accept_lang.replace(";", ",").split(","):
            locale = _normalize_locale(part)
            if locale:
                return locale
    return SOURCE_LOCALE


OptionalLocale = Annotated[str, Depends(get_locale_from_request)]


def get_staff_store_id_from_request(request: Request) -> int | None:
    """Extract store_id from a staff JWT token in the request headers."""
    token = request.headers.get("Authorization", "").replace("Bearer ", "")
    if not token:
        return None
    try:
        payload = decode_token(token)
    except Exception:
        logger.debug("Failed to decode staff store id from token", exc_info=True)
        return None
    if payload.get("type") == "staff":
        return int(payload.get("store_id", 0)) or None
    return None


async def get_async_db() -> AsyncSession:
    async for session in get_db():
        yield session


DBDependency = Annotated[AsyncSession, Depends(get_async_db)]


async def get_current_customer(
    request: Request,
    db: DBDependency,
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
) -> Customer:
    """Dependency to get the currently authenticated customer.

    Prefers the HttpOnly access_token cookie, falling back to the
    Authorization header for backward compatibility.
    """
    token = get_customer_access_token(request)
    if not token and credentials is not None:
        token = credentials.credentials
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        payload = decode_token(token)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
    
    if payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Domain check: only genuine customer access tokens carry a customer_id
    # claim. Admin-portal access tokens are also type="access" with
    # sub = admin.id — without this check an admin token authenticates as the
    # customer with the colliding id.
    customer_id = int(payload.get("customer_id") or 0)
    if not customer_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token subject",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    result = await db.execute(select(Customer).where(Customer.id == customer_id))
    customer = result.scalar_one_or_none()
    
    if customer is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Customer not found",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if customer.deleted_at is not None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account deactivated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Session revocation: tokens minted before a credential change carry a
    # stale token_version and must no longer authenticate.
    if int(payload.get("token_version", 0)) != (getattr(customer, "token_version", 0) or 0):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session has been revoked",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return customer


CurrentCustomer = Annotated[Customer, Depends(get_current_customer)]


async def get_current_active_customer(
    customer: CurrentCustomer,
) -> Customer:
    """Ensure customer account is active."""
    if not customer.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive",
        )
    return customer


ActiveCustomer = Annotated[Customer, Depends(get_current_active_customer)]


async def get_current_admin(
    request: Request,
    db: DBDependency,
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
) -> AdminAccount:
    """Dependency to get the currently authenticated admin.

    Prefers the HttpOnly admin_token cookie, falling back to the
    Authorization header for backward compatibility. Also accepts a staff
    token (staff_token cookie) when it represents an admin acting in a staff
    context (carries an admin_id claim) — this lets the staff portal, which
    authenticates via the staff_token cookie, reach admin-scoped endpoints.
    """
    token = get_admin_access_token(request)
    if not token:
        token = get_staff_access_token(request)
    if not token and credentials is not None:
        token = credentials.credentials
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = decode_token(token)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    token_type = payload.get("type")
    if token_type not in ("access", "admin", "staff"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type",
            headers={"WWW-Authenticate": "Bearer"},
        )

    now = datetime.now(timezone.utc)

    # Staff tokens can satisfy CurrentAdmin only when they represent an admin
    # acting in a staff context (admin_id claim). Real staff profile tokens
    # (staff_id > 0 with no admin_id) are rejected.
    if token_type == "staff":
        admin_id = int(payload.get("admin_id", 0))
        if not admin_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid staff token",
                headers={"WWW-Authenticate": "Bearer"},
            )

        result = await db.execute(
            select(AdminAccount).where(AdminAccount.id == admin_id)
        )
        admin = result.scalar_one_or_none()
        if admin is None or admin.deleted_at is not None or not admin.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Admin not found",
                headers={"WWW-Authenticate": "Bearer"},
            )
        if admin.locked_until and admin.locked_until > now:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account is locked",
            )
        if int(payload.get("token_version", 0)) != (getattr(admin, "token_version", 0) or 0):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session has been revoked",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return admin

    admin_id = int(payload.get("admin_id", 0))
    if not admin_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid admin token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    result = await db.execute(
        select(AdminAccount).where(AdminAccount.id == admin_id)
    )
    admin = result.scalar_one_or_none()

    if admin is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Admin not found",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if admin.deleted_at is not None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account deactivated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if admin.locked_until and admin.locked_until > now:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is locked",
        )

    if not admin.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive",
        )

    if int(payload.get("token_version", 0)) != (getattr(admin, "token_version", 0) or 0):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session has been revoked",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return admin


CurrentAdmin = Annotated[AdminAccount, Depends(get_current_admin)]


async def get_current_staff(request: Request, db: DBDependency) -> StaffProfile:
    """Extract staff JWT from cookie or header and return StaffProfile."""
    token = get_staff_access_token(request)
    if not token:
        token = request.headers.get("Authorization", "").replace("Bearer ", "")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = decode_token(token)
        token_type = payload.get("type")
        if token_type not in ("staff", "admin"):
            raise HTTPException(status_code=401, detail="Invalid token type")
        staff_id = payload.get("staff_id")
        if not staff_id and token_type != "staff":
            raise HTTPException(status_code=401, detail="No staff profile")

        # Admin users on staff portal have staff_id=0 — verify the admin account
        # before allowing them to act in a staff context.
        if staff_id == 0:
            admin_id = int(payload.get("admin_id", 0))
            if not admin_id:
                raise HTTPException(status_code=401, detail="Invalid admin token")
            result = await db.execute(
                select(AdminAccount).where(AdminAccount.id == admin_id)
            )
            admin = result.scalar_one_or_none()
            if admin is None or admin.deleted_at is not None or not admin.is_active:
                raise HTTPException(status_code=401, detail="Admin not found or inactive")
            if admin.locked_until and admin.locked_until > datetime.now(timezone.utc):
                raise HTTPException(status_code=403, detail="Account is locked")
            if int(payload.get("token_version", 0)) != (getattr(admin, "token_version", 0) or 0):
                raise HTTPException(status_code=401, detail="Session has been revoked")
            from dataclasses import dataclass

            @dataclass
            class AdminStaff:
                id: int = 0
                # Real principal of the underlying admin account so wallet /
                # redemption audit rows are attributed (was 0 → audit skipped).
                principal_id: int = admin.principal_id or 0
                store_id: int = int(payload.get("store_id", 0))
                display_name: str = payload.get("admin_name", admin.display_name or "Admin")
                email_address: str = admin.email or ""
                # Marks this object as an admin acting in a staff context so that
                # RequireStaffRole's admin-override lets it through staff endpoints
                # (admin has full authority; no StaffProfile/role needed).
                is_staff_context: bool = True

            return AdminStaff()

        result = await db.execute(
            select(StaffProfile).where(
                StaffProfile.id == staff_id,
                StaffProfile.deleted_at.is_(None),
            )
        )
        staff = result.scalar_one_or_none()
        if not staff or not staff.is_active:
            raise HTTPException(status_code=401, detail="Staff not found or inactive")

        if int(payload.get("token_version", 0)) != (getattr(staff, "token_version", 0) or 0):
            raise HTTPException(status_code=401, detail="Session has been revoked")

        if staff.pin_last_changed_at is None:
            path = request.url.path
            exempt_paths = ["change-pin", "change-password", "/auth/me", "/auth/logout", "/auth/refresh", "/auth/pin", "/health"]
            if request.method != "OPTIONS" and not any(p in path for p in exempt_paths):
                raise HTTPException(status_code=403, detail="must_change_pin")

        return staff
    except pyjwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


CurrentStaff = Annotated[StaffProfile, Depends(get_current_staff)]


class RequireStaffRole:
    """Dependency factory that restricts an endpoint to staff with one of the allowed roles.

    Admin users acting in a staff context are allowed through (admin override).
    """

    def __init__(self, *allowed_roles: str):
        self.allowed_roles = set(allowed_roles)

    def __call__(self, staff: CurrentStaff) -> StaffProfile:
        # Admin override in staff context
        if getattr(staff, "is_staff_context", False):
            return staff
        if not hasattr(staff, "role") or staff.role not in self.allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient staff role for this operation",
            )
        return staff


async def _get_admin_role_keys(db: AsyncSession, admin_id: int, admin_obj: Any = None) -> set[str]:
    """Query active role keys for an admin. Supports staff-context objects."""
    # Staff profiles have implicit "store_staff" role for their own store
    if admin_obj is not None and getattr(admin_obj, 'is_staff_context', False):
        return {"store_staff"}
    result = await db.execute(
        select(IAMRole.role_key)
        .join(RoleAssignment, RoleAssignment.role_id == IAMRole.id)
        .where(
            RoleAssignment.assignee_id == admin_id,
            RoleAssignment.is_active.is_(True),
        )
    )
    return {row[0] for row in result.all()}


async def _get_admin_store_ids(db: AsyncSession, admin_id: int, admin_obj: Any = None) -> set[int]:
    """Query assigned store IDs for an admin. Supports staff-context objects."""
    # Staff profiles are scoped to their assigned store
    if admin_obj is not None and getattr(admin_obj, 'is_staff_context', False):
        staff_r = await db.execute(
            select(StaffProfile.store_id).where(
                StaffProfile.id == admin_obj.id,
                StaffProfile.deleted_at.is_(None),
            )
        )
        sid = staff_r.scalar_one_or_none()
        return {sid} if sid else set()
    result = await db.execute(
        select(StoreAssignment.store_id)
        .where(
            StoreAssignment.assignee_id == admin_id,
        )
    )
    return {row[0] for row in result.all()}


async def require_hq_admin(
    db: DBDependency,
    admin: CurrentAdmin,
) -> AdminAccount:
    """Require admin to have global scope role (system_admin or regional_manager)."""
    role_keys = await _get_admin_role_keys(db, admin.id, admin_obj=admin)
    if not (role_keys & {"system_admin", "regional_manager", "readonly_analyst"}):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="HQ access required",
        )
    return admin


HQAdmin = Annotated[AdminAccount, Depends(require_hq_admin)]


async def require_hq_write_admin(db: AsyncSession, admin: AdminAccount) -> AdminAccount:
    """Require a global-scope write role (system_admin or regional_manager).

    Unlike require_hq_admin this excludes readonly_analyst — used to gate
    platform-wide money mutations (wallet adjustments, points, tiers,
    customer deletion) so store_manager / readonly accounts get 403.
    """
    role_keys = await _get_admin_role_keys(db, admin.id, admin_obj=admin)
    if not (role_keys & {"system_admin", "regional_manager"}):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="HQ access required",
        )
    return admin


async def require_store_admin(
    db: DBDependency,
    admin: CurrentAdmin,
    store_id: int,
) -> AdminAccount:
    """Require admin to have access to a specific store."""
    role_keys = await _get_admin_role_keys(db, admin.id, admin_obj=admin)
    # HQ admins can access any store
    if role_keys & {"system_admin", "regional_manager", "readonly_analyst"}:
        return admin
    # Store-scoped admins need explicit assignment
    store_ids = await _get_admin_store_ids(db, admin.id, admin_obj=admin)
    if store_id not in store_ids:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Store access denied",
        )
    return admin


# Roles allowed to perform write operations in the admin portal.
WRITE_CAPABLE_ADMIN_ROLES = {"system_admin", "regional_manager", "store_manager"}

# Self-service mutations any authenticated admin may call regardless of role
# (otherwise read-only accounts could not maintain their own session).
_WRITE_GUARD_EXEMPT_PATHS = (
    "/api/admin/auth/logout",
    "/api/admin/auth/refresh",
    "/api/admin/auth/change-password",
)


async def reject_readonly_admin_mutations(request: Request, db: DBDependency) -> None:
    """Router-level guard: reject admin mutations by accounts with no
    write-capable role (readonly_analyst, or no role assignments at all).

    Attached as a dependency on every admin router include. GET/HEAD/OPTIONS
    and unauthenticated requests pass through untouched — route-level auth
    dependencies decide those. This is the central enforcement of the
    documented "readonly_analyst = view only" contract.
    """
    if request.method in ("GET", "HEAD", "OPTIONS"):
        return
    if any(request.url.path.startswith(p) for p in _WRITE_GUARD_EXEMPT_PATHS):
        return
    token = get_admin_access_token(request) or get_staff_access_token(request)
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[len("Bearer "):]
    if not token:
        return  # route's own CurrentAdmin dependency will reject
    try:
        payload = decode_token(token)
    except Exception:
        return  # route's own CurrentAdmin dependency will reject
    admin_id = int(payload.get("admin_id", 0))
    if not admin_id:
        return  # not an admin-context token — route deps decide
    role_keys = await _get_admin_role_keys(db, admin_id)
    if not (role_keys & WRITE_CAPABLE_ADMIN_ROLES):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This admin role is read-only",
        )
