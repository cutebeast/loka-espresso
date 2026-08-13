"""Live POS cash-session (Z-report) computation.

A drawer session (``PosSession``) covers the window [opened_at, until]. All
figures are computed LIVE from payments/refunds on the store's orders in that
window — the denormalized totals on the session row are only a snapshot taken
at close time.
"""
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import func, select

from app.models.order import Order
from app.models.payment import Payment, Refund
from app.models.pos import PosSession

# Provider values written by the staff POS payment endpoint
# (cash → cash, card/stripe_qr → stripe, qr/e_wallet → grabpay).
PROVIDER_BUCKETS = {"cash": "cash", "stripe": "card", "grabpay": "qr"}


async def compute_session_report(
    db,
    session: PosSession,
    store_id: int,
    until: datetime | None = None,
) -> dict:
    """Gross sales by tender type, cash refunds and expected drawer cash."""
    end = until or datetime.now(timezone.utc)

    pay_rows = await db.execute(
        select(
            Payment.provider,
            func.coalesce(func.sum(Payment.captured_amount), 0),
            func.count(func.distinct(Payment.order_id)),
        )
        .join(Order, Order.id == Payment.order_id)
        .where(
            Order.store_id == store_id,
            Order.deleted_at.is_(None),
            Payment.status.in_(("captured", "partially_refunded")),
            Payment.created_at >= session.opened_at,
            Payment.created_at < end,
        )
        .group_by(Payment.provider)
    )

    sales = {"cash": Decimal(0), "card": Decimal(0), "qr": Decimal(0)}
    order_count = 0
    for provider, gross, cnt in pay_rows.all():
        bucket = PROVIDER_BUCKETS.get(provider, "qr")
        sales[bucket] += Decimal(gross)
        order_count += int(cnt)

    # Cash refunds are windowed on WHEN the refund completed, not on the
    # payment's creation — a cash refund today for a payment captured in a
    # previous session still left the drawer today and must be deducted here.
    refund_row = await db.execute(
        select(func.coalesce(func.sum(Refund.amount), 0))
        .join(Payment, Payment.id == Refund.payment_id)
        .join(Order, Order.id == Payment.order_id)
        .where(
            Order.store_id == store_id,
            Order.deleted_at.is_(None),
            Refund.status == "completed",
            Payment.provider == "cash",
            func.coalesce(Refund.completed_at, Refund.created_at) >= session.opened_at,
            func.coalesce(Refund.completed_at, Refund.created_at) < end,
        )
    )
    cash_refunds = Decimal(refund_row.scalar() or 0)

    expected_cash = Decimal(session.opening_cash or 0) + sales["cash"] - cash_refunds
    return {
        "window_start": session.opened_at,
        "window_end": end,
        "order_count": order_count,
        "sales_cash": sales["cash"],
        "sales_card": sales["card"],
        "sales_qr": sales["qr"],
        "cash_refunds": cash_refunds,
        "opening_cash": Decimal(session.opening_cash or 0),
        "expected_cash": expected_cash,
    }


async def close_session_with_report(
    db,
    session: PosSession,
    store_id: int,
    closing_cash: Decimal,
    discrepancy_notes: str | None,
) -> PosSession:
    """Snapshot the live Z-report into the session row and close it."""
    now = datetime.now(timezone.utc)
    report = await compute_session_report(db, session, store_id, until=now)
    session.status = "closed"
    session.closed_at = now
    session.closing_cash = closing_cash
    session.expected_cash = report["expected_cash"]
    session.discrepancy = closing_cash - report["expected_cash"]
    session.discrepancy_notes = discrepancy_notes
    session.total_sales_cash = report["sales_cash"]
    session.total_sales_card = report["sales_card"]
    session.total_sales_qr = report["sales_qr"]
    session.order_count = report["order_count"]
    return session
