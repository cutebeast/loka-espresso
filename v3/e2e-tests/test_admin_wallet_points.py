"""
E2E Test Suite: Wallet and Points Integrity

Covers:
  - Two concurrent wallet payments on the SAME order — only one should succeed
  - Two concurrent points adjustments on the same customer — maintain integrity
  - Wallet balance never goes negative (pay more than balance rejected)
"""

import asyncio
import pytest
import httpx
import uuid

pytestmark = [pytest.mark.admin]


# ═══════════════════════════════════════════════════════════════════════════
# Concurrent wallet payments on same order
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.slow
@pytest.mark.asyncio
async def test_concurrent_same_order_wallet_payments(
    client: httpx.AsyncClient, admin_headers: dict, base_url: str, store_id: int, cleanup_registry: dict
):
    """Two concurrent wallet payments on the SAME order: only one succeeds.

    The backend uses SELECT ... FOR UPDATE on wallet rows, so only one
    of the two concurrent debits should succeed. The second should
    receive a 400/409 or 500 (due to deadlock or insufficient balance).
    """
    ts = uuid.uuid4().hex[:16]
    email = f"same-ord-{ts}@example.com"

    # Register customer
    reg = await client.post(f"{base_url}/auth/register", json={
        "email_address": email,
        "display_name": f"SameOrder {ts}",
    })
    assert reg.status_code == 201, f"Registration failed: {reg.text}"
    customer_id = reg.json()["user_id"]
    cleanup_registry["customers"].append({"id": customer_id})
    token = reg.json()["tokens"]["access_token"]
    cust_headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    # Top up wallet with enough balance for two payments
    r_topup = await client.post(
        f"{base_url}/admin/wallets/topup",
        headers=admin_headers,
        json={"customer_id": customer_id, "amount": 100.00, "reason": "Concurrent same-order test"},
    )
    if r_topup.status_code != 200:
        pytest.skip(f"Wallet topup failed: {r_topup.text}")
    cleanup_registry["wallet_topups"].append({"customer_id": customer_id, "amount": 100.00})

    initial_balance = r_topup.json()["data"]["new_balance"]

    # Get menu item and create a single order
    r_menu = await client.get(f"{base_url}/menu/stores/{store_id}")
    assert r_menu.status_code == 200
    items = r_menu.json()["data"]["items"]
    assert len(items) > 0, "Seed data must include menu items"
    item = items[0]

    r_add = await client.post(f"{base_url}/cart/items?store_id={store_id}", headers=cust_headers, json={
        "menu_item_id": item["id"],
        "quantity": 1,
        "selected_modifiers": [],
    })
    assert r_add.status_code == 200

    r_cart = await client.get(f"{base_url}/cart?store_id={store_id}", headers=cust_headers)
    assert r_cart.status_code == 200
    cart_id = r_cart.json()["data"]["id"]

    r_order = await client.post(f"{base_url}/orders", headers=cust_headers, json={
        "store_id": store_id,
        "cart_id": cart_id,
        "order_type": "takeaway",
        "fulfillment_type": "counter_pickup",
    })
    assert r_order.status_code == 201, f"Order creation failed: {r_order.text}"
    order_data = r_order.json()["data"]
    order_id = order_data["id"]
    payment_amount = float(order_data["total_amount"])
    cleanup_registry["orders"].append({"id": order_id})

    # Run two concurrent wallet payments on the SAME order
    async def wallet_pay(order_id: int, amount: float):
        async with httpx.AsyncClient(timeout=30.0) as c:
            r = await c.post(
                f"{base_url}/admin/orders/{order_id}/wallet-payment",
                headers=admin_headers,
                json={"amount": amount},
            )
            return r.status_code, r.json() if r.status_code == 200 else r.text

    r1_result, r2_result = await asyncio.gather(
        wallet_pay(order_id, payment_amount),
        wallet_pay(order_id, payment_amount),
    )

    status1, _ = r1_result
    status2, _ = r2_result

    # At least one must succeed (200); the other should fail (400/409/500)
    success_count = int(status1 == 200) + int(status2 == 200)
    assert success_count == 1, (
        f"Expected exactly 1 successful payment, got {success_count}: "
        f"status1={status1}, status2={status2}"
    )

    # Verify final balance
    r_detail = await client.get(f"{base_url}/admin/customers/{customer_id}", headers=admin_headers)
    assert r_detail.status_code == 200
    wallet_data = r_detail.json()["data"].get("wallet")
    current_balance = wallet_data["balance"] if wallet_data else 0
    # Only one payment should have been deducted
    assert abs(current_balance - (initial_balance - payment_amount)) < 0.01, (
        f"Balance mismatch: expected ~{initial_balance - payment_amount}, got {current_balance}"
    )


# ═══════════════════════════════════════════════════════════════════════════
# Concurrent points adjustments on same customer
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.slow
@pytest.mark.asyncio
async def test_concurrent_points_adjustment(
    client: httpx.AsyncClient, admin_headers: dict, base_url: str, store_id: int, cleanup_registry: dict
):
    """Two concurrent points adjustments on the same customer maintain integrity.

    The final points balance should equal initial + sum of adjustment amounts
    that succeeded, not double-count or miss an adjustment.
    """
    # Get a customer with loyalty account
    r = await client.get(        f"{base_url}/admin/customers?per_page=10", headers=admin_headers)
    assert r.status_code == 200
    customers = r.json()["data"]["items"]
    if not customers:
        pytest.skip("No customers in seed data")

    # Find a customer with a loyalty account
    customer_id = None
    for cust in customers:
        r_detail = await client.get(f"{base_url}/admin/customers/{cust['id']}", headers=admin_headers)
        if r_detail.status_code == 200:
            loyalty = r_detail.json()["data"].get("loyalty")
            if loyalty and loyalty.get("points_balance") is not None:
                customer_id = cust["id"]
                initial_points = loyalty["points_balance"]
                break

    if customer_id is None:
        pytest.skip("No customer with loyalty account found")

    # Run two concurrent points adjustments
    async def adjust_points(cust_id: int, points: int):
        async with httpx.AsyncClient(timeout=30.0) as c:
            r = await c.post(
                f"{base_url}/admin/customers/{cust_id}/adjust-points",
                headers=admin_headers,
                json={"points": points, "reason": "E2E concurrent test"},
            )
            return r.status_code, r.json() if r.status_code == 200 else None

    adj_amount = 10
    r1_result, r2_result = await asyncio.gather(
        adjust_points(customer_id, adj_amount),
        adjust_points(customer_id, adj_amount),
    )

    status1, data1 = r1_result
    status2, data2 = r2_result

    # Both should succeed since points adjustments are additive
    assert status1 == 200, f"First points adjustment failed: {r1_result}"
    assert status2 == 200, f"Second points adjustment failed: {r2_result}"

    # Verify final balance
    r_detail = await client.get(f"{base_url}/admin/customers/{customer_id}", headers=admin_headers)
    assert r_detail.status_code == 200
    loyalty = r_detail.json()["data"].get("loyalty")
    final_points = loyalty["points_balance"] if loyalty else 0
    expected = initial_points + (adj_amount * 2)
    assert final_points == expected, (
        f"Points integrity violated: expected {expected}, got {final_points}"
    )

    # Register cleanup for reversal
    cleanup_registry.setdefault("point_adjustments", []).append(
        {"customer_id": customer_id, "points": adj_amount * 2}
    )


# ═══════════════════════════════════════════════════════════════════════════
# Wallet balance never negative
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_wallet_balance_never_negative(
    client: httpx.AsyncClient, admin_headers: dict, base_url: str, store_id: int, cleanup_registry: dict
):
    """Paying more than wallet balance is rejected with 400."""
    ts = uuid.uuid4().hex[:16]
    email = f"neg-wallet-{ts}@example.com"

    # Register customer
    reg = await client.post(f"{base_url}/auth/register", json={
        "email_address": email,
        "display_name": f"NegWallet {ts}",
    })
    assert reg.status_code == 201, f"Registration failed: {reg.text}"
    customer_id = reg.json()["user_id"]
    cleanup_registry["customers"].append({"id": customer_id})
    token = reg.json()["tokens"]["access_token"]
    cust_headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    # Top up with a small amount
    topup_amount = 10.00
    r_topup = await client.post(
        f"{base_url}/admin/wallets/topup",
        headers=admin_headers,
        json={"customer_id": customer_id, "amount": topup_amount, "reason": "Negative wallet test"},
    )
    if r_topup.status_code != 200:
        pytest.skip(f"Wallet topup failed: {r_topup.text}")
    cleanup_registry["wallet_topups"].append({"customer_id": customer_id, "amount": topup_amount})

    # Create an order
    r_menu = await client.get(f"{base_url}/menu/stores/{store_id}")
    assert r_menu.status_code == 200
    items = r_menu.json()["data"]["items"]
    assert len(items) > 0, "Seed data must include menu items"
    item = items[0]

    r_add = await client.post(f"{base_url}/cart/items?store_id={store_id}", headers=cust_headers, json={
        "menu_item_id": item["id"],
        "quantity": 1,
        "selected_modifiers": [],
    })
    assert r_add.status_code == 200

    r_cart = await client.get(f"{base_url}/cart?store_id={store_id}", headers=cust_headers)
    assert r_cart.status_code == 200
    cart_id = r_cart.json()["data"]["id"]

    r_order = await client.post(f"{base_url}/orders", headers=cust_headers, json={
        "store_id": store_id,
        "cart_id": cart_id,
        "order_type": "takeaway",
        "fulfillment_type": "counter_pickup",
    })
    assert r_order.status_code == 201
    order_id = r_order.json()["data"]["id"]
    cleanup_registry["orders"].append({"id": order_id})

    # Attempt to pay more than wallet balance
    excess_amount = topup_amount + 100.00
    r_pay = await client.post(
        f"{base_url}/admin/orders/{order_id}/wallet-payment",
        headers=admin_headers,
        json={"amount": excess_amount},
    )
    assert r_pay.status_code == 400, (
        f"Expected 400 for insufficient balance, got {r_pay.status_code}: {r_pay.text}"
    )
    assert "Insufficient" in r_pay.text or "insufficient" in r_pay.text, (
        f"Expected 'Insufficient' in error message, got: {r_pay.text}"
    )
