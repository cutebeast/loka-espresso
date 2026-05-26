"""FastAPI dependencies for API v1."""

from datetime import datetime, timezone
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

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
    db: DBDependency,
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
) -> Customer:
    """Dependency to get the currently authenticated customer."""
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    token = credentials.credentials
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
    db: DBDependency,
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
) -> AdminAccount:
    """Dependency to get the currently authenticated admin."""
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    try:
        payload = decode_token(token)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    token_type = payload.get("type")
    # Accept access tokens AND staff tokens with admin_id (staff portal uses admin endpoints)
    if token_type not in ("access", "staff", "admin"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Staff portal: use admin_id from claims if staff token
    admin_id = int(payload.get("admin_id", payload.get("sub", 0)))
    if token_type == "staff" and not payload.get("admin_id"):
        staff_id = int(payload.get("staff_id", 0))
        if staff_id > 0:
            staff_result = await db.execute(select(StaffProfile).where(StaffProfile.id == staff_id))
            staff = staff_result.scalar_one_or_none()
            if staff and staff.principal_id:
                admin_id = staff.principal_id

    # For staff tokens authenticated via StaffProfile (not admin), accept without AdminAccount lookup
    if token_type == "staff" and not payload.get("admin_id"):
        from dataclasses import dataclass as _dc
        @_dc
        class _StaffAdmin:
            id: int = int(payload.get("staff_id", 0))
            principal_id: int = int(payload.get("sub", 0))
            display_name: str = payload.get("admin_name", "Staff")
            email: str = ""
            is_active: bool = True
            is_staff_context: bool = True
            deleted_at = None
        return _StaffAdmin()

    if not admin_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token subject",
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

    if admin.locked_until and admin.locked_until > datetime.now(timezone.utc):
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
    """Extract staff JWT from header and return StaffProfile."""
    token = request.headers.get("Authorization", "").replace("Bearer ", "")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = decode_token(token)
        if payload.get("type") not in ("staff", "admin"):
            raise HTTPException(status_code=401, detail="Invalid token type")
        staff_id = payload.get("staff_id")
        if not staff_id and payload.get("type") != "staff":
            raise HTTPException(status_code=401, detail="No staff profile")
        # Admin users on staff portal have staff_id=0 — return minimal StaffProfile
        if staff_id == 0:
            from dataclasses import dataclass
            @dataclass
            class AdminStaff:
                id: int = 0; principal_id: int = 0; store_id: int = int(payload.get("store_id", 0))
                display_name: str = payload.get("admin_name", "Admin"); email_address: str = ""
            return AdminStaff()

        result = await db.execute(select(StaffProfile).where(StaffProfile.id == staff_id, StaffProfile.deleted_at.is_(None)))
        staff = result.scalar_one_or_none()
        if not staff or not staff.is_active:
            raise HTTPException(status_code=401, detail="Staff not found or inactive")
        return staff
    except pyjwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


CurrentStaff = Annotated[StaffProfile, Depends(get_current_staff)]


async def _get_admin_role_keys(db: AsyncSession, admin_id: int) -> set[str]:
    """Query active role keys for an admin."""
    result = await db.execute(
        select(IAMRole.role_key)
        .join(RoleAssignment, RoleAssignment.role_id == IAMRole.id)
        .where(
            RoleAssignment.assignee_id == admin_id,
            RoleAssignment.is_active.is_(True),
            IAMRole.is_system.is_(True),
        )
    )
    return {row[0] for row in result.all()}


async def _get_admin_store_ids(db: AsyncSession, admin_id: int) -> set[int]:
    """Query assigned store IDs for an admin."""
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
    role_keys = await _get_admin_role_keys(db, admin.id)
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
    # Staff context: staff profiles are scoped to their own store
    if getattr(admin, 'is_staff_context', False):
        if admin.id == 0:
            # admin-on-staff-portal (no StaffProfile) — allow access to any store
            return admin
        staff_r = await db.execute(
            select(StaffProfile).where(
                StaffProfile.id == admin.id,
                StaffProfile.deleted_at.is_(None),
            )
        )
        staff_profile = staff_r.scalar_one_or_none()
        if staff_profile and staff_profile.store_id == store_id:
            return admin
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Store access denied",
        )

    role_keys = await _get_admin_role_keys(db, admin.id)
    # HQ admins can access any store
    if role_keys & {"system_admin", "regional_manager", "readonly_analyst"}:
        return admin
    # Store-scoped admins need explicit assignment
    store_ids = await _get_admin_store_ids(db, admin.id)
    if store_id not in store_ids:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Store access denied",
        )
    return admin
