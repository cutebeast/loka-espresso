"""Receipt composer — Star Document Markup (text/vnd.star.markup).

Builds a customer receipt from an Order + line items. The output is plain
UTF-8 text with bracket markup tags ([align:], [bold:], [column:], [cut:],
[drawer]) rendered natively by CloudPRNT-capable Star printers
(mC-Print2/3, TSP650/700/800, mC-Label3).

References:
- Star Document Markup spec:
  https://star-m.jp/products/s_print/sdk/StarDocumentMarkup/manual/en/spec.html
- [drawer] tag (cash drawer kick):
  https://star-m.jp/products/s_print/sdk/StarDocumentMarkup/manual/en/tag-reference/drawer/index.html
"""

from datetime import datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

CONTENT_TYPE = "text/vnd.star.markup"

# Word wrapping collapses runs of spaces, so two-column layout must use the
# [column:] tag rather than padding. Separator width targets 80mm (mC-Print3).
_SEPARATOR = "-" * 42


def _esc(text: object) -> str:
    """Escape markup-hostile characters in printed text.

    `[`, `]` and `\\` are tag syntax; `;` terminates a [column:] parameter
    value; a literal newline inside a column value would break the layout.
    """
    s = "" if text is None else str(text)
    s = s.replace("\\", "\\\\").replace("[", "\\[").replace("]", "\\]")
    return s.replace(";", ",").replace("\r", " ").replace("\n", " ")


def _money(amount: object) -> str:
    try:
        return f"{Decimal(str(amount)):.2f}"
    except Exception:
        return "0.00"


def _row(left: str, right: str | None = None) -> str:
    if right is None:
        return _esc(left)
    return f"[column: left: {_esc(left)}; right: {_esc(right)}]"


def _payment_label(provider: str | None, method_type: str | None) -> str:
    if provider == "cash":
        return "Cash"
    if provider == "internal_wallet":
        return "Wallet"
    if provider == "store_credit":
        return "Store Credit"
    if provider == "hitpay":
        return "HitPay"
    if provider == "eghl":
        return "eGHL"
    if method_type in ("credit_card", "debit_card"):
        return "Card"
    if method_type in ("qr_pay", "e_wallet"):
        return "QR / E-Wallet"
    return (method_type or provider or "Other").replace("_", " ").title()


def compose_receipt(
    order,
    store,
    line_items,
    modifier_options: dict | None = None,
    payment_method: str | None = None,
    include_drawer: bool = False,
    reprint: bool = False,
) -> str:
    """Compose a receipt document in Star Document Markup.

    Parameters are plain model objects (or duck-typed equivalents):
    ``order`` needs order_number/created_at/totals/loyalty_points_earned,
    ``store`` needs store_name/brand_name/address/phone/currency/timezone,
    each line item needs item_snapshot/quantity/unit_price/line_total/
    selected_modifiers. ``modifier_options`` maps modifier option id ->
    option object (with ``option_name``) for printing modifier names.

    When ``include_drawer`` is true a [drawer] kick is emitted at the top of
    the document (cash sales) so the drawer opens while the receipt prints.
    """
    currency = getattr(order, "total_amount_currency", None) or getattr(store, "currency_code", "MYR")

    # Order timestamp in the store's local timezone.
    created = getattr(order, "created_at", None)
    if isinstance(created, datetime):
        tz_name = getattr(store, "timezone", None) or "UTC"
        try:
            created = created.astimezone(ZoneInfo(tz_name))
        except Exception:
            pass
        when = created.strftime("%Y-%m-%d %H:%M")
    else:
        when = ""

    out: list[str] = []

    if include_drawer:
        # Kick circuit 1 with the default 200ms pulse (drawer hangs off the
        # printer's DK port — never off the tablet).
        out.append("[drawer]")

    # ── Store header ──
    out.append("[align: center]")
    store_name = getattr(store, "store_name", "") or getattr(store, "brand_name", "") or ""
    out.append(f"[bold: on][magnify: width 2; height 2]{_esc(store_name)}[magnify][bold: off]")
    for part in (
        getattr(store, "address_line_1", None),
        getattr(store, "address_line_2", None),
        " ".join(
            p
            for p in (getattr(store, "city", None), getattr(store, "postal_code", None))
            if p
        ),
        (f"Tel: {getattr(store, 'phone_number')}" if getattr(store, "phone_number", None) else None),
    ):
        if part:
            out.append(_esc(part))

    # ── Order meta ──
    out.append("[align: left]")
    out.append(_SEPARATOR)
    out.append(_row(f"Order: {getattr(order, 'order_number', '')}", when))
    order_type = str(getattr(order, "order_type", "") or "").replace("_", " ").title()
    if order_type:
        out.append(_row(order_type, "REPRINT") if reprint else _row(order_type))
    elif reprint:
        out.append("[align: center]*** REPRINT ***")
    table = getattr(order, "table_number", None)
    if table:
        out.append(_row(f"Table: {table}"))
    out.append(_SEPARATOR)

    # ── Line items ──
    for li in line_items or []:
        snapshot = getattr(li, "item_snapshot", None) or {}
        name = snapshot.get("item_name") or snapshot.get("name") or f"Item #{getattr(li, 'menu_item_id', '?')}"
        variant = snapshot.get("variant_name")
        if variant:
            name = f"{name} ({variant})"
        qty = getattr(li, "quantity", 1)
        label = f"{qty} x {name}" if qty != 1 else name
        out.append(_row(label, _money(getattr(li, "line_total", 0))))

        # Modifiers are informational sub-lines: line_total already includes
        # them, so no amount is shown on the right.
        mods = (getattr(li, "selected_modifiers", None) or {}).get("modifier_ids") or []
        for mod_id in mods:
            opt = (modifier_options or {}).get(mod_id)
            opt_name = getattr(opt, "option_name", None) if opt is not None else None
            out.append(_row(f"  + {opt_name or f'Modifier {mod_id}'}"))
        instructions = getattr(li, "special_instructions", None)
        if instructions:
            out.append(_row(f"  ({instructions})"))

    # ── Totals ──
    out.append(_SEPARATOR)
    subtotal = getattr(order, "items_subtotal", 0)
    out.append(_row("Subtotal", _money(subtotal)))
    for label, field, negate in (
        ("Discount", "discount_amount", True),
        ("Voucher", "voucher_discount", True),
        ("Reward", "reward_discount", True),
        ("Service Charge", "service_charge", False),
        ("Tax", "tax_amount", False),
        ("Tip", "tip_amount", False),
    ):
        amount = Decimal(str(getattr(order, field, 0) or 0))
        if amount > 0:
            out.append(_row(label, f"-{_money(amount)}" if negate else _money(amount)))
    out.append(f"[bold: on]{_row('Total', f'{currency} {_money(getattr(order, 'total_amount', 0))}')}[bold: off]")

    # ── Payment / loyalty ──
    out.append(_SEPARATOR)
    if payment_method:
        out.append(_row("Payment", payment_method))
    points = getattr(order, "loyalty_points_earned", 0) or 0
    if points:
        out.append(_row("Points Earned", str(points)))

    # ── Footer ──
    out.append("[align: center]")
    out.append("Thank you!")
    out.append("[cut: feed; partial]")

    return "\n".join(out) + "\n"


def compose_drawer_kick() -> str:
    """A kick-only job: opens the drawer without printing a receipt."""
    return "[drawer]\n"
