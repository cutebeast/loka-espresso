"""Business logic services for the FnB Super App.

Service layer encapsulates all non-trivial business operations:
transactions, domain logic, and cross-cutting orchestration.

Usage:
    from app.services.auth import register_customer, login_customer
    from app.services.cart import add_to_cart, get_or_create_cart
    from app.services.order import create_order_from_cart
    from app.services.payment import create_payment_intent, capture_payment
    from app.services.commerce import recalculate_loyalty_tier, credit_referral_points
    from app.services.translation import auto_translate, merge_translations
    from app.services.platform_config import get_config_value, set_config_value
"""

from app.services.auth import (
    login_admin,
    login_customer,
    login_staff,
    register_customer,
    refresh_admin_token,
    refresh_customer_token,
    refresh_staff_token,
)
from app.services.cart import (
    add_to_cart,
    clear_cart,
    get_or_create_cart,
    remove_from_cart,
    update_cart_item,
)
from app.services.commerce import (
    credit_referral_points,
    recalculate_loyalty_tier,
)
from app.services.order import (
    calculate_service_charge,
    create_order_from_cart,
    deduct_inventory_for_order,
)
from app.services.payment import (
    cancel_payment,
    capture_payment,
    confirm_payment,
    create_payment_intent,
    process_refund,
)
from app.services.platform_config import (
    get_config_value,
    set_config_value,
    get_all_public_config,
)
from app.services.translation import (
    auto_translate,
    get_cached_translation,
    merge_translations,
    translate_single,
)

__all__ = [
    # Auth
    "register_customer", "login_customer", "login_admin", "login_staff",
    "refresh_admin_token", "refresh_customer_token", "refresh_staff_token",
    # Cart
    "add_to_cart", "remove_from_cart", "update_cart_item", "clear_cart", "get_or_create_cart",
    # Commerce
    "recalculate_loyalty_tier", "credit_referral_points",
    # Order
    "create_order_from_cart", "calculate_service_charge", "deduct_inventory_for_order",
    # Payment
    "create_payment_intent", "capture_payment", "confirm_payment", "cancel_payment", "process_refund",
    # Platform Config
    "get_config_value", "set_config_value", "get_all_public_config",
    # Translation
    "auto_translate", "merge_translations", "translate_single", "get_cached_translation",
]
