"""FastAPI dependencies for API v1."""

from datetime import datetime, timezone
from typing import Annotated, Any

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

SUPPORTED_LOCALES = {"en", "ms", "zh", "ta", "tr"}
SUPPORTED_LOCALE_PREFIXES = {locale.split("-")[0] if "-" in locale else locale for locale in SUPPORTED_LOCALES} | SUPPORTED_LOCALES
SOURCE_LOCALE = "en"


def get_locale_from_request(request: Request) -> str:
    """Extract locale from query param or Accept-Language header.
    Falls back to 'en'. Only allows supported locales.
    Supports regional variants (e.g. zh-CN, zh-TW) by preserving the full code
    when the prefix matches a supported locale."""
    # 1. Check query param
    locale = request.query_params.get("locale")
    if locale:
        locale = locale.strip()
        if locale in SUPPORTED_LOCALE_PREFIXES:
            return locale
        if "-" in locale:
            prefix = locale.split("-")[0]
            if prefix in SUPPORTED_LOCALE_PREFIXES:
                return locale
    # 2. Check Accept-Language header
    accept_lang = request.headers.get("accept-language", "")
    if accept_lang:
        for part in accept_lang.replace(";", ",").split(","):
            part = part.strip()
            lower_part = part.lower()
            if lower_part in SUPPORTED_LOCALE_PREFIXES:
                return lower_part
            if "-" in lower_part:
                prefix = lower_part.split("-")[0]
                if prefix in SUPPORTED_LOCALE_PREFIXES:
                    return lower_part
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
    
    customer_id = int(payload.get("sub", 0))
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
    Authorization header for backward compatibility.
    """
    token = get_admin_access_token(request)
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
            from dataclasses import dataclass

            @dataclass
            class AdminStaff:
                id: int = 0
                principal_id: int = 0
                store_id: int = int(payload.get("store_id", 0))
                display_name: str = payload.get("admin_name", admin.display_name or "Admin")
                email_address: str = admin.email or ""

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
