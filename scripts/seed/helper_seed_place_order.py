"""
HELPER SCRIPT: helper_seed_place_order.py
Purpose: Helper function to place a single order for a customer
         NEW FLOW (per order_flow_status_guide.md):
         1. add cart items
         2. (optional) apply voucher OR reward discount → discount baked into order
         3. create order WITH discount baked in (status=pending)
         4. create payment intent → confirm payment → points awarded at payment (status=paid)
         5. admin PATCH status: paid → confirmed → preparing → ready → completed

         Menu is GLOBAL (HQ, store_id=0) - all stores share the same menu set by HQ.
Input:   - customer: dict with user_id, phone, token
         - menu_items: array of menu items from get_global_menu_items()
         - store_id: fulfillment store (2-6)
         - order_type: "pickup", "delivery", or "dine_in"
         - pickup_time: optional datetime for pickup orders
         - delivery_address: optional dict for delivery orders (address, lat, lng)
         - delivery_fee: optional delivery fee for delivery orders
         - table_id: optional table_id for dine_in orders
         - created_at: optional backdated timestamp
         - voucher_code: optional voucher code for discount (from user's claimed vouchers)
         - reward_redemption_code: optional reward redemption code (mutually exclusive with voucher_code)
         - pay_and_complete: if True, pay and complete the order through full status chain
Output:  (order_id, total, points_earned, order_data) or (None, None, None, None) on failure
Dependencies: Customer must have valid token (OTP verified)
NO direct DB inserts — ALL via API calls.
Status: NEW FLOW-2026-04-17 | Discount at creation, points at payment
        ENHANCED-2026-04-18 | Added dine_in support with table_id
"""

import sys, os, random
from datetime import datetime, timezone, timedelta
SEED_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SEED_DIR)
from shared_config import (
    api_get, api_post, api_delete, api_patch,
    admin_token, re_auth_customer,
)


STREETS = ["Jalan Ampang", "Jalan Bukit Bintang", "Jalan Sultan",
           "Jalan Alor", "Jalan Cheras", "Jalan OUG"]


def rand_address():
    return f"{random.randint(1,199)}, {random.choice(STREETS)}, 55000 Kuala Lumpur"


def get_global_menu_items():
    """
    Fetch global menu items from HQ (store_id=0).
    All stores share this same menu - set by HQ.
    Returns: list of {"id": ..., "name": ..., "base_price": ...}
    """
    resp = api_get("/stores/0/menu")
    if resp.status_code != 200:
        return []
    items = []
    for cat in resp.json().get("categories", []):
        for item in cat.get("items", []):
            if item.get("is_available"):
                items.append({
                    "id": item["id"],
                    "name": item["name"],
                    "base_price": item.get("base_price", 0),
                })
    return items


def validate_voucher_code(voucher_code, order_total, token):
    """Validate a voucher code and return discount info."""
    resp = api_post("/vouchers/validate", token=token, json={
        "code": voucher_code,
        "order_total": order_total,
    })
    if resp.status_code == 200:
        data = resp.json()
        if data.get("valid"):
            return data
    return None


def place_order_for_customer(
    customer,
    menu_items,
    fulfillment_store_id,
    order_type="pickup",
    pickup_time=None,
    delivery_address=None,
    delivery_fee=None,
    table_id=None,
    created_at=None,
    voucher_code=None,
    reward_redemption_code=None,
    pay_and_complete=True,
):
    """
    Place a single order for a customer using global menu items.

    Args:
        customer: dict with user_id, phone, token
        menu_items: array of menu items from get_global_menu_items()
        fulfillment_store_id: which store fulfills the order (2,3,4,5,6)
        order_type: "pickup", "delivery", or "dine_in"
        pickup_time: datetime for pickup orders (optional, defaults to now+1hr)
        delivery_address: dict with address, lat, lng for delivery (optional)
        delivery_fee: delivery fee for delivery orders (optional)
        table_id: table ID for dine_in orders (optional)
        created_at: backdated order time (optional)
        voucher_code: optional voucher code for discount (from user's claimed vouchers)
        reward_redemption_code: optional reward redemption code (mutually exclusive with voucher_code)
        pay_and_complete: if True, pay and complete the order through full status chain

    Returns:
        (order_id, total, points_earned, order_data) on success
        (None, None, None, None) on failure
    """
    token = customer.get("token")
    if not token:
        return (None, None, None, None)

    if voucher_code and reward_redemption_code:
        return (None, None, None, None)

    def do_place(tok):
        # Clear cart
        r = api_delete("/cart", token=tok)
        if r.status_code == 401:
            return "auth_error", tok, None, None
        if r.status_code not in (200, 204):
            return "clear_failed", tok, None, None

        # Add items to cart - ALL items use the fulfillment_store_id
        chosen = random.sample(menu_items, min(len(menu_items), random.randint(1, 5)))
        qty_per_item = {item["id"]: random.randint(1, 2) for item in chosen}

        for item in chosen:
            resp = api_post("/cart/items", token=tok, json={
                "item_id": item["id"],
                "store_id": fulfillment_store_id,
                "quantity": qty_per_item[item["id"]],
            })
            if resp.status_code == 401:
                return "auth_error", tok, None, None
            if resp.status_code not in (200, 201):
                return "add_item_failed", tok, None, None

        # Build order payload with discount
        payload = {
            "store_id": fulfillment_store_id,
            "order_type": order_type,
        }

        if created_at:
            payload["created_at"] = created_at.isoformat() if isinstance(created_at, datetime) else created_at

        if order_type == "pickup":
            pt = pickup_time or (datetime.now(timezone.utc) + timedelta(hours=1))
            payload["pickup_time"] = pt.isoformat() if isinstance(pt, datetime) else pt
        elif order_type == "delivery" and delivery_address:
            payload["delivery_address"] = delivery_address
            if delivery_fee is not None:
                payload["delivery_fee"] = delivery_fee
        elif order_type == "dine_in" and table_id:
            payload["table_id"] = table_id

        # Apply discount (voucher OR reward, not both)
        if voucher_code:
            payload["voucher_code"] = voucher_code
        elif reward_redemption_code:
            payload["reward_redemption_code"] = reward_redemption_code

        # Place order (status=pending, discount applied)
        resp = api_post("/orders", token=tok, json=payload)
        if resp.status_code == 401:
            return "auth_error", tok, None, None
        if resp.status_code not in (200, 201):
            return "place_failed", tok, resp.text[:200], None

        order = resp.json()
        order_id = order.get("id")
        total = order.get("total", 0)

        points_earned = None

        if pay_and_complete:
            # Step 4: Payment - create intent → confirm → points awarded at payment
            intent_resp = api_post("/payments/create-intent", token=tok,
                                  json={"order_id": order_id, "method": "wallet"})
            if intent_resp.status_code in (200, 201):
                payment_id = intent_resp.json().get("payment_id")
                if payment_id:
                    confirm_resp = api_post("/payments/confirm", token=tok, json={"payment_id": payment_id})
                    if confirm_resp.status_code == 200:
                        points_earned = confirm_resp.json().get("points_earned", 0)
                        order["loyalty_points_earned"] = points_earned

            # Step 5: Status chain: paid → confirmed → preparing → ready → completed
            admin_tok = admin_token()
            completed_at = datetime.now(timezone.utc)
            if created_at:
                completed_at = created_at + timedelta(hours=2)

            status_chain = [
                ("paid", None),
                ("confirmed", None),
                ("preparing", None),
                ("ready", None),
                ("completed", completed_at.isoformat() if completed_at else None),
            ]

            for new_status, completed_ts in status_chain:
                status_payload = {"status": new_status}
                if completed_ts:
                    status_payload["completed_at"] = completed_ts
                status_resp = api_patch(f"/orders/{order_id}/status", token=admin_tok, json=status_payload)
                if status_resp.status_code == 200:
                    order["status"] = new_status

        return "success", tok, order, points_earned

    result, tok, order_data, points = do_place(token)

    # Re-auth if needed
    if result == "auth_error" and customer:
        _, new_token = re_auth_customer(customer)
        if new_token:
            customer["token"] = new_token
            result, tok, order_data, points = do_place(new_token)

    if result == "success":
        return (order_data.get("id"), order_data.get("total", 0), points, order_data)
    return (None, None, None, None)


if __name__ == "__main__":
    print("helper_seed_place_order.py - Helper function for placing orders")
    print("Usage: from helper_seed_place_order import place_order_for_customer, get_global_menu_items")
    print()
    print("Examples:")
    print("  # Pickup order")
    print("  order_id, total, points, data = place_order_for_customer(")
    print("      customer={'user_id': 1, 'phone': '+6011...', 'token': 'eyJ...'},")
    print("      menu_items=menu,")
    print("      fulfillment_store_id=2,")
    print("      order_type='pickup'")
    print("  )")
    print()
    print("  # Delivery order")
    print("  order_id, total, points, data = place_order_for_customer(")
    print("      customer={'user_id': 1, 'phone': '+6011...', 'token': 'eyJ...'},")
    print("      menu_items=menu,")
    print("      fulfillment_store_id=2,")
    print("      order_type='delivery',")
    print("      delivery_address={'address': '123 Jalan Ampang', 'lat': 3.1528, 'lng': 101.7115},")
    print("      delivery_fee=12.50")
    print("  )")
    print()
    print("  # Dine-in order")
    print("  order_id, total, points, data = place_order_for_customer(")
    print("      customer={'user_id': 1, 'phone': '+6011...', 'token': 'eyJ...'},")
    print("      menu_items=menu,")
    print("      fulfillment_store_id=2,")
    print("      order_type='dine_in',")
    print("      table_id=5")
    print("  )")
    print()
    print("Key points:")
    print("  - NEW FLOW: discount at order creation, points at payment confirmation")
    print("  - voucher_code OR reward_redemption_code for discount (mutually exclusive)")
    print("  - Status chain: pending → paid → confirmed → preparing → ready → completed")
    print("  - Points earned returned from payment confirm, not from completion")