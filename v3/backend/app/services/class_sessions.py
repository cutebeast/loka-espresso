"""Class session seat management — shared by customer orders and POS.

Single source of truth for the seat-consumption rules (active session, item
match, not past, capacity) so the PWA checkout and the staff POS can't drift.
Seat RELEASE on cancellation lives in services/order.reverse_order_effects
(shared by customer + staff cancel paths).
"""

from datetime import datetime, timezone

from sqlalchemy import select


class ClassSessionError(Exception):
    """Seat consumption failed; message is customer-facing."""

    def __init__(self, detail: str, status_code: int = 400):
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


async def consume_session_seats(
    db,
    *,
    menu_item_id: int,
    class_session_id: int,
    quantity: int,
):
    """Lock the session row and consume `quantity` seats.

    Raises ClassSessionError when the session is unavailable, mismatched,
    past, or full. Caller wraps the error into its own exception type
    (OrderError / HTTPException).
    """
    from app.models.class_session import ClassSession

    result = await db.execute(
        select(ClassSession)
        .where(ClassSession.id == class_session_id)
        .with_for_update()
    )
    sess = result.scalar_one_or_none()
    if sess is None or not sess.is_active:
        raise ClassSessionError("The selected class session is no longer available")
    if sess.menu_item_id != menu_item_id:
        raise ClassSessionError("The selected class session does not match this class")
    if sess.session_date < datetime.now(timezone.utc).date():
        raise ClassSessionError("The selected class session has already passed")
    if sess.booked_pax + quantity > sess.capacity:
        remaining = sess.capacity - sess.booked_pax
        raise ClassSessionError(
            f"Not enough seats left in this session ({remaining} of {sess.capacity} remaining)"
        )
    sess.booked_pax += quantity
    return sess
