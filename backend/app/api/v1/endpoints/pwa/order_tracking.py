"""
Order tracking endpoint for customers and staff.

GET /orders/{id}/track

Returns detailed order status with:
- Current status and timeline
- Estimated ready time
- Delivery info (for delivery orders)
- Courier info (for out_for_delivery orders)
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional, List

from app.core.database import get_db
from app.core.security import get_current_user, is_global_admin, can_access_store
from app.models.customer import Customer
from app.models.order import Order, OrderStatusHistory, OrderStatus, OrderType
from app.core.utils import to_float

router = APIRouter(prefix="/order-tracking", tags=["Order Tracking"])


class OrderTrackResponse(BaseModel):
    """Extended order info for tracking."""
    id: int
    user_id: int
    store_id: int
    table_id: Optional[int] = None
    order_number: str
    order_type: OrderType
    items: list[dict]
    subtotal: float
    delivery_fee: float = 0
    discount: float = 0
    voucher_discount: float = 0.0
    reward_discount: float = 0.0
    voucher_code: Optional[str] = None
    reward_redemption_code: Optional[str] = None
    total: float
    status: OrderStatus
    pickup_time: Optional[str] = None
    delivery_address: Optional[dict] = None
    payment_method: Optional[str] = None
    payment_status: Optional[str] = None
    loyalty_points_earned: int = 0
    notes: Optional[str] = None
    delivery_provider: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    status_timeline: list[dict] = []
    estimated_ready: Optional[str] = None
    courier_name: Optional[str] = None
    courier_phone: Optional[str] = None
    delivery_eta: Optional[str] = None

    class Config:
        from_attributes = True


@router.get("/{order_id}/track", response_model=OrderTrackResponse)
async def track_order(
    order_id: int,
    user: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get detailed order tracking information.
    
    Returns:
    - Order details with full status timeline
    - Estimated ready time (calculated from store open hours)
    - For delivery: courier info and ETA
    - Status history with timestamps
    """
    # Get order
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Check access
    if order.user_id != user.id and not is_global_admin(user) and not await can_access_store(user, order.store_id, db):
        raise HTTPException(status_code=403, detail="Forbidden")
    
    # Get status history
    hist_result = await db.execute(
        select(OrderStatusHistory)
        .where(OrderStatusHistory.order_id == order_id)
        .order_by(OrderStatusHistory.created_at)
    )
    timeline = [
        {
            "status": h.status.value if hasattr(h.status, 'value') else str(h.status),
            "note": h.note,
            "created_at": h.created_at.isoformat() if h.created_at else None,
        }
        for h in hist_result.scalars().all()
    ]
    
    # Calculate estimated ready time
    estimated_ready = None
    if order.status in (OrderStatus.confirmed, OrderStatus.preparing):
        item_count = len(order.items) if isinstance(order.items, list) else 0
        base_time = max(item_count * 5, 10)
        estimated_ready = f"~{base_time} minutes"
    
    # Build response
    return OrderTrackResponse(
        id=order.id,
        user_id=order.user_id,
        store_id=order.store_id,
        table_id=order.table_id,
        order_number=order.order_number,
        order_type=order.order_type,
        items=order.items or [],
        subtotal=to_float(order.subtotal),
        delivery_fee=to_float(order.delivery_fee),
        discount=to_float(order.discount),
        voucher_discount=to_float(order.voucher_discount),
        reward_discount=to_float(order.reward_discount),
        voucher_code=order.voucher_code,
        reward_redemption_code=order.reward_redemption_code,
        total=to_float(order.total),
        status=order.status,
        pickup_time=order.pickup_time.isoformat() if order.pickup_time else None,
        delivery_address=order.delivery_address,
        payment_method=order.payment_method,
        payment_status=order.payment_status,
        loyalty_points_earned=order.loyalty_points_earned or 0,
        notes=order.notes,
        delivery_provider=order.delivery_provider,
        created_at=order.created_at.isoformat() if order.created_at else None,
        updated_at=order.updated_at.isoformat() if order.updated_at else None,
        status_timeline=timeline,
        estimated_ready=estimated_ready,
        courier_name=order.delivery_provider if order.status == OrderStatus.out_for_delivery else None,
        courier_phone=None,
        delivery_eta=estimated_ready if order.order_type == OrderType.delivery and order.status == OrderStatus.out_for_delivery else None,
    )
