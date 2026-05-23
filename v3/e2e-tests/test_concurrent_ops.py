"""E2E tests for concurrent operations and double-entry integrity.

Tests concurrent wallet payments to verify ledger integrity is maintained.
"""

import asyncio
import pytest
import httpx
import uuid

pytestmark = [pytest.mark.admin]


# ═══════════════════════════════════════════════════════════════════════════
# Concurrent Wallet Payments
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.slow
@pytest.mark.asyncio
async def test_concurrent_wallet_payments_integrity(
    client: httpx.AsyncClient, admin_headers: dict, base_url: str, store_id: int, cleanup_registry: dict
):
    """Two simultaneous wallet payments on the same customer maintain double-entry integrity."""
    # Register a customer and give them wallet balance
    ts = uuid.uuid4().hex[:16]
    reg = await client.post(f"{base_url}/auth/register", json={
        "email_address": f"conc-test-{ts}@example.com",
        "display_name": f"Concurrent Test {ts}",
    })
    assert reg.status_code == 201
    customer_id = reg.json()["user_id"]
    cleanup_registry["customers"].append({"id": customer_id})
    customer_token = reg.json()["tokens"]["access_token"]
    cust_headers = {"Authorization": f"Bearer {customer_token}", "Content-Type": "application/json"}

    # Top up wallet via admin
    r_topup = await client.post(
        f"{base_url}/admin/wallets/topup",
        headers=admin_headers,
        json={"customer_id": customer_id, "amount": 100.00, "reason": "Concurrent test setup"},
    )
    assert r_topup.status_code == 200
    cleanup_registry["wallet_topups"].append({"customer_id": customer_id, "amount": 100.00})
    initial_balance = r_topup.json()["data"]["new_balance"]

    # Get a menu item for orders
    r_menu = await client.get(f"{base_url}/menu/stores/{store_id}")
    assert r_menu.status_code == 200
    items = r_menu.json()["data"]["items"]
    if len(items) < 2:
        pytest.skip("Not enough menu items for concurrent test")
    item_1 = items[0]
    item_2 = items[1]

    async def create_and_pay_order(item_id: int, amount: float) -> int:
        """Create an order, add item, and pay via wallet — all in one flow."""
        async with httpx.AsyncClient(timeout=30.0) as c:
            # Add to cart
            r = await c.post(
                f"{base_url}/cart/items?store_id={store_id}",
                headers=cust_headers,
                json={"menu_item_id": item_id, "quantity": 1, "selected_modifiers": []},
            )
            assert r.status_code == 200, f"Add cart failed: {r.text}"
            cart_r = await c.get(f"{base_url}/cart?store_id={store_id}", headers=cust_headers)
            cart_id = cart_r.json()["data"]["id"]

            # Create order
            r2 = await c.post(f"{base_url}/orders", headers=cust_headers, json={
                "store_id": store_id,
                "cart_id": cart_id,
                "order_type": "takeaway",
                "fulfillment_type": "counter_pickup",
            })
            assert r2.status_code == 201, f"Order create failed: {r2.text}"
            return r2.json()["data"]["id"]

    # Create two orders serially first (to have them ready)
    order_ids = []
    for item in [item_1, item_2]:
        oid = await create_and_pay_order(item["id"], 10.00)
        order_ids.append(oid)

    # Now run two wallet payments concurrently against both orders
    async def wallet_pay(order_id: int, amount: float):
        async with httpx.AsyncClient(timeout=30.0) as c:
            r = await c.post(
                f"{base_url}/admin/orders/{order_id}/wallet-payment",
                headers=admin_headers,
                json={"amount": amount},
            )
            return r.status_code, r.json() if r.status_code == 200 else None

    r1, r2 = await asyncio.gather(
        wallet_pay(order_ids[0], 30.00),
        wallet_pay(order_ids[1], 40.00),
    )

    status1, _ = r1
    status2, _ = r2
    assert status1 == 200, f"First wallet payment failed: {r1}"
    assert status2 == 200, f"Second wallet payment failed: {r2}"

    # Verify final balance — total deducted should equal 70.00
    r_detail = await client.get(f"{base_url}/admin/customers/{customer_id}", headers=admin_headers)
    assert r_detail.status_code == 200
    wallet_data = r_detail.json()["data"].get("wallet")
    current_balance = wallet_data["balance"] if wallet_data else 0.0
    # Allow for rounding tolerance
    assert abs(current_balance - (initial_balance - 70.00)) < 0.01, \
        f"Balance mismatch after concurrent payments: expected ~{initial_balance - 70.00}, got {current_balance}"

    # Cleanup orders
    for oid in order_ids:
        cleanup_registry["orders"].append({"id": oid})
