"""Business logic services for the FnB Super App.

Service layer encapsulates all non-trivial business operations:
transactions, domain logic, and cross-cutting orchestration.
"""

from app.services.auth import (
    login_admin,
    register_customer,
    create_customer_tokens,
    refresh_customer_tokens,
    create_admin_tokens,
    refresh_admin_tokens,
)
from app.services.cart import (
    get_or_create_cart,
    add_line_item,
    update_line_item,
    remove_line_item,
    clear_cart,
)
from app.services.commerce import (
    credit_referral_points,
    get_default_tier_id,
)
from app.services.order import (
    create_order_from_cart,
    get_customer_orders,
    generate_order_number,
)
from app.services.payment import (
    create_payment_intent,
    confirm_payment,
    capture_payment,
    cancel_payment,
    refund_payment,
)
from app.services.translation import (
    auto_translate_text,
    auto_translate_record,
    delete_translations,
    merge_translations,
    translate_single,
)

__all__ = [
    "login_admin",
    "register_customer",
    "create_customer_tokens", "refresh_customer_tokens",
    "create_admin_tokens", "refresh_admin_tokens",
    "get_or_create_cart", "add_line_item", "update_line_item",
    "remove_line_item", "clear_cart",
    "credit_referral_points", "get_default_tier_id",
    "create_order_from_cart", "get_customer_orders", "generate_order_number",
    "create_payment_intent", "confirm_payment", "capture_payment",
    "cancel_payment", "refund_payment",
    "auto_translate_text", "auto_translate_record", "delete_translations",
    "merge_translations", "translate_single",
]
