from datetime import datetime, timedelta, timezone
from typing import Optional, Sequence
import uuid
from jose import jwt, JWTError
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.config import get_settings
from app.core.database import get_db

settings = get_settings()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


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
    """Check if a JTI is in the blacklist."""
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

    # Check token blacklist
    if jti and await _is_token_blacklisted(jti, db):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token has been revoked")

    from app.models.user import User
    result = await db.execute(select(User).where(User.id == int(user_id)))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


def require_role(*roles: str):
    """Check that the authenticated user has one of the given UserRole values.
    
    Usage: `user: User = Depends(require_role("admin", "store_owner"))`
    """
    async def role_checker(user=Depends(get_current_user)):
        if user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return user
    return role_checker


# ---------------------------------------------------------------------------
# ACL Helpers for store-scoped staff access
# ---------------------------------------------------------------------------

# Predefined role groups for common permission levels
MANAGEMENT_ROLES = {"manager", "assistant_manager"}
ALL_STAFF_ROLES = {"manager", "assistant_manager", "barista", "cashier", "delivery"}


async def get_staff_record(
    user_id: int,
    store_id: int,
    db: AsyncSession,
):
    """Look up an active Staff record for a user at a specific store.
    Returns the Staff object or None.
    """
    from app.models.staff import Staff
    result = await db.execute(
        select(Staff).where(
            Staff.user_id == user_id,
            Staff.store_id == store_id,
            Staff.is_active == True,
        )
    )
    return result.scalar_one_or_none()


def require_store_access(
    store_id_param: str = "store_id",
    *,
    allowed_staff_roles: Optional[set[str]] = None,
):
    """Dependency that grants access if:
    1. User is admin → always allowed
    2. User is store_owner → always allowed (for any store)
    3. User has an active Staff record at the specified store with a matching role
    
    Returns the authenticated User object.
    
    Usage:
        # Full management access (manager + assistant_manager)
        user: User = Depends(require_store_access("store_id"))
        
        # All staff can view orders
        user: User = Depends(require_store_access("store_id", allowed_staff_roles=ALL_STAFF_ROLES))
        
        # Only managers can manage staff
        user: User = Depends(require_store_access("store_id", allowed_staff_roles={"manager"}))
    """
    if allowed_staff_roles is None:
        allowed_staff_roles = MANAGEMENT_ROLES

    async def access_checker(
        request: Request,
        user=Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ):
        from app.models.user import UserRole
        
        # Admin always passes
        if user.role == UserRole.admin:
            return user
        
        # Store owner always passes
        if user.role == UserRole.store_owner:
            return user
        
        # Check staff record
        store_id = request.path_params.get(store_id_param)
        if store_id is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Store ID required for staff access",
            )
        
        staff = await get_staff_record(user.id, int(store_id), db)
        if staff is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No staff record found for this store",
            )
        
        staff_role = staff.role.value if hasattr(staff.role, 'value') else str(staff.role)
        if staff_role not in allowed_staff_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Staff role '{staff_role}' not authorized for this action",
            )
        
        return user
    
    return access_checker


def require_store_access_with_staff(
    store_id_param: str = "store_id",
    *,
    allowed_staff_roles: Optional[set[str]] = None,
):
    """Same as require_store_access but also returns the Staff record (or None for admin/store_owner).
    
    Returns a dict: {"user": User, "staff": Staff | None}
    """
    if allowed_staff_roles is None:
        allowed_staff_roles = MANAGEMENT_ROLES

    async def access_checker(
        request: Request,
        user=Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ):
        from app.models.user import UserRole
        
        # Admin always passes, no staff record needed
        if user.role == UserRole.admin:
            return {"user": user, "staff": None}
        
        # Store owner always passes, no staff record needed
        if user.role == UserRole.store_owner:
            return {"user": user, "staff": None}
        
        # Check staff record
        store_id = request.path_params.get(store_id_param)
        if store_id is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Store ID required for staff access",
            )
        
        staff = await get_staff_record(user.id, int(store_id), db)
        if staff is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No staff record found for this store",
            )
        
        staff_role = staff.role.value if hasattr(staff.role, 'value') else str(staff.role)
        if staff_role not in allowed_staff_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Staff role '{staff_role}' not authorized for this action",
            )
        
        return {"user": user, "staff": staff}
    
    return access_checker
