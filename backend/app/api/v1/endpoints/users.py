import os
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import get_current_user
from app.core.config import get_settings
from app.models.user import User, UserAddress
from app.schemas.user import UserOut, UserUpdate, AddressCreate, AddressUpdate, AddressOut

router = APIRouter(prefix="/users", tags=["Users"])


@router.get("/me", response_model=UserOut)
async def get_me(user: User = Depends(get_current_user)):
    return user


@router.put("/me", response_model=UserOut)
async def update_me(req: UserUpdate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if req.name is not None:
        user.name = req.name
    if req.email is not None:
        existing = await db.execute(select(User).where(User.email == req.email, User.id != user.id))
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Email already in use")
        user.email = req.email
    await db.flush()
    return user


@router.put("/me/avatar", response_model=UserOut)
async def upload_avatar(file: UploadFile = File(...), user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    settings = get_settings()
    ext = os.path.splitext(file.filename or "image.jpg")[1]
    filename = f"{user.id}{ext}"
    path = os.path.join(settings.UPLOAD_DIR, "avatars", filename)
    content = await file.read()
    with open(path, "wb") as f:
        f.write(content)
    user.avatar_url = f"/uploads/avatars/{filename}"
    await db.flush()
    return user


@router.get("/me/addresses", response_model=list[AddressOut])
async def list_addresses(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(UserAddress).where(UserAddress.user_id == user.id))
    return result.scalars().all()


@router.post("/me/addresses", response_model=AddressOut, status_code=201)
async def add_address(req: AddressCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    addr = UserAddress(user_id=user.id, **req.model_dump())
    db.add(addr)
    await db.flush()
    return addr


@router.put("/me/addresses/{address_id}", response_model=AddressOut)
async def update_address(address_id: int, req: AddressUpdate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(UserAddress).where(UserAddress.id == address_id, UserAddress.user_id == user.id))
    addr = result.scalar_one_or_none()
    if not addr:
        raise HTTPException(status_code=404, detail="Address not found")
    for k, v in req.model_dump(exclude_unset=True).items():
        setattr(addr, k, v)
    await db.flush()
    return addr


@router.delete("/me/addresses/{address_id}")
async def delete_address(address_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(UserAddress).where(UserAddress.id == address_id, UserAddress.user_id == user.id))
    addr = result.scalar_one_or_none()
    if not addr:
        raise HTTPException(status_code=404, detail="Address not found")
    await db.delete(addr)
    await db.flush()
    return {"message": "Address deleted"}
