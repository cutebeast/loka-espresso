"""Admin authentication endpoints."""

from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.api.v1.deps import DBDependency, CurrentAdmin
from app.models.iam import AdminAccount, IAMRole, RoleAssignment, StoreAssignment
from app.schemas.auth import AdminLoginRequest, AuthResponse, RefreshTokenRequest, TokenPair
from app.schemas.base import BaseSchema
from app.services.auth import (
    AuthError,
    create_admin_tokens,
    login_admin,
    refresh_admin_tokens,
)
from app.core.security import hash_password

router = APIRouter(prefix="/admin/auth", tags=["admin — authentication"])


class AdminMeOut(BaseSchema):
    id: int
    email: str
    display_name: str
    is_active: bool
    mfa_enabled: bool
    roles: list[str]
    store_ids: list[int]


class AdminRegisterRequest(BaseSchema):
    email: str
    password: str
    display_name: str
    role_key: str = "system_admin"
    store_ids: list[int] = []


@router.post("/register", response_model=AdminMeOut, status_code=status.HTTP_201_CREATED)
async def admin_register(db: DBDependency, admin: CurrentAdmin, data: AdminRegisterRequest):
    """Create a new admin account. Requires existing admin authentication."""
    # Check email uniqueness
    result = await db.execute(select(AdminAccount).where(AdminAccount.email == data.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    # Create principal
    from app.models.iam import IAMPrincipal
    principal = IAMPrincipal(principal_type="human", status="active")
    db.add(principal)
    await db.flush()
    await db.refresh(principal)

    # Create admin account
    new_admin = AdminAccount(
        principal_id=principal.id,
        email=data.email,
        display_name=data.display_name,
        password_hash=hash_password(data.password),
        password_algorithm="argon2id",
        is_active=True,
    )
    db.add(new_admin)
    await db.flush()
    await db.refresh(new_admin)

    # Assign role
    role_result = await db.execute(select(IAMRole.id).where(IAMRole.role_key == data.role_key))
    role_id = role_result.scalar_one_or_none()
    if role_id:
        assignment = RoleAssignment(assignee_id=new_admin.id, role_id=role_id, effective_from=datetime.now(timezone.utc), is_active=True)
        db.add(assignment)

    # Assign stores
    for store_id in data.store_ids:
        sa = StoreAssignment(assignee_id=new_admin.id, store_id=store_id, is_primary=(store_id == data.store_ids[0] if data.store_ids else False), can_approve_refunds=True, can_adjust_inventory=True, can_manage_staff=True)
        db.add(sa)

    await db.commit()
    await db.refresh(new_admin)

    return AdminMeOut(
        id=new_admin.id,
        email=new_admin.email,
        display_name=new_admin.display_name,
        is_active=new_admin.is_active,
        mfa_enabled=new_admin.mfa_enabled,
        roles=[data.role_key] if role_id else [],
        store_ids=data.store_ids,
    )


@router.post("/login", response_model=AuthResponse)
async def admin_login(db: DBDependency, data: AdminLoginRequest):
    """Admin portal login with email and password."""
    try:
        admin = await login_admin(db, data)
    except AuthError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc

    tokens = await create_admin_tokens(admin)

    # Load roles
    role_result = await db.execute(
        select(IAMRole.role_key)
        .join(RoleAssignment, RoleAssignment.role_id == IAMRole.id)
        .where(
            RoleAssignment.assignee_id == admin.id,
            RoleAssignment.is_active.is_(True),
        )
    )
    roles = [row[0] for row in role_result.all()]

    # Load store assignments
    store_result = await db.execute(
        select(StoreAssignment.store_id)
        .where(StoreAssignment.assignee_id == admin.id)
    )
    store_ids = [row[0] for row in store_result.all()]

    return AuthResponse(
        user_type="admin",
        user_id=admin.id,
        tokens=tokens,
        profile={
            "id": admin.id,
            "email": admin.email,
            "display_name": admin.display_name,
            "is_active": admin.is_active,
            "mfa_enabled": admin.mfa_enabled,
            "roles": roles,
            "store_ids": store_ids,
        },
    )


@router.post("/refresh", response_model=TokenPair)
async def admin_refresh(db: DBDependency, data: RefreshTokenRequest):
    """Refresh admin access token."""
    try:
        return await refresh_admin_tokens(db, data)
    except AuthError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc


@router.get("/me", response_model=AdminMeOut)
async def admin_me(db: DBDependency, admin: CurrentAdmin):
    """Get current admin profile with roles and store assignments."""
    role_result = await db.execute(
        select(IAMRole.role_key)
        .join(RoleAssignment, RoleAssignment.role_id == IAMRole.id)
        .where(
            RoleAssignment.assignee_id == admin.id,
            RoleAssignment.is_active.is_(True),
        )
    )
    roles = [row[0] for row in role_result.all()]

    store_result = await db.execute(
        select(StoreAssignment.store_id)
        .where(StoreAssignment.assignee_id == admin.id)
    )
    store_ids = [row[0] for row in store_result.all()]

    return AdminMeOut(
        id=admin.id,
        email=admin.email,
        display_name=admin.display_name,
        is_active=admin.is_active,
        mfa_enabled=admin.mfa_enabled,
        roles=roles,
        store_ids=store_ids,
    )
