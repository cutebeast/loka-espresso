"""Admin authentication endpoints."""

from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Request, Response, status
from sqlalchemy import delete, select

from app.api.routes.deps import DBDependency, CurrentAdmin
from app.models.iam import AdminAccount, IAMPermission, IAMRole, RoleAssignment, RolePermission, StoreAssignment
from app.schemas.auth import AdminLoginRequest, AuthResponse, RefreshTokenRequest, TokenPair
from app.schemas.base import APIResponse, BaseSchema
from app.services.auth import (
    AuthError,
    blacklist_refresh_token,
    create_admin_tokens,
    login_admin,
    refresh_admin_tokens,
)
from app.core.auth_cookies import clear_admin_auth_cookies, get_admin_refresh_token, set_admin_auth_cookies
from app.core.rate_limiter import limiter
from app.core.security import hash_password, verify_password, decode_token

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


class CreateRoleRequest(BaseSchema):
    display_name: str
    role_key: str | None = None
    description: str | None = None


class UpdateRoleRequest(BaseSchema):
    display_name: str | None = None
    description: str | None = None


class SetRolePermissionsRequest(BaseSchema):
    permission_ids: list[int] = []


@router.post("/register", response_model=AdminMeOut, status_code=status.HTTP_201_CREATED)
async def admin_register(db: DBDependency, admin: CurrentAdmin, data: AdminRegisterRequest):
    """Create a new admin account. Requires existing admin authentication."""
    # Check email uniqueness
    result = await db.execute(select(AdminAccount).where(AdminAccount.email == data.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    # Authorization check: resolve requesting admin's roles
    requester_role_result = await db.execute(
        select(IAMRole.role_key)
        .join(RoleAssignment, RoleAssignment.role_id == IAMRole.id)
        .where(
            RoleAssignment.assignee_id == admin.id,
            RoleAssignment.is_active.is_(True),
        )
    )
    requester_roles = {row[0] for row in requester_role_result.all()}

    # Determine the target role key
    role_id = None
    target_role_key = data.role_key

    # Assign role if specified (role_id takes precedence; fallback to role_key lookup)
    if data.role_id:
        role_result = await db.execute(select(IAMRole).where(IAMRole.id == data.role_id))
        role_row = role_result.scalar_one_or_none()
        if role_row:
            role_id = role_row.id
            target_role_key = role_row.role_key
    elif data.role_key:
        role_result = await db.execute(select(IAMRole.id, IAMRole.role_key).where(IAMRole.role_key == data.role_key))
        role_row = role_result.first()
        if role_row:
            role_id = role_row[0]
            target_role_key = role_row[1]

    # Enforce: only system_admin can create system_admin accounts
    if target_role_key == "system_admin" and "system_admin" not in requester_roles:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only system administrators can create system admin accounts")

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

    # Assign the resolved role
    if role_id:
        ra = RoleAssignment(assignee_id=new_admin.id, role_id=role_id, effective_from=datetime.now(timezone.utc), is_active=True)
        db.add(ra)

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
async def admin_login(request: Request, response: Response, db: DBDependency, data: AdminLoginRequest):
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

    set_admin_auth_cookies(response, tokens.access_token, tokens.refresh_token)

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
async def admin_refresh(request: Request, response: Response, db: DBDependency, data: RefreshTokenRequest | None = None):
    """Refresh admin access token."""
    refresh_token = get_admin_refresh_token(request) or (data.refresh_token if data else "")
    if not refresh_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token required")
    try:
        tokens = await refresh_admin_tokens(db, RefreshTokenRequest(refresh_token=refresh_token))
    except AuthError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    set_admin_auth_cookies(response, tokens.access_token, tokens.refresh_token)
    return tokens


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def admin_logout(
    request: Request,
    response: Response,
    db: DBDependency,
    data: RefreshTokenRequest | None = None,
):
    """Log out the current admin, revoke the refresh token, and clear auth cookies."""
    refresh_token = get_admin_refresh_token(request) or (data.refresh_token if data else None)
    if refresh_token:
        try:
            payload = decode_token(refresh_token)
            if payload.get("type") != "refresh":
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid token type")
            jti = payload.get("jti")
            await blacklist_refresh_token(db, jti, None, payload)
        except HTTPException:
            raise
        except Exception:
            pass
    clear_admin_auth_cookies(response)


@router.get("/me", response_model=AdminMeOut)
async def admin_me(db: DBDependency, request: Request, admin: CurrentAdmin):
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
    admin_roles = {"system_admin", "regional_manager", "store_manager", "readonly_analyst"}
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
    admins = result.scalars().all()
    if not admins:
        return APIResponse(data=[])

    admin_ids = [a.id for a in admins]

    # Batch-resolve roles for all admins
    role_result = await db.execute(
        select(RoleAssignment.assignee_id, IAMRole.display_name)
        .join(IAMRole, IAMRole.id == RoleAssignment.role_id)
        .where(
            RoleAssignment.assignee_id.in_(admin_ids),
            RoleAssignment.is_active.is_(True),
        )
    )
    roles_map: dict[int, list[str]] = {}
    for assignee_id, role_name in role_result.all():
        roles_map.setdefault(assignee_id, []).append(role_name)

    # Batch-resolve store assignments for all admins
    store_result = await db.execute(
        select(StoreAssignment.assignee_id, StoreAssignment.store_id)
        .where(StoreAssignment.assignee_id.in_(admin_ids))
    )
    stores_map: dict[int, list[int]] = {}
    for assignee_id, store_id in store_result.all():
        stores_map.setdefault(assignee_id, []).append(store_id)

    items = []
    for a in admins:
        items.append({
            "id": a.id, "email": a.email, "display_name": a.display_name,
            "phone_number": a.phone_number,
            "is_active": a.is_active,
            "last_login_at": a.last_login_at.isoformat() if a.last_login_at else None,
            "created_at": a.created_at.isoformat() if a.created_at else None,
            "roles": roles_map.get(a.id, []),
            "store_ids": stores_map.get(a.id, []),
        })
    return APIResponse(data=items)


async def _require_system_admin(db: DBDependency, admin: CurrentAdmin):
    """Raise 403 unless the current admin has the system_admin role."""
    result = await db.execute(
        select(IAMRole.role_key)
        .join(RoleAssignment, RoleAssignment.role_id == IAMRole.id)
        .where(
            RoleAssignment.assignee_id == admin.id,
            RoleAssignment.is_active.is_(True),
            IAMRole.role_key == "system_admin",
        )
    )
    if not result.first():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="System administrator access required")


@router.get("/roles", response_model=APIResponse[list[dict]])
async def list_roles(db: DBDependency, admin: CurrentAdmin):
    """List all IAM roles."""
    result = await db.execute(select(IAMRole).order_by(IAMRole.id))
    items = [{"id": r.id, "display_name": r.display_name, "description": r.description, "role_key": r.role_key} for r in result.scalars().all()]
    return APIResponse(data=items)


@router.post("/roles", response_model=APIResponse[dict], status_code=status.HTTP_201_CREATED)
async def create_role(db: DBDependency, admin: CurrentAdmin, data: CreateRoleRequest):
    """Create a new IAM role. Requires system_admin."""
    await _require_system_admin(db, admin)
    result = await db.execute(select(IAMRole).where(IAMRole.role_key == (data.role_key or "").lower().replace(" ", "_")))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Role key already exists")
    role = IAMRole(
        display_name=data.display_name,
        role_key=data.role_key or data.display_name.lower().replace(" ", "_"),
        description=data.description or "",
    )
    db.add(role)
    await db.commit()
    await db.refresh(role)
    return APIResponse(data={"id": role.id, "display_name": role.display_name})


@router.put("/roles/{role_id}", response_model=APIResponse[dict])
async def update_role(db: DBDependency, admin: CurrentAdmin, role_id: int, data: UpdateRoleRequest):
    """Update an IAM role. Requires system_admin."""
    await _require_system_admin(db, admin)
    result = await db.execute(select(IAMRole).where(IAMRole.id == role_id))
    role = result.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    if data.display_name is not None:
        role.display_name = data.display_name
    if data.description is not None:
        role.description = data.description
    await db.commit()
    return APIResponse(data={"id": role.id, "updated": True})


@router.delete("/roles/{role_id}", response_model=APIResponse[dict])
async def delete_role(db: DBDependency, admin: CurrentAdmin, role_id: int):
    """Delete an IAM role and its assignments. Requires system_admin."""
    await _require_system_admin(db, admin)
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
async def set_role_permissions(db: DBDependency, admin: CurrentAdmin, role_id: int, data: SetRolePermissionsRequest):
    """Set permissions for a role (replaces all). Requires system_admin."""
    await _require_system_admin(db, admin)
    from app.models.iam import IAMPermission, RolePermission
    # Verify role exists
    role_result = await db.execute(select(IAMRole).where(IAMRole.id == role_id))
    if not role_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Role not found")
    # Remove existing
    await db.execute(delete(RolePermission).where(RolePermission.role_id == role_id))
    # Add new
    for pid in data.permission_ids:
        perm = await db.execute(select(IAMPermission).where(IAMPermission.id == pid))
        if perm.scalar_one_or_none():
            db.add(RolePermission(role_id=role_id, permission_id=pid))
    await db.commit()
    return APIResponse(data={"role_id": role_id, "updated": True})


class ChangePasswordRequest(BaseSchema):
    current_password: str
    password: str


@router.post("/change-password", response_model=APIResponse[dict])
async def change_admin_password(db: DBDependency, admin: CurrentAdmin, data: ChangePasswordRequest):
    """Change the current admin's password."""
    if len(data.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    if not verify_password(data.current_password, admin.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    admin.password_hash = hash_password(data.password)
    admin.password_algorithm = "argon2id"
    await db.commit()
    return APIResponse(data={"updated": True})


@router.delete("/users/{user_id}", response_model=APIResponse[dict])
async def delete_admin_user(db: DBDependency, admin: CurrentAdmin, user_id: int):
    """Soft-delete an admin account. Cannot delete yourself. Requires system_admin."""
    await _require_system_admin(db, admin)
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
