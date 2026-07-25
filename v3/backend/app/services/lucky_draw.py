"""Lucky draw ticket grants (ticket_spend campaigns).

Tickets are earned from spending — RM X per ticket (campaign
`spend_per_ticket_cents`), computed as a per-order floor and granted when the
order's payment is captured (POS at sale, PWA online on capture). Grants are
idempotent per (campaign, order, seq) so re-captures/webhook retries are safe.
Refunds do not claw tickets back (deliberate, keep simple).
"""

from datetime import datetime, timezone

from sqlalchemy import func, select

from app.models.lucky_draw import LuckyDrawCampaign, LuckyDrawSpin, LuckyDrawTicket


async def _get_active_ticket_campaign(db) -> LuckyDrawCampaign | None:
    """The currently live ticket_spend campaign, if any."""
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(LuckyDrawCampaign)
        .where(LuckyDrawCampaign.is_active.is_(True))
        .where(LuckyDrawCampaign.draw_type == "ticket_spend")
        .where(
            (LuckyDrawCampaign.start_date.is_(None)) | (LuckyDrawCampaign.start_date <= now)
        )
        .where(
            (LuckyDrawCampaign.end_date.is_(None)) | (LuckyDrawCampaign.end_date >= now)
        )
        .order_by(LuckyDrawCampaign.id.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def grant_tickets_for_order(db, order) -> int:
    """Grant spend-tickets for a captured order. Returns tickets granted (0 if
    the active campaign isn't ticket_spend, the order has no customer, or it
    earns nothing). Idempotent — safe to call on every capture event.
    """
    if order is None or not order.customer_id:
        return 0
    campaign = await _get_active_ticket_campaign(db)
    if campaign is None:
        return 0

    total_cents = int((order.total_amount or 0) * 100)
    count = total_cents // campaign.spend_per_ticket_cents
    if count <= 0:
        return 0

    from sqlalchemy.dialects.postgresql import insert as pg_insert

    rows = [
        {
            "campaign_id": campaign.id,
            "customer_id": order.customer_id,
            "order_id": order.id,
            "order_ticket_seq": seq,
        }
        for seq in range(1, count + 1)
    ]
    stmt = (
        pg_insert(LuckyDrawTicket)
        .values(rows)
        .on_conflict_do_nothing(constraint="uq_lucky_draw_tickets_campaign_order_seq")
    )
    await db.execute(stmt)
    return count


async def tickets_available(db, campaign_id: int, customer_id: int) -> int:
    """Count of a customer's unconsumed tickets for a campaign."""
    result = await db.execute(
        select(func.count(LuckyDrawTicket.id)).where(
            LuckyDrawTicket.campaign_id == campaign_id,
            LuckyDrawTicket.customer_id == customer_id,
            LuckyDrawTicket.consumed_at.is_(None),
        )
    )
    return result.scalar() or 0


async def consume_oldest_ticket(
    db, campaign_id: int, customer_id: int, spin: LuckyDrawSpin
) -> LuckyDrawTicket | None:
    """Lock and consume the customer's oldest available ticket for a spin.
    Returns None when no tickets remain (caller maps that to 429).
    """
    result = await db.execute(
        select(LuckyDrawTicket)
        .where(
            LuckyDrawTicket.campaign_id == campaign_id,
            LuckyDrawTicket.customer_id == customer_id,
            LuckyDrawTicket.consumed_at.is_(None),
        )
        .order_by(LuckyDrawTicket.created_at.asc(), LuckyDrawTicket.id.asc())
        .limit(1)
        .with_for_update()
    )
    ticket = result.scalar_one_or_none()
    if ticket is None:
        return None
    ticket.consumed_at = datetime.now(timezone.utc)
    ticket.spin_id = spin.id
    return ticket
