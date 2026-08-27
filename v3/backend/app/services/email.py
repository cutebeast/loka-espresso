"""Outbound email: shared Resend delivery helper + order receipt emails.

`send_email_via_resend` is the single low-level sender (extracted from
admin/marketing.py so both marketing campaigns and transactional receipts
share the same credential/config handling).

`send_order_receipt_email` is a fire-and-forget capture hook, modelled on
einvoice.auto_issue_on_payment: gated on ``email.receipts_enabled`` (default
off), idempotent per payment via ``payment.extra_metadata['receipt_email_sent_at']``,
silent for walk-in/guest orders with no email address, and every failure is
logged and swallowed so payment capture is never affected.
"""

import html as _html
import logging
from datetime import datetime, timezone
from decimal import Decimal

from httpx import AsyncClient
from sqlalchemy import select

from app.models.platform import PlatformConfig
from app.services.platform_config import PlatformConfigService

logger = logging.getLogger(__name__)

RESEND_DEFAULT_API_URL = "https://api.resend.com/emails"


async def get_resend_api_url(db) -> str:
    """Get Resend API URL from platform_config."""
    result = await db.execute(
        select(PlatformConfig).where(PlatformConfig.config_key == "integration.resend_api_url")
    )
    row = result.scalar_one_or_none()
    if row and row.config_value:
        return str(row.config_value).strip().strip('"')
    return RESEND_DEFAULT_API_URL


async def send_email_via_resend(
    to_email: str,
    subject: str,
    body: str = "",
    db=None,
    api_key: str | None = None,
    from_email: str | None = None,
    tags: dict[str, str] | None = None,
    html_body: str | None = None,
) -> bool:
    """Send an email via Resend API. Returns True on success.

    If api_key/from_email are not provided, reads from platform_config and
    respects the integration.resend_use_test_credentials toggle.

    ``html_body`` is a full HTML document; when omitted, the plain-text
    ``body`` is wrapped in a simple paragraph (marketing campaign behaviour).

    ``tags`` is a flat mapping of tag names to values. Resend expects an array
    of ``{"name": ..., "value": ...}`` objects, so the mapping is converted
    automatically. Tags are returned in webhook events and are used to map
    delivery events back to a campaign.
    """
    if not to_email:
        return False

    if db is not None and (api_key is None or from_email is None):
        use_test_result = await db.execute(
            select(PlatformConfig).where(PlatformConfig.config_key == "integration.resend_use_test_credentials")
        )
        use_test_row = use_test_result.scalar_one_or_none()
        use_test = bool(
            use_test_row and str(use_test_row.config_value).lower() in ("true", "1", "yes", "on")
        )
        api_key_key = "integration.resend_test_api_key" if use_test else "integration.resend_api_key"
        from_email_key = "integration.resend_test_from_email" if use_test else "integration.resend_from_email"
        resend_result = await db.execute(
            select(PlatformConfig).where(PlatformConfig.config_key.in_([api_key_key, from_email_key]))
        )
        resend_rows = {r.config_key: str(r.config_value or "") for r in resend_result.scalars().all()}
        api_key = api_key or resend_rows.get(api_key_key, "")
        from_email = from_email or resend_rows.get(from_email_key, "")

    if not api_key or not from_email:
        return False

    url = await get_resend_api_url(db) if db else RESEND_DEFAULT_API_URL
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    payload = {
        "from": from_email,
        "to": [to_email],
        "subject": subject,
        "html": html_body or (f"<p>{body.replace(chr(10), '<br>')}</p>" if body else f"<p>{subject}</p>"),
    }
    if tags:
        payload["tags"] = [{"name": k, "value": v} for k, v in tags.items()]
    try:
        async with AsyncClient(timeout=15) as client:
            resp = await client.post(url, json=payload, headers=headers)
            return resp.status_code in (200, 201)
    except Exception:
        logger.error("Email delivery failed via Resend", exc_info=True)
        return False


# ---------------------------------------------------------------------------
# Order receipt email
# ---------------------------------------------------------------------------

_LABELS = {
    "en": {
        "subject": "Receipt for order {order_number} — {store_name}",
        "heading": "Thank you for your order!",
        "order_no": "Order",
        "date": "Date",
        "store": "Store",
        "item": "Item",
        "qty": "Qty",
        "amount": "Amount",
        "subtotal": "Subtotal",
        "discount": "Discount",
        "delivery_fee": "Delivery fee",
        "service_charge": "Service charge",
        "tax": "Tax",
        "tip": "Tip",
        "total": "Total",
        "paid_via": "Paid via",
        "points_earned": "Loyalty points earned",
        "footer": "This is your official payment receipt. Questions? Reply to this email.",
    },
    "zh": {
        "subject": "订单 {order_number} 收据 — {store_name}",
        "heading": "感谢您的订购！",
        "order_no": "订单号",
        "date": "日期",
        "store": "门店",
        "item": "商品",
        "qty": "数量",
        "amount": "金额",
        "subtotal": "小计",
        "discount": "折扣",
        "delivery_fee": "配送费",
        "service_charge": "服务费",
        "tax": "税费",
        "tip": "小费",
        "total": "合计",
        "paid_via": "支付方式",
        "points_earned": "获得积分",
        "footer": "此邮件为您的付款收据。如有疑问，请直接回复本邮件。",
    },
}

_PROVIDER_LABELS = {
    "en": {
        "cash": "Cash",
        "internal_wallet": "Wallet",
        "store_credit": "Store Credit",
        "stripe": "Card / Online",
        "hitpay": "Card / Online",
        "eghl": "Card / FPX",
    },
    "zh": {
        "cash": "现金",
        "internal_wallet": "钱包",
        "store_credit": "店铺储值",
        "stripe": "银行卡 / 在线支付",
        "hitpay": "银行卡 / 在线支付",
        "eghl": "银行卡 / FPX",
    },
}


def _esc(value) -> str:
    return _html.escape(str(value if value is not None else ""))


def _modifier_names(line_item, id_to_name: dict[int, str]) -> list[str]:
    """Extract display names from a line item's selected_modifiers.

    Shapes in the wild: {group_id: [{"option_name": ...}]} (kiosk) and
    {group_id: [option_id, ...]} (cart checkout) — ids are resolved via
    ``id_to_name``.
    """
    names: list[str] = []
    mods = line_item.selected_modifiers or {}
    if not isinstance(mods, dict):
        return names
    for opts in mods.values():
        if not isinstance(opts, list):
            continue
        for opt in opts:
            if isinstance(opt, dict) and opt.get("option_name"):
                names.append(str(opt["option_name"]))
            elif isinstance(opt, int) and opt in id_to_name:
                names.append(id_to_name[opt])
    return names


async def _resolve_modifier_names(db, line_items) -> dict[int, str]:
    ids: set[int] = set()
    for li in line_items:
        mods = li.selected_modifiers or {}
        if not isinstance(mods, dict):
            continue
        for opts in mods.values():
            if isinstance(opts, list):
                ids.update(o for o in opts if isinstance(o, int))
    if not ids:
        return {}
    from app.models.menu import MenuModifierOption
    rows = (
        await db.execute(
            select(MenuModifierOption.id, MenuModifierOption.option_name).where(MenuModifierOption.id.in_(ids))
        )
    ).all()
    return {row[0]: row[1] for row in rows}


def _build_receipt_html(
    *,
    labels: dict[str, str],
    method_label: str,
    order,
    store_name: str,
    order_dt: str,
    rows: list[tuple[str, list[str], int, Decimal]],
    currency_symbol: str,
) -> str:
    def money(v) -> str:
        return f"{currency_symbol} {Decimal(str(v or 0)):.2f}"

    item_rows = []
    for name, mods, qty, line_total in rows:
        mod_html = ""
        if mods:
            mod_html = (
                f'<div style="font-size:12px;color:#666;">+ '
                f'{_esc(", ".join(mods))}</div>'
            )
        item_rows.append(
            "<tr>"
            f'<td style="padding:6px 8px;border-bottom:1px solid #eee;">{_esc(name)}{mod_html}</td>'
            f'<td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center;">{qty}</td>'
            f'<td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;">{money(line_total)}</td>'
            "</tr>"
        )

    subtotal = Decimal(str(order.items_subtotal or 0)) + Decimal(str(order.modifier_subtotal or 0))
    discount = (
        Decimal(str(order.discount_amount or 0))
        + Decimal(str(order.voucher_discount or 0))
        + Decimal(str(order.reward_discount or 0))
        + Decimal(str(order.addon_discount or 0))
    )

    def total_row(label_key: str, value, *, strong: bool = False, sign: str = "") -> str:
        weight = "font-weight:bold;" if strong else ""
        return (
            "<tr>"
            f'<td colspan="2" style="padding:4px 8px;{weight}">{_esc(labels[label_key])}</td>'
            f'<td style="padding:4px 8px;text-align:right;{weight}">{sign}{money(value)}</td>'
            "</tr>"
        )

    totals = [total_row("subtotal", subtotal)]
    if discount > 0:
        totals.append(total_row("discount", discount, sign="−"))
    if Decimal(str(order.delivery_fee or 0)) > 0:
        totals.append(total_row("delivery_fee", order.delivery_fee))
    if Decimal(str(order.service_charge or 0)) > 0:
        totals.append(total_row("service_charge", order.service_charge))
    if Decimal(str(order.tax_amount or 0)) > 0:
        totals.append(total_row("tax", order.tax_amount))
    if Decimal(str(order.tip_amount or 0)) > 0:
        totals.append(total_row("tip", order.tip_amount))
    totals.append(total_row("total", order.total_amount, strong=True))

    points_html = ""
    if (order.loyalty_points_earned or 0) > 0:
        points_html = (
            f'<p style="margin:12px 0 0;">{_esc(labels["points_earned"])}: '
            f"<strong>{int(order.loyalty_points_earned)}</strong></p>"
        )

    return f"""<!DOCTYPE html>
<html><body style="margin:0;padding:24px;background:#f6f6f6;font-family:Arial,Helvetica,sans-serif;color:#222;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:8px;padding:24px;">
    <h2 style="margin:0 0 4px;">{_esc(labels["heading"])}</h2>
    <p style="margin:0 0 16px;color:#666;font-size:13px;">
      {_esc(labels["order_no"])}: <strong>{_esc(order.order_number)}</strong><br>
      {_esc(labels["store"])}: {_esc(store_name)}<br>
      {_esc(labels["date"])}: {_esc(order_dt)}
    </p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <thead>
        <tr style="color:#666;font-size:12px;text-align:left;">
          <th style="padding:4px 8px;border-bottom:2px solid #ddd;">{_esc(labels["item"])}</th>
          <th style="padding:4px 8px;border-bottom:2px solid #ddd;text-align:center;">{_esc(labels["qty"])}</th>
          <th style="padding:4px 8px;border-bottom:2px solid #ddd;text-align:right;">{_esc(labels["amount"])}</th>
        </tr>
      </thead>
      <tbody>
        {''.join(item_rows)}
        {''.join(totals)}
      </tbody>
    </table>
    <p style="margin:12px 0 0;">{_esc(labels["paid_via"])}: <strong>{_esc(method_label)}</strong></p>
    {points_html}
    <p style="margin:20px 0 0;color:#999;font-size:12px;">{_esc(labels["footer"])}</p>
  </div>
</body></html>"""


async def send_order_receipt_email(db, order, payment) -> bool:
    """Fire-and-forget receipt email after a captured payment.

    Gated on ``email.receipts_enabled`` (default off). Idempotent per payment
    via ``payment.extra_metadata['receipt_email_sent_at']``. Skips silently for
    orders whose customer has no email address (walk-in/guest). Only fires once
    the order is fully paid (``payment_status`` captured/settled), like the
    e-invoice hook. Every failure is logged and swallowed so the payment flow
    is never affected. Returns True only when an email was actually sent.
    """
    try:
        config = PlatformConfigService(db)
        if not await config.get_bool("email.receipts_enabled", default=False):
            return False
        if payment is None or payment.status not in ("captured", "partially_refunded"):
            return False
        if order is None or order.deleted_at is not None:
            return False
        if order.payment_status not in ("captured", "settled"):
            return False
        if not order.customer_id:
            return False
        meta = payment.extra_metadata or {}
        if meta.get("receipt_email_sent_at"):
            return False

        from app.models.customer import Customer
        customer = (
            await db.execute(select(Customer).where(Customer.id == order.customer_id))
        ).scalar_one_or_none()
        to_email = (customer.email_address or "").strip() if customer else ""
        if not to_email:
            return False  # walk-in / guest — nothing to send to

        from app.models.order import OrderLineItem
        from app.models.store import Store
        store_name = (
            await db.execute(select(Store.store_name).where(Store.id == order.store_id))
        ).scalar_one_or_none() or ""
        line_items = (
            await db.execute(
                select(OrderLineItem).where(OrderLineItem.order_id == order.id).order_by(OrderLineItem.id)
            )
        ).scalars().all()
        id_to_name = await _resolve_modifier_names(db, line_items)

        rows = []
        for li in line_items:
            snapshot = li.item_snapshot or {}
            name = snapshot.get("item_name") or snapshot.get("name") or f"Item {li.menu_item_id}"
            if snapshot.get("variant_name"):
                name = f"{name} ({snapshot['variant_name']})"
            rows.append((name, _modifier_names(li, id_to_name), li.quantity, li.line_total))

        locale = "zh" if (customer.preferred_language or "").lower().startswith("zh") else "en"
        labels = _LABELS[locale]
        method_label = _PROVIDER_LABELS[locale].get(payment.provider or "", payment.provider or "")

        from app.core.business_time import BUSINESS_TZ
        order_dt = order.created_at or datetime.now(timezone.utc)
        if order_dt.tzinfo is None:
            order_dt = order_dt.replace(tzinfo=timezone.utc)
        order_dt_str = order_dt.astimezone(BUSINESS_TZ).strftime("%Y-%m-%d %H:%M")

        currency_symbol = await config.get_str("app.currency_symbol", default="RM")

        html_body = _build_receipt_html(
            labels=labels,
            method_label=method_label,
            order=order,
            store_name=store_name,
            order_dt=order_dt_str,
            rows=rows,
            currency_symbol=currency_symbol,
        )
        subject = labels["subject"].format(order_number=order.order_number, store_name=store_name)

        sent = await send_email_via_resend(
            to_email,
            subject,
            db=db,
            html_body=html_body,
            tags={"type": "order_receipt", "order_id": str(order.id)},
        )
        if sent:
            payment.extra_metadata = {
                **meta,
                "receipt_email_sent_at": datetime.now(timezone.utc).isoformat(),
            }
            await db.commit()
        return sent
    except Exception:
        logger.exception("Receipt email failed for order %s", getattr(order, "id", None))
        return False
