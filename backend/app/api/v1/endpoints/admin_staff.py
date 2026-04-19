from datetime import timezone, datetime, timedelta
import secrets
import string

from fastapi import APIRouter, Depends, HTTPException, Request, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc

from app.core.database import get_db
from app.core.security import (
    get_current_user, require_store_access, require_hq_access,
    hash_password, verify_password, is_global_admin,
)
from app.core.audit import log_action
from app.models.user import User, UserTypeIDs, RoleIDs
from app.models.staff import Staff, StaffShift, StaffRole, PinAttempt
from app.models.store import Store
from app.models.acl import UserType as ACLUserType, Role, UserStoreAccess, Permission, RolePermission
from app.schemas.admin_extras import StaffCreate, StaffUpdate, StaffShiftOut, ClockInRequest

router = APIRouter()

PIN_MAX_ATTEMPTS = 5
PIN_WINDOW_MINUTES = 5


# ---------------------------------------------------------------------------
# Permission check
# ---------------------------------------------------------------------------

def _can_modify_target(actor: User, target_user: User | None) -> bool:
    """Check if actor can modify the target user's type/role.
    - Admin: can update everyone
    - Brand Owner: can update store_management & store only
    - HQ Staff: can update store_management & store only
    - Others: cannot update (blocked by require_hq_access)
    """
    if not target_user:
        return True
    if actor.role_id == RoleIDs.ADMIN:
        return True
    if actor.role_id in (RoleIDs.BRAND_OWNER, RoleIDs.HQ_STAFF):
        return target_user.user_type_id in (UserTypeIDs.STORE_MANAGEMENT, UserTypeIDs.STORE)
    return False


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _get_store_name_map(db: AsyncSession) -> dict:
    result = await db.execute(select(Store.id, Store.name))
    return {row[0]: row[1] for row in result.all()}


async def _get_store_access_for_users(db: AsyncSession, user_ids: list[int]) -> dict:
    """Returns {user_id: [{store_id, store_name}]} from user_store_access."""
    if not user_ids:
        return {}
    result = await db.execute(
        select(UserStoreAccess.user_id, UserStoreAccess.store_id, Store.name)
        .join(Store, Store.id == UserStoreAccess.store_id)
        .where(UserStoreAccess.user_id.in_(user_ids))
    )
    out: dict = {}
    for uid, sid, sname in result.all():
        out.setdefault(uid, []).append({"store_id": sid, "store_name": sname})
    return out


async def _resolve_role_names(db: AsyncSession, user_ids: list[int]) -> dict:
    """Returns {user_id: {user_type, role, user_type_id, role_id}} with resolved names."""
    if not user_ids:
        return {}
    result = await db.execute(select(User.id, User.user_type_id, User.role_id).where(User.id.in_(user_ids)))
    rows = result.all()  # Consume once

    ut_map: dict[int, set] = {}
    role_map: dict[int, set] = {}
    for uid, ut_id, r_id in rows:
        ut_map.setdefault(ut_id, set()).add(uid)
        role_map.setdefault(r_id, set()).add(uid)

    names_ut = {}
    names_role = {}
    if ut_map:
        r = await db.execute(select(ACLUserType.id, ACLUserType.name).where(ACLUserType.id.in_(ut_map.keys())))
        names_ut = {row[0]: row[1] for row in r.all()}
    if role_map:
        r = await db.execute(select(Role.id, Role.name).where(Role.id.in_(role_map.keys())))
        names_role = {row[0]: row[1] for row in r.all()}

    out = {}
    for uid, ut_id, r_id in rows:
        out[uid] = {
            "user_type": names_ut.get(ut_id),
            "role": names_role.get(r_id),
            "user_type_id": ut_id,
            "role_id": r_id,
        }
    return out


async def _sync_store_access(db: AsyncSession, user_id: int, store_ids: list[int], assigned_by: int):
    """Set user_store_access to exactly the given store_ids. Deletes removed, adds new."""
    # Get current
    result = await db.execute(select(UserStoreAccess).where(UserStoreAccess.user_id == user_id))
    current = result.scalars().all()
    current_ids = {s.store_id for s in current}

    # Delete removed
    for s in current:
        if s.store_id not in store_ids:
            await db.delete(s)

    # Add new
    for sid in store_ids:
        if sid not in current_ids:
            db.add(UserStoreAccess(user_id=user_id, store_id=sid, assigned_by=assigned_by))


# ---------------------------------------------------------------------------
# PIN rate limiting
# ---------------------------------------------------------------------------

async def _check_pin_rate_limit(staff_id: int, db: AsyncSession):
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=PIN_WINDOW_MINUTES)
    result = await db.execute(
        select(func.count()).select_from(PinAttempt).where(
            PinAttempt.staff_id == staff_id, PinAttempt.attempted_at >= cutoff,
        )
    )
    if (result.scalar() or 0) >= PIN_MAX_ATTEMPTS:
        raise HTTPException(429, detail=f"Too many PIN attempts. Try again after {PIN_WINDOW_MINUTES} minutes.")


# ---------------------------------------------------------------------------
# HQ Staff list — ALL users with user_type_id = HQ_MANAGEMENT
# ---------------------------------------------------------------------------

@router.get("/admin/hq-staff")
async def list_hq_staff(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_hq_access()),
):
    count_q = select(func.count()).select_from(User).where(User.user_type_id == UserTypeIDs.HQ_MANAGEMENT)
    total_result = await db.execute(count_q)
    total = total_result.scalar() or 0

    result = await db.execute(
        select(User).where(User.user_type_id == UserTypeIDs.HQ_MANAGEMENT).order_by(User.name)
        .offset((page - 1) * page_size).limit(page_size)
    )
    hq_users = result.scalars().all()
    user_ids = [u.id for u in hq_users]
    names = await _resolve_role_names(db, user_ids)
    store_access = await _get_store_access_for_users(db, user_ids)

    out = []
    for u in hq_users:
        n = names.get(u.id, {})
        out.append({
            "id": None, "store_id": None, "user_id": u.id,
            "name": u.name or "", "email": u.email, "phone": u.phone,
            "role": n.get("role"), "user_type": n.get("user_type"),
            "user_type_id": u.user_type_id, "role_id": u.role_id,
            "is_active": u.is_active,
            "created_at": u.created_at.isoformat() if u.created_at else None,
            "store_assignments": store_access.get(u.id, []),
        })
    return {
        "staff": out,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
    }


# ---------------------------------------------------------------------------
# Store-scoped staff list
# ---------------------------------------------------------------------------

@router.get("/admin/stores/{store_id}/staff")
async def list_staff(
    store_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_store_access()),
):
    count_q = select(func.count()).select_from(Staff).where(Staff.store_id == store_id)
    total_result = await db.execute(count_q)
    total = total_result.scalar() or 0

    result = await db.execute(
        select(Staff).where(Staff.store_id == store_id)
        .offset((page - 1) * page_size).limit(page_size)
    )
    staff_list = result.scalars().all()

    user_ids = list(set(s.user_id for s in staff_list if s.user_id))
    names = await _resolve_role_names(db, user_ids)
    store_access = await _get_store_access_for_users(db, user_ids)
    store_name_map = await _get_store_name_map(db)

    out = []
    for s in staff_list:
        n = names.get(s.user_id, {}) if s.user_id else {}
        out.append({
            "id": s.id, "store_id": s.store_id, "user_id": s.user_id,
            "name": s.name, "email": s.email, "phone": s.phone,
            "role": s.role.value if hasattr(s.role, 'value') else str(s.role),
            "user_type": n.get("user_type"), "user_role": n.get("role"),
            "user_type_id": n.get("user_type_id"), "role_id": n.get("role_id"),
            "is_active": s.is_active,
            "created_at": s.created_at.isoformat() if s.created_at else None,
            "store_name": store_name_map.get(s.store_id),
            "store_assignments": store_access.get(s.user_id, []) if s.user_id else [],
        })
    return {
        "staff": out,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
    }


# ---------------------------------------------------------------------------
# Create HQ Staff
# ---------------------------------------------------------------------------

@router.post("/admin/hq-staff")
async def create_hq_staff(
    data: StaffCreate, request: Request,
    db: AsyncSession = Depends(get_db), user: User = Depends(require_hq_access()),
):
    temp_password = None
    user_id = None

    ut_id = data.user_type_id or UserTypeIDs.HQ_MANAGEMENT
    r_id = data.role_id or RoleIDs.HQ_STAFF

    if data.email:
        existing = await db.execute(select(User).where(User.email == data.email))
        if existing.scalar_one_or_none():
            raise HTTPException(400, detail=f"User with email '{data.email}' already exists")
        temp_password = ''.join(secrets.choice(string.ascii_letters + string.digits) for _ in range(8))
        new_user = User(
            email=data.email, name=data.name, phone=data.phone,
            password_hash=hash_password(temp_password),
            user_type_id=ut_id, role_id=r_id, is_active=True,
        )
        db.add(new_user)
        await db.flush()
        user_id = new_user.id

    # Sync store assignments
    if user_id and data.store_ids:
        await _sync_store_access(db, user_id, data.store_ids, user.id)


    # Get role names for response
    names = await _resolve_role_names(db, [user_id] if user_id else [])
    store_access = await _get_store_access_for_users(db, [user_id] if user_id else [])
    n = names.get(user_id, {})

    result = {
        "id": None, "store_id": None, "user_id": user_id,
        "name": data.name, "email": data.email, "phone": data.phone,
        "role": n.get("role"), "user_type": n.get("user_type"),
        "user_type_id": ut_id, "role_id": r_id,
        "is_active": data.is_active,
        "store_assignments": store_access.get(user_id, []) if user_id else [],
    }
    if temp_password:
        result["temp_password"] = temp_password
    return result


# ---------------------------------------------------------------------------
# Create Store Staff
# ---------------------------------------------------------------------------

@router.post("/admin/stores/{store_id}/staff")
async def create_staff(
    store_id: int, data: StaffCreate, request: Request,
    db: AsyncSession = Depends(get_db), user: User = Depends(require_hq_access()),
):
    temp_password = None
    user_id = None

    ut_id = data.user_type_id or UserTypeIDs.STORE
    r_id = data.role_id or RoleIDs.STAFF

    if data.email:
        existing = await db.execute(select(User).where(User.email == data.email))
        if existing.scalar_one_or_none():
            raise HTTPException(400, detail=f"User with email '{data.email}' already exists")
        temp_password = ''.join(secrets.choice(string.ascii_letters + string.digits) for _ in range(8))
        new_user = User(
            email=data.email, name=data.name, phone=data.phone,
            password_hash=hash_password(temp_password),
            user_type_id=ut_id, role_id=r_id, is_active=True,
        )
        db.add(new_user)
        await db.flush()
        user_id = new_user.id

    # Create staff record at the URL-param store
    try:
        staff_role = StaffRole.barista
    except Exception:
        staff_role = StaffRole.barista
    obj = Staff(store_id=store_id, user_id=user_id, name=data.name, email=data.email,
                phone=data.phone, role=staff_role, is_active=data.is_active, pin_code=data.pin_code)
    db.add(obj)

    # Sync store assignments (URL store + any extras)
    if user_id:
        store_ids = [store_id] + [s for s in (data.store_ids or []) if s != store_id]
        await _sync_store_access(db, user_id, store_ids, user.id)


    names = await _resolve_role_names(db, [user_id] if user_id else [])
    store_access = await _get_store_access_for_users(db, [user_id] if user_id else [])
    store_name_map = await _get_store_name_map(db)
    n = names.get(user_id, {})

    result = {
        "id": obj.id, "store_id": store_id, "user_id": user_id,
        "name": data.name, "email": data.email, "phone": data.phone,
        "role": "Staff", "user_type": n.get("user_type"),
        "user_type_id": ut_id, "role_id": r_id,
        "is_active": data.is_active, "store_name": store_name_map.get(store_id),
        "store_assignments": store_access.get(user_id, []) if user_id else [],
    }
    if temp_password:
        result["temp_password"] = temp_password
    return result


# ---------------------------------------------------------------------------
# Update Staff
# ---------------------------------------------------------------------------

@router.put("/admin/staff/{staff_id}")
async def update_staff(
    staff_id: int, data: StaffUpdate, request: Request = None,
    db: AsyncSession = Depends(get_db), actor: User = Depends(require_hq_access()),
):
    result = await db.execute(select(Staff).where(Staff.id == staff_id))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(404)

    # Get linked user
    target_user = None
    if obj.user_id:
        uresult = await db.execute(select(User).where(User.id == obj.user_id))
        target_user = uresult.scalar_one_or_none()

    # Permission check
    if (data.user_type_id or data.role_id) and target_user:
        if not _can_modify_target(actor, target_user):
            raise HTTPException(403, detail="You do not have permission to modify this user's type or role")

    # Update staff fields
    changes = data.model_dump(exclude_unset=True)
    for skip in ('user_type_id', 'role_id', 'store_ids'):
        changes.pop(skip, None)
    for key, value in changes.items():
        setattr(obj, key, value)

    # Update user's type/role
    if target_user:
        if data.user_type_id is not None:
            target_user.user_type_id = data.user_type_id
        if data.role_id is not None:
            target_user.role_id = data.role_id

    # Sync store assignments
    if data.store_ids is not None and obj.user_id:
        await _sync_store_access(db, obj.user_id, data.store_ids, actor.id)


    # Build response
    names = await _resolve_role_names(db, [obj.user_id] if obj.user_id else [])
    store_access = await _get_store_access_for_users(db, [obj.user_id] if obj.user_id else [])
    store_name_map = await _get_store_name_map(db)
    n = names.get(obj.user_id, {}) if obj.user_id else {}

    return {
        "id": obj.id, "store_id": obj.store_id, "user_id": obj.user_id,
        "name": obj.name, "email": obj.email, "phone": obj.phone,
        "role": obj.role.value if hasattr(obj.role, 'value') else str(obj.role),
        "user_type": n.get("user_type"), "user_role": n.get("role"),
        "user_type_id": target_user.user_type_id if target_user else None,
        "role_id": target_user.role_id if target_user else None,
        "is_active": obj.is_active,
        "created_at": obj.created_at.isoformat() if obj.created_at else None,
        "store_name": store_name_map.get(obj.store_id),
        "store_assignments": store_access.get(obj.user_id, []) if obj.user_id else [],
    }


# ---------------------------------------------------------------------------
# Deactivate / Delete
# ---------------------------------------------------------------------------

@router.delete("/admin/staff/{staff_id}")
async def deactivate_staff(staff_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(require_hq_access())):
    result = await db.execute(select(Staff).where(Staff.id == staff_id))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(404)
    obj.is_active = False
    return {"detail": "Staff deactivated"}


# ---------------------------------------------------------------------------
# Clock In / Out
# ---------------------------------------------------------------------------

@router.post("/admin/staff/{staff_id}/clock-in")
async def clock_in(staff_id: int, data: ClockInRequest, db: AsyncSession = Depends(get_db)):
    await _check_pin_rate_limit(staff_id, db)
    result = await db.execute(select(Staff).where(Staff.id == staff_id))
    staff = result.scalar_one_or_none()
    if not staff:
        raise HTTPException(404)
    if staff.pin_code != data.pin_code:
        db.add(PinAttempt(staff_id=staff_id))
        await db.flush()
        raise HTTPException(400, detail="Invalid PIN")
    shift = StaffShift(staff_id=staff_id, store_id=staff.store_id, clock_in=datetime.now(timezone.utc))
    db.add(shift)
    return {"detail": "Clocked in", "shift_id": shift.id}


@router.post("/admin/staff/{staff_id}/clock-out")
async def clock_out(
    staff_id: int, 
    user: User = Depends(require_store_access()),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(StaffShift).where(StaffShift.staff_id == staff_id, StaffShift.clock_out.is_(None))
        .order_by(desc(StaffShift.clock_in)).limit(1)
    )
    shift = result.scalar_one_or_none()
    if not shift:
        raise HTTPException(404, detail="No active shift found")
    shift.clock_out = datetime.now(timezone.utc)
    return {"detail": "Clocked out", "shift_id": shift.id}


@router.get("/admin/stores/{store_id}/shifts", response_model=list[StaffShiftOut])
async def list_shifts(store_id: int, db: AsyncSession = Depends(get_db),
                      user: User = Depends(require_store_access())):
    result = await db.execute(
        select(StaffShift).join(Staff).where(Staff.store_id == store_id)
        .order_by(desc(StaffShift.clock_in)).limit(100)
    )
    return result.scalars().all()


# ---------------------------------------------------------------------------
# Password Management
# ---------------------------------------------------------------------------

@router.post("/admin/staff/{staff_id}/reset-password")
async def reset_staff_password(
    staff_id: int, request: Request,
    db: AsyncSession = Depends(get_db), admin: User = Depends(require_hq_access()),
):
    result = await db.execute(select(Staff).where(Staff.id == staff_id))
    staff = result.scalar_one_or_none()
    if not staff:
        raise HTTPException(404, "Staff not found")
    if not staff.email:
        raise HTTPException(400, "Staff has no email — add an email first")

    if not staff.user_id:
        existing = await db.execute(select(User).where(User.email == staff.email))
        if existing.scalar_one_or_none():
            raise HTTPException(400, f"User with email '{staff.email}' exists but not linked")
        temp_password = ''.join(secrets.choice(string.ascii_letters + string.digits) for _ in range(8))
        new_user = User(
            email=staff.email, name=staff.name, phone=staff.phone,
            password_hash=hash_password(temp_password),
            user_type_id=UserTypeIDs.STORE, role_id=RoleIDs.STAFF, is_active=True,
        )
        db.add(new_user)
        await db.flush()
        staff.user_id = new_user.id
        return {"temp_password": temp_password, "email": staff.email, "auto_created": True}

    uresult = await db.execute(select(User).where(User.id == staff.user_id))
    linked_user = uresult.scalar_one_or_none()
    if not linked_user:
        raise HTTPException(404, "Linked user not found")

    temp_password = ''.join(secrets.choice(string.ascii_letters + string.digits) for _ in range(8))
    linked_user.password_hash = hash_password(temp_password)
    return {"temp_password": temp_password, "email": staff.email}


@router.post("/auth/change-password")
async def change_own_password(request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    body = await request.json()
    current_password = body.get("current_password")
    new_password = body.get("new_password")
    if not current_password or not new_password:
        raise HTTPException(400, "current_password and new_password required")
    if len(new_password) < 6:
        raise HTTPException(400, "New password must be at least 6 characters")
    if not user.password_hash or not verify_password(current_password, user.password_hash):
        raise HTTPException(400, "Current password is incorrect")
    user.password_hash = hash_password(new_password)
    return {"detail": "Password changed successfully"}
