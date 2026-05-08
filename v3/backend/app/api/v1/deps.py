"""FastAPI dependencies for API v1."""

from datetime import datetime, timezone
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db
from app.core.security import decode_token
from app.models.customer import Customer
from app.models.iam import AdminAccount, IAMRole, RoleAssignment, StoreAssignment

settings = get_settings()
security_scheme = HTTPBearer(auto_error=False)


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

    if payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type",
            headers={"WWW-Authenticate": "Bearer"},
        )

    admin_id = int(payload.get("sub", 0))
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
