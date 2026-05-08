"""Customer profile endpoints."""

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.api.v1.deps import ActiveCustomer, DBDependency
from app.models.customer import Customer, CustomerAddress, CustomerDevice
from app.schemas.base import APIResponse
from app.schemas.customer import (
    CustomerAddressCreate,
    CustomerAddressOut,
    CustomerAddressUpdate,
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
