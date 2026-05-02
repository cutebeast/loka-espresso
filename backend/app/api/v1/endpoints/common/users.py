import os
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import get_current_user
from app.core.config import get_settings
from app.models.acl import UserType as ACLUserType, Role
from app.schemas.user import UserOut, UserUpdate, AddressCreate, AddressUpdate, AddressOut

router = APIRouter(prefix="/users", tags=["Users"])


def _user_to_out(user, ut_name: str = None, role_name: str = None) -> dict:
    """Build UserOut dict with resolved names. Works for both AdminUser and Customer."""
    return {
        "id": user.id,
        "phone": getattr(user, 'phone', None),
        "name": user.name,
        "email": getattr(user, 'email', None),
        "user_type_id": getattr(user, 'user_type_id', 4),
        "role_id": getattr(user, 'role_id', 6),
        "user_type": ut_name,
        "role": role_name,
        "avatar_url": getattr(user, 'avatar_url', None),
        "referral_code": getattr(user, 'referral_code', None),
        "date_of_birth": getattr(user, 'date_of_birth', None),
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }


@router.get("/me", response_model=UserOut)
async def get_me(user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    ut_name = None
    role_name = None
    if hasattr(user, 'user_type_id'):
        ut_result = await db.execute(select(ACLUserType).where(ACLUserType.id == user.user_type_id))
        ut = ut_result.scalar_one_or_none()
        ut_name = ut.name if ut else None
    if hasattr(user, 'role_id'):
        role_result = await db.execute(select(Role).where(Role.id == user.role_id))
        role = role_result.scalar_one_or_none()
        role_name = role.name if role else None
    return _user_to_out(user, ut_name, role_name)


@router.put("/me", response_model=UserOut)
async def update_me(req: UserUpdate, user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if req.name is not None:
        user.name = req.name
    if req.phone is not None and hasattr(user, 'phone'):
        user.phone = req.phone
    if req.email is not None and hasattr(user, 'email'):
        # Check uniqueness within the same table
        model = type(user)
        existing = await db.execute(select(model).where(model.email == req.email, model.id != user.id))
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Email already in use")
        user.email = req.email
    await db.flush()
    ut_name = None
    role_name = None
    if hasattr(user, 'user_type_id'):
        ut_result = await db.execute(select(ACLUserType).where(ACLUserType.id == user.user_type_id))
        ut = ut_result.scalar_one_or_none()
        ut_name = ut.name if ut else None
    if hasattr(user, 'role_id'):
        role_result = await db.execute(select(Role).where(Role.id == user.role_id))
        role = role_result.scalar_one_or_none()
        role_name = role.name if role else None
    return _user_to_out(user, ut_name, role_name)


@router.put("/me/avatar", response_model=UserOut)
async def upload_avatar(file: UploadFile = File(...), user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from app.api.v1.endpoints.common.upload import ALLOWED_MIME_TYPES, MAX_FILE_SIZE, _validate_magic_bytes
    settings = get_settings()
    if not file.content_type or file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG, WebP, GIF images allowed")
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail=f"File too large. Maximum size is {MAX_FILE_SIZE // (1024*1024)}MB")
    if not _validate_magic_bytes(content, file.content_type):
        raise HTTPException(status_code=400, detail="File content does not match declared image type")
    ext = os.path.splitext(file.filename or "image.jpg")[1]
    filename = f"{user.id}{ext}"
    path = os.path.join(settings.UPLOAD_DIR, "avatars", filename)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(content)
    if hasattr(user, 'avatar_url'):
        user.avatar_url = f"/uploads/avatars/{filename}"
    await db.flush()
    return user


@router.get("/me/addresses", response_model=list[AddressOut])
async def list_addresses(user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    # Addresses are customer-only — use explicit query to avoid lazy-load in async
    if not hasattr(user, 'id'):
        return []
    from app.models.customer import CustomerAddress
    from sqlalchemy.orm import selectinload
    result = await db.execute(
        select(CustomerAddress).where(CustomerAddress.customer_id == user.id)
    )
    return result.scalars().all()


@router.post("/me/addresses", response_model=AddressOut, status_code=201)
async def add_address(req: AddressCreate, user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from app.models.customer import CustomerAddress
    addr = CustomerAddress(customer_id=user.id, **req.model_dump())
    db.add(addr)
    await db.flush()
    return addr


@router.put("/me/addresses/{address_id}", response_model=AddressOut)
async def update_address(address_id: int, req: AddressUpdate, user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from app.models.customer import CustomerAddress
    result = await db.execute(select(CustomerAddress).where(CustomerAddress.id == address_id, CustomerAddress.customer_id == user.id))
    addr = result.scalar_one_or_none()
    if not addr:
        raise HTTPException(status_code=404, detail="Address not found")
    for k, v in req.model_dump(exclude_unset=True).items():
        setattr(addr, k, v)
    await db.flush()
    return addr


@router.delete("/me/addresses/{address_id}")
async def delete_address(address_id: int, user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from app.models.customer import CustomerAddress
    result = await db.execute(select(CustomerAddress).where(CustomerAddress.id == address_id, CustomerAddress.customer_id == user.id))
    addr = result.scalar_one_or_none()
    if not addr:
        raise HTTPException(status_code=404, detail="Address not found")
    await db.delete(addr)
    await db.flush()
    return {"message": "Address deleted"}


@router.delete("/me")
async def delete_me(user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Self-account deletion. Deactivates the account (soft-delete)."""
    user.is_active = False
    await db.flush()
    return {"message": "Account deactivated"}
