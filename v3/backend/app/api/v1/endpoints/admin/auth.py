"""Admin authentication endpoints."""

from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, status
from sqlalchemy import delete, select

from app.api.v1.deps import DBDependency, CurrentAdmin
from app.models.iam import AdminAccount, IAMPermission, IAMRole, RoleAssignment, RolePermission, StoreAssignment
from app.schemas.auth import AdminLoginRequest, AuthResponse, RefreshTokenRequest, TokenPair
from app.schemas.base import APIResponse, BaseSchema
from app.services.auth import (
    AuthError,
    create_admin_tokens,
    login_admin,
    refresh_admin_tokens,
)
from app.core.rate_limiter import limiter
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
    phone_number: str | None = None
    role_id: int | None = None
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
        phone_number=data.phone_number,
        password_hash=hash_password(data.password),
        password_algorithm="argon2id",
        is_active=True,
    )
    db.add(new_admin)
    await db.flush()
    await db.refresh(new_admin)

    # Assign role if specified
    if data.role_id:
        from app.models.iam import RoleAssignment
        ra = RoleAssignment(assignee_id=new_admin.id, role_id=data.role_id)
        db.add(ra)

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
@limiter.limit("5/minute")
async def admin_login(request, db: DBDependency, data: AdminLoginRequest):
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
@limiter.limit("10/minute")
async def admin_refresh(request, db: DBDependency, data: RefreshTokenRequest):
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

    # Staff-only users (no admin roles) cannot access admin portal
    admin_roles = {"system_admin", "regional_manager", "store_manager"}
    if not (set(roles) & admin_roles):
        raise HTTPException(status_code=403, detail="Staff accounts cannot access admin portal")

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


@router.get("/users", response_model=APIResponse[list[dict]])
async def list_admin_users(db: DBDependency, admin: CurrentAdmin):
    """List all admin accounts."""
    result = await db.execute(
        select(AdminAccount).where(AdminAccount.deleted_at.is_(None)).order_by(AdminAccount.id)
    )
    items = []
    for a in result.scalars().all():
        # Resolve roles
        role_result = await db.execute(
            select(IAMRole.display_name)
            .join(RoleAssignment, RoleAssignment.role_id == IAMRole.id)
            .where(RoleAssignment.assignee_id == a.id)
        )
        role_names = [r[0] for r in role_result.all()]
        # Resolve store assignments
        store_result = await db.execute(
            select(StoreAssignment.store_id)
            .where(StoreAssignment.assignee_id == a.id)
        )
        store_ids = [r[0] for r in store_result.all()]
        items.append({
            "id": a.id, "email": a.email, "display_name": a.display_name,
            "phone_number": a.phone_number,
            "is_active": a.is_active,
            "last_login_at": a.last_login_at.isoformat() if a.last_login_at else None,
            "created_at": a.created_at.isoformat() if a.created_at else None,
            "roles": role_names,
            "store_ids": store_ids,
        })
    return APIResponse(data=items)


@router.get("/roles", response_model=APIResponse[list[dict]])
async def list_roles(db: DBDependency, admin: CurrentAdmin):
    """List all IAM roles."""
    result = await db.execute(select(IAMRole).order_by(IAMRole.id))
    items = [{"id": r.id, "display_name": r.display_name, "description": r.description, "role_key": r.role_key} for r in result.scalars().all()]
    return APIResponse(data=items)


@router.post("/roles", response_model=APIResponse[dict], status_code=status.HTTP_201_CREATED)
async def create_role(db: DBDependency, admin: CurrentAdmin, data: dict):
    """Create a new IAM role."""
    result = await db.execute(select(IAMRole).where(IAMRole.role_key == data.get("role_key", "").lower().replace(" ", "_")))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Role key already exists")
    role = IAMRole(
        display_name=data["display_name"],
        role_key=data.get("role_key", data["display_name"].lower().replace(" ", "_")),
        description=data.get("description", ""),
    )
    db.add(role)
    await db.commit()
    await db.refresh(role)
    return APIResponse(data={"id": role.id, "display_name": role.display_name})


@router.put("/roles/{role_id}", response_model=APIResponse[dict])
async def update_role(db: DBDependency, admin: CurrentAdmin, role_id: int, data: dict):
    """Update an IAM role."""
    result = await db.execute(select(IAMRole).where(IAMRole.id == role_id))
    role = result.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    for field in ["display_name", "description"]:
        if field in data:
            setattr(role, field, data[field])
    await db.commit()
    return APIResponse(data={"id": role.id, "updated": True})


@router.delete("/roles/{role_id}", response_model=APIResponse[dict])
async def delete_role(db: DBDependency, admin: CurrentAdmin, role_id: int):
    """Delete an IAM role and its assignments."""
    result = await db.execute(select(IAMRole).where(IAMRole.id == role_id))
    role = result.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    # Remove role assignments
    await db.execute(delete(RoleAssignment).where(RoleAssignment.role_id == role_id))
    await db.execute(delete(RolePermission).where(RolePermission.role_id == role_id))
    await db.delete(role)
    await db.commit()
    return APIResponse(data={"id": role_id, "deleted": True})


@router.get("/permissions", response_model=APIResponse[list[dict]])
async def list_permissions(db: DBDependency, admin: CurrentAdmin):
    """List all IAM permissions."""
    from app.models.iam import IAMPermission
    result = await db.execute(select(IAMPermission).order_by(IAMPermission.id))
    items = [{"id": p.id, "permission_key": p.permission_key, "resource": p.resource, "action": p.action, "description": p.description} for p in result.scalars().all()]
    return APIResponse(data=items)


@router.get("/roles/{role_id}/permissions", response_model=APIResponse[dict])
async def get_role_permissions(db: DBDependency, admin: CurrentAdmin, role_id: int):
    """Get permissions assigned to a role."""
    from app.models.iam import RolePermission
    result = await db.execute(select(RolePermission.permission_id).where(RolePermission.role_id == role_id))
    permission_ids = [r[0] for r in result.all()]
    return APIResponse(data={"role_id": role_id, "permission_ids": permission_ids})


@router.put("/roles/{role_id}/permissions", response_model=APIResponse[dict])
async def set_role_permissions(db: DBDependency, admin: CurrentAdmin, role_id: int, data: dict):
    """Set permissions for a role (replaces all)."""
    from app.models.iam import IAMPermission, RolePermission
    # Verify role exists
    role_result = await db.execute(select(IAMRole).where(IAMRole.id == role_id))
    if not role_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Role not found")
    # Remove existing
    await db.execute(delete(RolePermission).where(RolePermission.role_id == role_id))
    # Add new
    for pid in data.get("permission_ids", []):
        perm = await db.execute(select(IAMPermission).where(IAMPermission.id == pid))
        if perm.scalar_one_or_none():
            db.add(RolePermission(role_id=role_id, permission_id=pid))
    await db.commit()
    return APIResponse(data={"role_id": role_id, "updated": True})


@router.delete("/users/{user_id}", response_model=APIResponse[dict])
async def delete_admin_user(db: DBDependency, admin: CurrentAdmin, user_id: int):
    """Soft-delete an admin account. Cannot delete yourself."""
    if admin.id == user_id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    result = await db.execute(
        select(AdminAccount).where(AdminAccount.id == user_id, AdminAccount.deleted_at.is_(None))
    )
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="Admin user not found")
    target.is_active = False
    target.deleted_at = datetime.now(timezone.utc)
    await db.commit()
    return APIResponse(data={"id": user_id, "deleted": True})
