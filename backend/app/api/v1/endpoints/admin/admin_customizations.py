from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import require_hq_access
from app.core.audit import log_action, get_client_ip
from app.core.utils import to_float
from app.models.admin_user import AdminUser
from app.models.menu import MenuItem
from app.models.marketing import CustomizationOption
from app.schemas.menu import CustomizationCreate, CustomizationUpdate

router = APIRouter(prefix="/admin", tags=["Admin"])


@router.get("/items/{item_id}/customizations")
async def list_customization_options(
    item_id: int,
    user: AdminUser = Depends(require_hq_access()),
    db: AsyncSession = Depends(get_db),
):
    """List customization options for a menu item."""
    result = await db.execute(
        select(CustomizationOption).where(
            CustomizationOption.menu_item_id == item_id,
            CustomizationOption.is_active == True,
        ).order_by(CustomizationOption.display_order)
    )
    return result.scalars().all()


@router.post("/items/{item_id}/customizations", status_code=201)
async def create_customization_option(
    item_id: int,
    request: Request,
    req: CustomizationCreate,
    user: AdminUser = Depends(require_hq_access()),
    db: AsyncSession = Depends(get_db),
):
    """Add a customization option to a menu item."""
    result = await db.execute(select(MenuItem).where(MenuItem.id == item_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Menu item not found")
    opt = CustomizationOption(
        menu_item_id=item_id,
        name=req.name,
        price_adjustment=req.price_adjustment,
        display_order=req.display_order,
    )
    db.add(opt)
    await db.flush()
    ip = get_client_ip(request)
    await log_action(db, action="CREATE_CUSTOMIZATION", user_id=user.id, entity_type="customization_option", entity_id=opt.id, details={"name": opt.name, "item_id": item_id}, ip_address=ip)
    return {"id": opt.id, "name": opt.name, "price_adjustment": to_float(opt.price_adjustment)}


@router.put("/customizations/{option_id}")
async def update_customization_option(
    option_id: int,
    request: Request,
    req: CustomizationUpdate,
    user: AdminUser = Depends(require_hq_access()),
    db: AsyncSession = Depends(get_db),
):
    """Update a customization option."""
    result = await db.execute(select(CustomizationOption).where(CustomizationOption.id == option_id))
    opt = result.scalar_one_or_none()
    if not opt:
        raise HTTPException(status_code=404, detail="Option not found")
    for k, v in req.model_dump(exclude_none=True).items():
        if hasattr(opt, k):
            setattr(opt, k, v)
    ip = get_client_ip(request)
    await log_action(db, action="UPDATE_CUSTOMIZATION", user_id=user.id, entity_type="customization_option", entity_id=option_id, ip_address=ip)
    return {"message": "Option updated"}


@router.delete("/customizations/{option_id}")
async def delete_customization_option(
    option_id: int,
    request: Request,
    user: AdminUser = Depends(require_hq_access()),
    db: AsyncSession = Depends(get_db),
):
    """Soft-delete a customization option."""
    result = await db.execute(select(CustomizationOption).where(CustomizationOption.id == option_id))
    opt = result.scalar_one_or_none()
    if not opt:
        raise HTTPException(status_code=404, detail="Option not found")
    opt.is_active = False
    ip = get_client_ip(request)
    await log_action(db, action="DELETE_CUSTOMIZATION", user_id=user.id, entity_type="customization_option", entity_id=option_id, details={"name": opt.name}, ip_address=ip)
    return {"message": "Option deactivated"}
