from datetime import datetime, timedelta, timezone
from typing import Optional
import uuid
from jose import jwt, JWTError
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.config import get_settings
from app.core.database import get_db
from app.models.user import UserTypeIDs, RoleIDs

settings = get_settings()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def now_utc() -> datetime:
    """Return current UTC time as timezone-aware datetime.
    
    DB stores DateTime(timezone=True) as naive timestamps. When comparing
    DB datetimes against datetime.now(timezone.utc), we must ensure both
    are timezone-aware to avoid TypeError.
    """
    return datetime.now(timezone.utc)


def ensure_utc(dt: Optional[datetime]) -> Optional[datetime]:
    """Ensure a datetime is timezone-aware (UTC). If naive, add UTC timezone."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=settings.JWT_EXPIRE_MINUTES))
    to_encode.update({"exp": expire, "type": "access", "jti": str(uuid.uuid4())})
    return jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(days=30)
    to_encode.update({"exp": expire, "type": "refresh", "jti": str(uuid.uuid4())})
    return jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


async def _is_token_blacklisted(jti: str, db: AsyncSession) -> bool:
    from app.models.user import TokenBlacklist
    result = await db.execute(select(TokenBlacklist).where(TokenBlacklist.jti == jti))
    return result.scalar_one_or_none() is not None


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
):
    token = credentials.credentials
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")
        user_id: Optional[int] = payload.get("sub")
        jti: Optional[str] = payload.get("jti")
        if user_id is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    if jti and await _is_token_blacklisted(jti, db):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token has been revoked")

    from app.models.user import User
    result = await db.execute(select(User).where(User.id == int(user_id)))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


# ---------------------------------------------------------------------------
# ACL HELPERS
# ---------------------------------------------------------------------------

def is_global_admin(user) -> bool:
    """Admin or Brand Owner — sees all stores, full access."""
    return user.role_id in (RoleIDs.ADMIN, RoleIDs.BRAND_OWNER)


def is_hq(user) -> bool:
    """Any HQ Management user (Admin, Brand Owner, HQ Staff)."""
    return user.user_type_id == UserTypeIDs.HQ_MANAGEMENT


def is_dashboard_user(user) -> bool:
    """Any non-customer user who can access the admin dashboard."""
    return user.user_type_id != UserTypeIDs.CUSTOMER


async def user_has_permission(user, permission_name: str, db: AsyncSession) -> bool:
    """Check if the user's role has a specific permission."""
    from app.models.acl import RolePermission, Permission
    result = await db.execute(
        select(RolePermission).join(Permission).where(
            RolePermission.role_id == user.role_id,
            Permission.name == permission_name,
        )
    )
    return result.scalar_one_or_none() is not None


async def get_allowed_store_ids(user, db: AsyncSession) -> list[int]:
    """Get list of store IDs the user can access.
    Admin/Brand Owner = all active stores.
    Others = stores from user_store_access."""
    from app.models.store import Store
    from app.models.acl import UserStoreAccess

    if is_global_admin(user):
        result = await db.execute(select(Store.id).where(Store.is_active == True))
        return [row[0] for row in result.all()]

    result = await db.execute(
        select(UserStoreAccess.store_id).where(UserStoreAccess.user_id == user.id)
    )
    return [row[0] for row in result.all()]


async def can_access_store(user, store_id: int, db: AsyncSession) -> bool:
    """Check if user can access a specific store."""
    if is_global_admin(user):
        return True
    from app.models.acl import UserStoreAccess
    result = await db.execute(
        select(UserStoreAccess).where(
            UserStoreAccess.user_id == user.id,
            UserStoreAccess.store_id == store_id,
        )
    )
    return result.scalar_one_or_none() is not None


# ---------------------------------------------------------------------------
# DEPENDENCY: require_permission
# ---------------------------------------------------------------------------

def require_permission(permission_name: str):
    """Dependency: user must have the given permission via role_permissions."""
    async def checker(
        user=Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ):
        if not await user_has_permission(user, permission_name, db):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Permission '{permission_name}' required")
        return user
    return checker


# ---------------------------------------------------------------------------
# DEPENDENCY: require_role (by role ID)
# ---------------------------------------------------------------------------

def require_role(*role_ids: int):
    """Check that the user has one of the given role IDs.
    If UserTypeIDs.CUSTOMER is matched by user_type_id, also allows for PWA endpoints."""
    async def role_checker(user=Depends(get_current_user)):
        if user.role_id in role_ids:
            return user
        # Allow global admins through any role check
        if is_global_admin(user):
            return user
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
    return role_checker


# ---------------------------------------------------------------------------
# DEPENDENCY: require_dashboard_access
# ---------------------------------------------------------------------------

def require_dashboard_access():
    """Dependency: user must have dashboard access (not a customer)."""
    async def checker(user=Depends(get_current_user)):
        if not is_dashboard_user(user):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Dashboard access required")
        return user
    return checker


# ---------------------------------------------------------------------------
# DEPENDENCY: require_hq_access
# ---------------------------------------------------------------------------

def require_hq_access():
    """Dependency: only HQ Management users (admin, brand_owner, HQ staff)."""
    async def checker(user=Depends(get_current_user)):
        if not is_hq(user):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="HQ Management access required")
        return user
    return checker


# ---------------------------------------------------------------------------
# DEPENDENCY: require_store_access — uses user_store_access
# ---------------------------------------------------------------------------

def require_store_access(
    store_id_param: str = "store_id",
):
    """Dependency that grants access if:
    1. Global admin/brand_owner → always allowed
    2. Others → must have user_store_access record for that store
    """
    async def access_checker(
        request: Request,
        user=Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ):
        if is_global_admin(user):
            return user

        store_id = request.path_params.get(store_id_param)
        if store_id is None:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Store ID required")

        if not await can_access_store(user, int(store_id), db):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No access to this store")

        return user

    return access_checker
