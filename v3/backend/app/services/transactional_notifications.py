"""Transactional notification engine.

One entry point: `notify_event(db, event_key, customer_id, context=...)`.

- Resolves the enabled template for the event (no template / disabled → no-op).
- Interpolates {variables} from the context.
- Honors per-customer preferences (channel + category opt-outs, quiet hours —
  non-inbox channels skip inside the quiet window; inbox is always immediate).
- Creates the inbox NotificationMessage (template image/action, priority,
  template_id for translation merging) and fans out push / SMS / WhatsApp.
- Idempotent per (event_key, entity_type, entity_id, customer_id) via
  notification_events_log — status re-sends and retries never double-notify.

Rules:
- Never raise into the caller and NEVER roll back the caller's transaction:
  everything runs inside a savepoint; a notification failure must never break
  the business flow it observes (welcome, order capture, refund...).
- entity ids are stringified (order ids, voucher ids, date ordinals...).
"""

import logging
from datetime import datetime, time, timezone
from typing import Any

from sqlalchemy import func, select

from app.models.notification import (
    NotificationEventsLog,
    NotificationMessage,
    NotificationPreference,
    NotificationTemplate,
)
from app.models.translation import Translation

logger = logging.getLogger(__name__)

# event_key -> (message_type, category, human label, variables)
# message_type must be one of the notification_messages CHECK values.
TRANSACTIONAL_EVENTS: dict[str, dict[str, Any]] = {
    "welcome":                {"message_type": "loyalty",       "category": "loyalty",        "label": "Welcome",                   "variables": ["customer_name", "gifts"]},
    "order_confirmed":        {"message_type": "order_update",  "category": "order_updates",  "label": "Order confirmed",           "variables": ["customer_name", "order_number", "store_name"]},
    "order_preparing":        {"message_type": "order_update",  "category": "order_updates",  "label": "Order preparing",           "variables": ["customer_name", "order_number", "store_name"]},
    "order_ready":            {"message_type": "order_update",  "category": "order_updates",  "label": "Order ready",               "variables": ["customer_name", "order_number", "store_name"]},
    "order_out_for_delivery": {"message_type": "order_update",  "category": "order_updates",  "label": "Order out for delivery",    "variables": ["customer_name", "order_number", "provider"]},
    "order_delivered":        {"message_type": "order_update",  "category": "order_updates",  "label": "Order delivered",           "variables": ["customer_name", "order_number"]},
    "order_cancelled":        {"message_type": "order_update",  "category": "order_updates",  "label": "Order cancelled",           "variables": ["customer_name", "order_number", "reason"]},
    "refund_processed":       {"message_type": "payment",       "category": "order_updates",  "label": "Refund processed",          "variables": ["customer_name", "order_number", "amount", "method"]},
    "payment_reminder":       {"message_type": "reminder",      "category": "order_updates",  "label": "Payment reminder",          "variables": ["customer_name", "order_number", "amount_due"]},
    "voucher_granted":        {"message_type": "promotion",     "category": "promotions",     "label": "Voucher granted",           "variables": ["customer_name", "voucher_title", "discount"]},
    "reward_redeemed":        {"message_type": "loyalty",       "category": "loyalty",        "label": "Reward redeemed",           "variables": ["customer_name", "reward_name"]},
    "wallet_topup":           {"message_type": "payment",       "category": "system",         "label": "Wallet topped up",          "variables": ["customer_name", "amount", "balance"]},
    "tier_upgrade":           {"message_type": "loyalty",       "category": "loyalty",        "label": "Tier upgrade",              "variables": ["customer_name", "tier_name", "multiplier"]},
    "referral_credited":      {"message_type": "loyalty",       "category": "loyalty",        "label": "Referral credited",         "variables": ["customer_name", "points"]},
    "points_expiring_soon":   {"message_type": "loyalty",       "category": "loyalty",        "label": "Points expiring soon",      "variables": ["customer_name", "points", "date"]},
    "lucky_draw_win":         {"message_type": "promotion",     "category": "promotions",     "label": "Lucky draw win",            "variables": ["customer_name", "prize", "campaign_name"]},
    "reservation_reminder":   {"message_type": "reminder",      "category": "system",         "label": "Reservation reminder",      "variables": ["customer_name", "event_name", "time"]},
}


def _interpolate(text: str | None, context: dict[str, Any]) -> str:
    if not text:
        return ""
    for key, value in context.items():
        text = text.replace("{" + key + "}", str(value if value is not None else ""))
    return text


def _in_quiet_hours(start: time | None, end: time | None, now_local: time) -> bool:
    if start is None or end is None:
        return False
    if start < end:
        return start <= now_local < end
    return now_local >= start or now_local < end  # overnight window


ORDER_STATUS_EVENT_MAP = {
    "confirmed": "order_confirmed",
    "preparing": "order_preparing",
    "ready_for_pickup": "order_ready",
    "out_for_delivery": "order_out_for_delivery",
    "delivered": "order_delivered",
    "cancelled_by_customer": "order_cancelled",
    "cancelled_by_merchant": "order_cancelled",
    "cancelled_by_system": "order_cancelled",
    "refunded": "order_cancelled",
}


async def notify_order_status(db, order, new_status: str, *, reason: str | None = None, provider: str | None = None):
    """Map an order status transition to its transactional event (no-op for
    unmapped statuses, walk-ins, and already-sent transitions)."""
    event_key = ORDER_STATUS_EVENT_MAP.get(new_status)
    if not event_key or not getattr(order, "customer_id", None):
        return None
    # Capture transaction ownership BEFORE any query (a query autobegins the
    # session and would flip in_transaction() to True).
    try:
        owns_tx = not db.in_transaction()
    except Exception:
        owns_tx = False
    ctx: dict[str, Any] = {
        "order_number": getattr(order, "order_number", "") or "",
        "reason": reason or "",
    }
    store_name = ""
    try:
        from app.models.store import Store
        store_name = (await db.execute(
            select(Store.store_name).where(Store.id == order.store_id)
        )).scalar_one_or_none() or ""
    except Exception:
        pass
    ctx["store_name"] = store_name
    if provider:
        ctx["provider"] = provider
    return await notify_event(
        db, event_key, order.customer_id,
        context=ctx, entity_type="order", entity_id=order.id,
        self_commit=owns_tx,
    )


async def _fetch_translation(db, table: str, record_id: int, column: str, locale: str, fallback: str) -> str:
    result = await db.execute(
        select(Translation.translated_text).where(
            Translation.table_name == table,
            Translation.record_id == record_id,
            Translation.column_name == column,
            Translation.locale == locale,
        ).limit(1)
    )
    text = result.scalar_one_or_none()
    if text:
        return text
    return fallback


async def notify_event(
    db,
    event_key: str,
    customer_id: int | None,
    *,
    context: dict[str, Any] | None = None,
    entity_type: str = "",
    entity_id: Any = "",
    self_commit: bool | None = None,
) -> NotificationMessage | None:
    """Send the transactional notification for `event_key` to the customer.

    Returns the created inbox message, or None when skipped (no template,
    disabled, already sent, no customer, or template error). Never raises."""
    if customer_id is None:
        return None
    event = TRANSACTIONAL_EVENTS.get(event_key)
    if event is None:
        logger.warning("notify_event: unknown event_key %s", event_key)
        return None

    eid = str(entity_id) if entity_id is not None else ""

    # Transaction ownership: callers either call us mid-transaction (services —
    # their commit persists us) or after their own commit (endpoints — no
    # active transaction). When we open the transaction ourselves we must
    # commit it, or the message silently rolls back at session close.
    if self_commit is not None:
        was_in_tx = not self_commit
    else:
        try:
            was_in_tx = db.in_transaction()
        except Exception:
            was_in_tx = True  # unknown — let the caller own it
    try:
        nested = await db.begin_nested()
    except Exception:
        nested = None  # already inside a transaction we don't own — proceed best-effort

    try:
        existing = await db.execute(
            select(NotificationEventsLog.id).where(
                NotificationEventsLog.event_key == event_key,
                NotificationEventsLog.entity_type == entity_type,
                NotificationEventsLog.entity_id == eid,
                NotificationEventsLog.customer_id == customer_id,
            )
        )
        if existing.scalar_one_or_none() is not None:
            if nested is not None:
                await nested.commit()
            if not was_in_tx:
                await db.commit()
            return None

        tpl_result = await db.execute(
            select(NotificationTemplate).where(
                NotificationTemplate.event_key == event_key,
                NotificationTemplate.is_enabled.is_(True),
            )
        )
        tpl = tpl_result.scalar_one_or_none()
        if tpl is None:
            if nested is not None:
                await nested.commit()
            if not was_in_tx:
                await db.commit()
            return None

        from app.models.customer import Customer
        cust_result = await db.execute(
            select(Customer.display_name, Customer.preferred_language).where(Customer.id == customer_id)
        )
        cust_row = cust_result.first()
        if cust_row is None:
            if nested is not None:
                await nested.commit()
            if not was_in_tx:
                await db.commit()
            return None
        display_name, locale = cust_row

        ctx = dict(context or {})
        ctx.setdefault("customer_name", display_name or "")

        title = tpl.title or ""
        body = tpl.body or ""
        if locale == "zh":
            zh_title = await _fetch_translation(db, "notification_templates", tpl.id, "title", "zh", title)
            zh_body = await _fetch_translation(db, "notification_templates", tpl.id, "body", "zh", body)
            if zh_title:
                title = zh_title
            if zh_body:
                body = zh_body

        title = _interpolate(title, ctx)[:100]
        body = _interpolate(body, ctx)
        action_url = _interpolate(tpl.action_url_template, ctx) if tpl.action_url_template else None

        msg = NotificationMessage(
            customer_id=customer_id,
            message_type=event["message_type"],
            priority=tpl.priority or "normal",
            title=title,
            body=body,
            image_url=tpl.image_url,
            action_url=action_url,
            template_id=tpl.id,
        )
        db.add(msg)
        await db.flush()

        channels = [c for c in (tpl.channels or []) if c != "in_app"]
        if channels:
            await _fan_out_extra_channels(db, customer_id, msg, channels, event["category"], title, body, action_url)

        db.add(NotificationEventsLog(
            event_key=event_key,
            entity_type=entity_type,
            entity_id=eid,
            customer_id=customer_id,
            message_id=msg.id,
        ))
        if nested is not None:
            await nested.commit()
        if not was_in_tx:
            await db.commit()
        return msg
    except Exception:
        logger.exception("notify_event failed for %s customer %s", event_key, customer_id)
        if nested is not None:
            try:
                await nested.rollback()
            except Exception:
                pass
        if not was_in_tx:
            try:
                await db.rollback()
            except Exception:
                pass
        return None


async def _fan_out_extra_channels(db, customer_id: int, msg: NotificationMessage, channels: list[str], category: str, title: str, body: str, action_url: str | None) -> None:
    from app.core.business_time import BUSINESS_TZ
    from app.models.customer import Customer
    from app.services.messaging import (
        fan_out_web_push,
        get_twilio_credentials,
        send_sms_via_twilio,
        send_whatsapp_via_twilio,
    )

    pref_result = await db.execute(
        select(NotificationPreference).where(
            NotificationPreference.customer_id == customer_id,
        )
    )
    prefs = pref_result.scalars().all()
    opted_out = {(p.channel, p.message_category) for p in prefs if not p.is_enabled}
    now_local = datetime.now(BUSINESS_TZ).time()
    quiet = any(_in_quiet_hours(p.quiet_hours_start, p.quiet_hours_end, now_local) for p in prefs)

    def blocked(channel: str) -> bool:
        return ((channel, category) in opted_out) or ((channel, "all") in opted_out)

    if "push_notification" in channels and not quiet and not blocked("push_notification"):
        await fan_out_web_push(db, [customer_id], {customer_id: msg.id}, title=title, body=body, url=action_url or "/")

    phone = None
    if any(c in channels for c in ("sms", "whatsapp")):
        phone_result = await db.execute(select(Customer.phone_number).where(Customer.id == customer_id))
        phone = phone_result.scalar_one_or_none()

    if "sms" in channels and not quiet and phone and not blocked("sms"):
        sid, token, sms_from, _wa = await get_twilio_credentials(db)
        if sid and token and sms_from:
            await send_sms_via_twilio(sid, token, sms_from, phone, f"{title}\n\n{body}", db=db)

    if "whatsapp" in channels and not quiet and phone and not blocked("whatsapp"):
        sid, token, _sms, wa_from = await get_twilio_credentials(db)
        if sid and token and wa_from:
            await send_whatsapp_via_twilio(sid, token, wa_from, phone, f"{title}\n\n{body}", db=db)


async def sweep_transactional_reminders(db) -> dict[str, int]:
    """Periodic reminder pass — idempotent via the events log, run every 5 min.

    - payment_reminder: prepaid orders pending+initiated between 30 min and
      2 h old (before the sweeper cancels them), non-walk-in customers.
    - points_expiring_soon: earn batches expiring within 7 days (one message
      per customer per expiry day).
    - reservation_reminder: table reservations for tomorrow + class sessions
      starting within 24 h.
    Returns per-event sent counts. Never raises."""
    from datetime import date, timedelta as _td

    from app.core.business_time import BUSINESS_TZ
    from app.models.loyalty import LoyaltyAccount, LoyaltyPointsLedger
    from app.models.order import Order
    from app.models.store import Reservation

    counts: dict[str, int] = {"payment_reminder": 0, "points_expiring_soon": 0, "reservation_reminder": 0}
    now = datetime.now(timezone.utc)

    # --- payment reminders -------------------------------------------------
    try:
        orders_result = await db.execute(
            select(Order).where(
                Order.status == "pending",
                Order.payment_status == "initiated",
                Order.payment_flow == "prepaid",
                Order.created_at > now - _td(hours=2),
                Order.created_at <= now - _td(minutes=30),
                Order.customer_id.is_not(None),
            ).limit(100)
        )
        for order in orders_result.scalars().all():
            from app.models.customer import Customer
            walkin = (await db.execute(
                select(Customer.id).where(Customer.id == order.customer_id, Customer.phone_number == "+0000000000")
            )).scalar_one_or_none()
            if walkin is not None:
                continue
            remaining = max(float(order.total_amount or 0) - float(order.discount_amount or 0), 0)
            if await notify_event(
                db, "payment_reminder", order.customer_id,
                context={"order_number": order.order_number, "amount_due": f"{remaining:.2f}"},
                entity_type="order", entity_id=order.id,
            ):
                counts["payment_reminder"] += 1
        await db.commit()
    except Exception:
        logger.exception("payment_reminder sweep failed")

    # --- points expiring soon ----------------------------------------------
    try:
        rows = (await db.execute(
            select(
                LoyaltyPointsLedger.loyalty_account_id,
                LoyaltyAccount.customer_id,
                func.sum(LoyaltyPointsLedger.points_delta).label("pts"),
                func.min(LoyaltyPointsLedger.expires_at).label("exp"),
            )
            .join(LoyaltyAccount, LoyaltyAccount.id == LoyaltyPointsLedger.loyalty_account_id)
            .where(
                LoyaltyPointsLedger.points_delta > 0,
                LoyaltyPointsLedger.expires_at.is_not(None),
                LoyaltyPointsLedger.expires_at > now,
                LoyaltyPointsLedger.expires_at <= now + _td(days=7),
            )
            .group_by(LoyaltyPointsLedger.loyalty_account_id, LoyaltyAccount.customer_id)
            .limit(200)
        )).all()
        for _la_id, customer_id, pts, exp in rows:
            if not customer_id:
                continue
            expiring = int(pts or 0)
            if expiring <= 0:
                continue
            exp_day = exp.date() if exp else None
            if await notify_event(
                db, "points_expiring_soon", customer_id,
                context={"points": expiring, "date": exp_day.isoformat() if exp_day else "soon"},
                entity_type="loyalty_batch", entity_id=f"{customer_id}:{exp_day.isoformat()}" if exp_day else f"{customer_id}:0",
            ):
                counts["points_expiring_soon"] += 1
        await db.commit()
    except Exception:
        logger.exception("points_expiring_soon sweep failed")

    # --- reservation reminders (tables + class sessions) --------------------
    try:
        tomorrow = (datetime.now(BUSINESS_TZ) + _td(days=1)).date()
        res_result = await db.execute(
            select(Reservation).where(
                Reservation.reservation_date == tomorrow,
                Reservation.customer_id.is_not(None),
                Reservation.status.in_(("confirmed", "requested")),
            ).limit(200)
        )
        for res in res_result.scalars().all():
            from app.models.store import DiningTable
            table_name = (await db.execute(
                select(DiningTable.table_number).where(DiningTable.id == res.dining_table_id)
            )).scalar_one_or_none() if res.dining_table_id else None
            if await notify_event(
                db, "reservation_reminder", res.customer_id,
                context={
                    "event_name": f"Table {table_name}" if table_name else "your table",
                    "time": res.reservation_date.isoformat(),
                },
                entity_type="reservation", entity_id=res.id,
            ):
                counts["reservation_reminder"] += 1
        await db.commit()
    except Exception:
        logger.exception("reservation_reminder sweep failed")

    return counts
