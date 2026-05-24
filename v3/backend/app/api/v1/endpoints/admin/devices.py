"""Customer device endpoints (admin read-only + customer self-service)."""

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from app.api.v1.deps import ActiveCustomer, CurrentAdmin, DBDependency
from app.models.customer import CustomerDevice
from app.schemas.base import APIResponse, PaginatedResponse
from app.schemas.customer import CustomerDeviceOut

# ---------------------------------------------------------------------------
# Admin router
# ---------------------------------------------------------------------------

admin_router = APIRouter(prefix="/admin/customers", tags=["admin — customers"])


@admin_router.get("/devices", response_model=APIResponse[PaginatedResponse[CustomerDeviceOut]])
async def list_devices(
    db: DBDependency,
    admin: CurrentAdmin,
    customer_id: int | None = Query(None),
    device_type: str | None = Query(None),
    is_active: bool | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=500),
):
    """List customer devices with filters."""
    base_stmt = select(CustomerDevice)
    count_stmt = select(func.count(CustomerDevice.id))

    if customer_id is not None:
        base_stmt = base_stmt.where(CustomerDevice.customer_id == customer_id)
        count_stmt = count_stmt.where(CustomerDevice.customer_id == customer_id)
    if device_type is not None:
        base_stmt = base_stmt.where(CustomerDevice.platform == device_type)
        count_stmt = count_stmt.where(CustomerDevice.platform == device_type)
    if is_active is not None:
        base_stmt = base_stmt.where(CustomerDevice.is_active.is_(is_active))
        count_stmt = count_stmt.where(CustomerDevice.is_active.is_(is_active))

    total_result = await db.execute(count_stmt)
    total = total_result.scalar() or 0

    stmt = (
        base_stmt.order_by(CustomerDevice.last_seen_at.desc().nulls_last())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    result = await db.execute(stmt)
    items = [CustomerDeviceOut.model_validate(r) for r in result.scalars().all()]

    return APIResponse(
        data=PaginatedResponse(
            items=items,
            total=total,
            page=page,
            per_page=per_page,
            total_pages=(total + per_page - 1) // per_page,
        )
    )


# ---------------------------------------------------------------------------
# Customer self-service router
# ---------------------------------------------------------------------------

public_router = APIRouter(prefix="/me", tags=["customer"])


class DeviceRegister(BaseModel):
    device_fingerprint: str = Field(..., max_length=64)
    push_token: str | None = Field(None, max_length=255)
    platform: str = Field(..., max_length=20)
    app_version: str | None = Field(None, max_length=20)
    os_version: str | None = Field(None, max_length=20)
    device_model: str | None = Field(None, max_length=50)


@public_router.post("/devices", response_model=APIResponse[CustomerDeviceOut])
async def register_device(
    customer: ActiveCustomer,
    db: DBDependency,
    data: DeviceRegister,
):
    """Register or update a customer device."""
    # Check for existing device by fingerprint
    result = await db.execute(
        select(CustomerDevice).where(
            CustomerDevice.device_fingerprint == data.device_fingerprint,
            CustomerDevice.customer_id == customer.id,
        )
    )
    existing = result.scalar_one_or_none()

    now = datetime.now(timezone.utc)

    if existing is not None:
        existing.push_token = data.push_token
        existing.platform = data.platform
        existing.app_version = data.app_version
        existing.os_version = data.os_version
        existing.device_model = data.device_model
        existing.is_active = True
        existing.last_seen_at = now
        existing.updated_at = now
        await db.commit()
        await db.refresh(existing)
        return APIResponse(data=CustomerDeviceOut.model_validate(existing))

    device = CustomerDevice(
        customer_id=customer.id,
        device_fingerprint=data.device_fingerprint,
        push_token=data.push_token,
        platform=data.platform,
        app_version=data.app_version,
        os_version=data.os_version,
        device_model=data.device_model,
        is_active=True,
        last_seen_at=now,
    )
    db.add(device)
    await db.commit()
    await db.refresh(device)
    return APIResponse(data=CustomerDeviceOut.model_validate(device))


@public_router.delete("/devices/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def deregister_device(
    customer: ActiveCustomer,
    db: DBDependency,
    id: int,
):
    """Deregister (soft-delete) a customer device."""
    result = await db.execute(
        select(CustomerDevice).where(
            CustomerDevice.id == id,
            CustomerDevice.customer_id == customer.id,
        )
    )
    device = result.scalar_one_or_none()
    if device is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found")

    device.is_active = False
    device.deleted_at = datetime.now(timezone.utc)
    device.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return None
