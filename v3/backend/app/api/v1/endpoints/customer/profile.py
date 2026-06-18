"""Customer profile endpoints."""

from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile, status
from sqlalchemy import select

from app.api.v1.deps import ActiveCustomer, DBDependency
from app.core.config import get_settings
from app.models.customer import Customer, CustomerAddress, CustomerDevice
from app.schemas.base import APIResponse
from app.schemas.customer import (
    CustomerAddressCreate,
    CustomerAddressOut,
    CustomerAddressUpdate,
    CustomerDeviceOut,
    CustomerMeOut,
    CustomerProfileOut,
    CustomerProfileUpdate,
)

router = APIRouter(prefix="/me", tags=["customer"])


@router.get("", response_model=APIResponse[CustomerMeOut])
async def get_me(customer: ActiveCustomer, db: DBDependency):
    """Get current customer profile with addresses and devices."""
    # Fetch addresses
    addr_result = await db.execute(
        select(CustomerAddress).where(
            CustomerAddress.customer_id == customer.id,
            CustomerAddress.deleted_at.is_(None),
        )
    )
    addresses = [CustomerAddressOut.model_validate(a) for a in addr_result.scalars().all()]
    default_address = next((a for a in addresses if a.is_default), None)
    
    # Fetch devices
    dev_result = await db.execute(
        select(CustomerDevice).where(CustomerDevice.customer_id == customer.id)
    )
    devices = [CustomerDeviceOut.model_validate(d) for d in dev_result.scalars().all()]
    
    return APIResponse(
        data=CustomerMeOut(
            profile=CustomerProfileOut.model_validate(customer),
            addresses=addresses,
            default_address=default_address,
            devices=devices,
            consents=[],
            referral_code=customer.referral_code,
        )
    )


@router.patch("", response_model=APIResponse[CustomerProfileOut])
async def update_me(
    customer: ActiveCustomer,
    db: DBDependency,
    data: CustomerProfileUpdate,
):
    """Update current customer profile."""
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(customer, field, value)
    
    await db.commit()
    await db.refresh(customer)
    return APIResponse(data=CustomerProfileOut.model_validate(customer))


# PUT alias for PWA compatibility (frontend uses PUT)
@router.put("", response_model=APIResponse[CustomerProfileOut])
async def update_me_put(
    customer: ActiveCustomer,
    db: DBDependency,
    data: CustomerProfileUpdate,
):
    """Update current customer profile (PUT alias)."""
    return await update_me(customer, db, data)


@router.put("/avatar", response_model=APIResponse[CustomerProfileOut])
async def update_avatar(
    customer: ActiveCustomer,
    db: DBDependency,
    file: UploadFile,
):
    """Upload customer avatar image."""
    settings = get_settings()

    # Validate file type
    content_type = file.content_type or ""
    if not content_type.startswith("image/"):
        raise HTTPException(400, detail="File must be an image")

    # Validate file size
    contents = await file.read()
    max_bytes = settings.max_upload_size_bytes
    if len(contents) > max_bytes:
        raise HTTPException(400, detail=f"File too large (max {settings.max_upload_size_mb} MB)")

    # Save file to shared uploads directory (served by Caddy)
    # Save file using phone number (unique per customer) for stable avatar URL
    phone_slug = (customer.phone_number or f"user_{customer.id}").replace("+", "").replace(" ", "")
    ext = Path(file.filename or "avatar").suffix or ".png"
    filename = f"avatar_{phone_slug}{ext}"
    upload_dir = settings.upload_dir / "avatars"
    upload_dir.mkdir(parents=True, exist_ok=True)
    filepath = upload_dir / filename
    filepath.write_bytes(contents)

    # Update customer
    customer.avatar_url = f"/uploads/avatars/{filename}"
    await db.commit()
    await db.refresh(customer)
    return APIResponse(data=CustomerProfileOut.model_validate(customer))


# Address routes
@router.get("/addresses", response_model=APIResponse[list[CustomerAddressOut]])
async def list_addresses(customer: ActiveCustomer, db: DBDependency):
    result = await db.execute(
        select(CustomerAddress).where(
            CustomerAddress.customer_id == customer.id,
            CustomerAddress.deleted_at.is_(None),
        )
    )
    addresses = [CustomerAddressOut.model_validate(a) for a in result.scalars().all()]
    return APIResponse(data=addresses)


@router.post("/addresses", response_model=APIResponse[CustomerAddressOut], status_code=status.HTTP_201_CREATED)
async def create_address(
    customer: ActiveCustomer,
    db: DBDependency,
    data: CustomerAddressCreate,
):
    # If setting as default, unset others
    if data.is_default:
        await db.execute(
            select(CustomerAddress)
            .where(CustomerAddress.customer_id == customer.id)
            .where(CustomerAddress.is_default.is_(True))
        )
        existing_defaults = await db.execute(
            select(CustomerAddress).where(
                CustomerAddress.customer_id == customer.id,
                CustomerAddress.is_default.is_(True),
            )
        )
        for addr in existing_defaults.scalars().all():
            addr.is_default = False
    
    address = CustomerAddress(customer_id=customer.id, **data.model_dump())
    db.add(address)
    await db.commit()
    await db.refresh(address)
    return APIResponse(data=CustomerAddressOut.model_validate(address))


@router.patch("/addresses/{address_id}", response_model=APIResponse[CustomerAddressOut])
async def update_address(
    customer: ActiveCustomer,
    db: DBDependency,
    address_id: int,
    data: CustomerAddressUpdate,
):
    result = await db.execute(
        select(CustomerAddress).where(
            CustomerAddress.id == address_id,
            CustomerAddress.customer_id == customer.id,
            CustomerAddress.deleted_at.is_(None),
        )
    )
    address = result.scalar_one_or_none()
    if address is None:
        raise HTTPException(status_code=404, detail="Address not found")
    
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(address, field, value)
    
    await db.commit()
    await db.refresh(address)
    return APIResponse(data=CustomerAddressOut.model_validate(address))


# PUT alias for PWA compatibility
@router.put("/addresses/{address_id}", response_model=APIResponse[CustomerAddressOut])
async def update_address_put(
    customer: ActiveCustomer,
    db: DBDependency,
    address_id: int,
    data: CustomerAddressUpdate,
):
    """Update address (PUT alias)."""
    return await update_address(customer, db, address_id, data)


@router.delete("/addresses/{address_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_address(customer: ActiveCustomer, db: DBDependency, address_id: int):
    result = await db.execute(
        select(CustomerAddress).where(
            CustomerAddress.id == address_id,
            CustomerAddress.customer_id == customer.id,
            CustomerAddress.deleted_at.is_(None),
        )
    )
    address = result.scalar_one_or_none()
    if address is None:
        raise HTTPException(status_code=404, detail="Address not found")
    
    from datetime import datetime, timezone
    address.deleted_at = datetime.now(timezone.utc)
    await db.commit()
    return None
