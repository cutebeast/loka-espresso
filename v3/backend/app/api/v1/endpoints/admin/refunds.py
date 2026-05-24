"""Admin refunds endpoint."""

from fastapi import APIRouter, Query
from sqlalchemy import func, select
from sqlalchemy.orm import joinedload

from app.api.v1.deps import CurrentAdmin, DBDependency
from app.models.order import Order
from app.models.payment import Refund
from app.schemas.base import APIResponse, PaginatedResponse

router = APIRouter(prefix="/admin/refunds", tags=["admin — refunds"])


@router.get("", response_model=APIResponse[PaginatedResponse[dict]])
async def list_refunds(
    db: DBDependency,
    admin: CurrentAdmin,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=500),
    store_id: int | None = Query(None),
):
    base = select(Refund).options(joinedload(Refund.order))
    cnt = select(func.count(Refund.id))
    if store_id is not None:
        base = base.join(Order).where(Order.store_id == store_id)
        cnt = cnt.join(Order).where(Order.store_id == store_id)
    total = (await db.execute(cnt)).scalar() or 0
    result = await db.execute(
        base.order_by(Refund.id.desc()).offset((page - 1) * per_page).limit(per_page)
    )
    refunds = result.unique().scalars().all()
    items = [
        {
            "id": r.id,
            "payment_id": r.payment_id,
            "order_id": r.order_id,
            "order_number": r.order.order_number if r.order else None,
            "store_id": r.order.store_id if r.order else None,
            "amount": float(r.amount or 0),
            "reason": r.reason or "",
            "status": r.status or "pending",
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in refunds
    ]
    return APIResponse(data=PaginatedResponse(items=items, total=total, page=page, per_page=per_page, total_pages=(total + per_page - 1) // per_page if per_page else 0))
