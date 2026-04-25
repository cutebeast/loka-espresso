from __future__ import annotations

from app.core.utils import to_float


def calculate_cart_subtotal(cart_items: list, custom_options_map: dict | None = None) -> float:
    subtotal = 0.0
    for ci in cart_items:
        base = to_float(ci.unit_price)
        custom_total = 0.0
        if ci.customization_option_ids and custom_options_map:
            for oid in ci.customization_option_ids:
                opt = custom_options_map.get(oid)
                if opt:
                    custom_total += opt.get("price_adjustment", 0)
        subtotal += (base + custom_total) * ci.quantity
    return round(subtotal, 2)


def calculate_delivery_fee(order_type: str, config_cache: dict | None = None) -> float:
    if order_type != "delivery":
        return 0.0
    if config_cache and "delivery_fee" in config_cache:
        return float(config_cache["delivery_fee"])
    return 3.0


def calculate_discount(
    discount_type: str,
    discount_value: float,
    subtotal: float,
    delivery_fee: float,
    min_spend: float = 0,
) -> float:
    if min_spend > 0 and subtotal < min_spend:
        return 0.0
    if discount_type == "percent":
        discount = round(subtotal * discount_value / 100, 2)
    elif discount_type in ("fixed", "free_item"):
        discount = discount_value
    else:
        discount = 0.0
    return min(discount, subtotal + delivery_fee)


def calculate_order_total(subtotal: float, delivery_fee: float, discount: float) -> float:
    return round(subtotal + delivery_fee - discount, 2)
