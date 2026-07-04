"""E2E tests for refund endpoints."""

import pytest
import httpx
import uuid

pytestmark = [pytest.mark.admin]


@pytest.mark.asyncio
async def test_list_refunds(client: httpx.AsyncClient, admin_headers: dict, base_url: str, store_id: int):
    """Refund list endpoint returns a paginated response."""
    r = await client.get(f"{base_url}/admin/refunds?store_id={store_id}&per_page=20", headers=admin_headers)
    assert r.status_code == 200
    data = r.json()["data"]
    assert "items" in data
    assert "total" in data


@pytest.mark.asyncio
async def test_create_refund_for_wallet_payment(
    client: httpx.AsyncClient,
    admin_headers: dict,
    base_url: str,
    store_id: int,
    cleanup_registry: dict,
):
    """Admin can refund a captured wallet payment via POST /payments/{id}/refund."""
    # 1. Register customer
    ts = uuid.uuid4().hex[:16]
    reg = await client.post(f"{base_url}/auth/register", json={
        "email_address": f"refund-{ts}@example.com",
        "display_name": f"Refund Test {ts}",
    })
    assert reg.status_code == 201, f"Registration failed: {reg.text}"
    cleanup_registry["customers"].append({"id": reg.json()["user_id"]})
    token = reg.json()["tokens"]["access_token"]
    customer_id = reg.json()["user_id"]
    cust_headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    # 2. Get a menu item
    r_menu = await client.get(f"{base_url}/menu/stores/{store_id}")
    assert r_menu.status_code == 200
    items = r_menu.json()["data"]["items"]
    assert len(items) > 0, "Seed data must include menu items"
    item = items[0]

    # 3. Create cart and add item
    r_cart = await client.get(f"{base_url}/cart?store_id={store_id}", headers=cust_headers)
    assert r_cart.status_code == 200
    cart_data = r_cart.json()["data"]

    add_r = await client.post(
        f"{base_url}/cart/items?store_id={store_id}",
        headers=cust_headers,
        json={"menu_item_id": item["id"], "quantity": 1, "selected_modifiers": []},
    )
    assert add_r.status_code == 200, f"Add to cart failed: {add_r.text}"

    # 4. Create order
    r_order = await client.post(f"{base_url}/orders", headers=cust_headers, json={
        "store_id": store_id,
        "cart_id": cart_data["id"],
        "order_type": "takeaway",
        "fulfillment_type": "counter_pickup",
    })
    assert r_order.status_code == 201, f"Order creation failed: {r_order.text}"
    order = r_order.json()["data"]
    order_id = order["id"]
    cleanup_registry["orders"].append({"id": order_id})

    total_amount = order.get("total_amount", 0)
    if total_amount <= 0:
        pytest.skip("Order total is zero; cannot test refund")

    # 5. Top-up wallet and pay
    r_topup = await client.post(
        f"{base_url}/admin/wallets/topup",
        headers=admin_headers,
        json={"customer_id": customer_id, "amount": float(total_amount) + 10, "reason": "Refund test top-up"},
    )
    assert r_topup.status_code == 200, f"Wallet top-up failed: {r_topup.text}"

    r_pay = await client.post(
        f"{base_url}/admin/orders/{order_id}/wallet-payment",
        headers=admin_headers,
        json={"amount": float(total_amount)},
    )
    assert r_pay.status_code == 200, f"Wallet payment failed: {r_pay.text}"

    # 6. Find the captured payment
    r_payments = await client.get(
        f"{base_url}/payments?order_id={order_id}&per_page=10",
        headers=admin_headers,
    )
    assert r_payments.status_code == 200, f"Payment list failed: {r_payments.text}"
    payments = r_payments.json()["data"]["items"]
    captured = [p for p in payments if p["status"] == "captured"]
    assert len(captured) >= 1, "Expected a captured payment for the order"
    payment_id = captured[0]["id"]

    # 7. Refund the payment
    r_refund = await client.post(
        f"{base_url}/payments/{payment_id}/refund",
        headers=admin_headers,
        json={
            "amount": float(total_amount),
            "reason": "Customer changed mind",
            "reason_category": "customer_request",
        },
    )
    assert r_refund.status_code in (200, 201), f"Refund failed: {r_refund.text}"
    refund_data = r_refund.json()["data"]
    assert refund_data["amount"] == float(total_amount)
    assert refund_data["status"] in ("completed", "pending")

    # 8. Verify payment and order status
    r_payment_after = await client.get(
        f"{base_url}/payments?order_id={order_id}&status=refunded&per_page=10",
        headers=admin_headers,
    )
    assert r_payment_after.status_code == 200
    payments_after = r_payment_after.json()["data"]["items"]
    assert len(payments_after) >= 1, "Expected refunded payment"
    assert payments_after[0]["id"] == payment_id
    assert payments_after[0]["status"] == "refunded"
    assert payments_after[0]["refunded_amount"] == float(total_amount)

    r_order_after = await client.get(f"{base_url}/admin/orders/{order_id}", headers=admin_headers)
    assert r_order_after.status_code == 200
    order_after = r_order_after.json()["data"]
    assert order_after["payment_status"] == "refunded"
