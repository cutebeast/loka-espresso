"""E2E tests for payment-provider webhooks (Stripe).

These tests use the backend's configured Stripe test credentials, so the
payment intent created is a real Stripe test object. Synthetic webhook events
are signed with the configured webhook secret so they pass signature
verification in development.
"""

import uuid

import pytest
import httpx

from conftest import _get_stripe_webhook_secret, sign_stripe_webhook_payload


@pytest.fixture(scope="session")
def stripe_webhook_secret() -> str:
    """Return the Stripe webhook secret configured in the backend DB."""
    secret = _get_stripe_webhook_secret()
    if not secret:
        pytest.skip("Stripe webhook secret is not configured")
    return secret


@pytest.mark.asyncio
async def test_stripe_webhook_captures_order_payment(
    client: httpx.AsyncClient,
    admin_headers: dict,
    base_url: str,
    store_id: int,
    cleanup_registry: dict,
    stripe_webhook_secret: str,
):
    """A synthetic Stripe payment_intent.succeed webhook marks the order as captured."""
    # 1. Register customer
    ts = uuid.uuid4().hex[:16]
    reg = await client.post(
        f"{base_url}/auth/register",
        json={
            "email_address": f"webhook-payment-{ts}@example.com",
            "display_name": f"Webhook Payment Test {ts}",
        },
    )
    assert reg.status_code == 201
    cleanup_registry["customers"].append({"id": reg.json()["user_id"]})
    token = reg.json()["tokens"]["access_token"]
    cust_headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    # 2. Get a menu item
    r_menu = await client.get(f"{base_url}/menu/stores/{store_id}")
    assert r_menu.status_code == 200
    items = r_menu.json()["data"]["items"]
    assert len(items) > 0
    item = items[0]

    # 3. Create cart and add item
    r_cart = await client.get(f"{base_url}/cart?store_id={store_id}", headers=cust_headers)
    assert r_cart.status_code == 200
    cart_id = r_cart.json()["data"]["id"]

    r_add = await client.post(
        f"{base_url}/cart/items?store_id={store_id}",
        headers=cust_headers,
        json={
            "menu_item_id": item["id"],
            "quantity": 1,
            "selected_modifiers": [],
        },
    )
    assert r_add.status_code == 200

    # 4. Create order
    r_order = await client.post(
        f"{base_url}/orders",
        headers=cust_headers,
        json={
            "store_id": store_id,
            "cart_id": cart_id,
            "order_type": "takeaway",
            "fulfillment_type": "counter_pickup",
        },
    )
    assert r_order.status_code == 201
    order = r_order.json()["data"]
    order_id = order["id"]
    cleanup_registry["orders"].append({"id": order_id})

    # 5. Create Stripe payment intent
    r_intent = await client.post(
        f"{base_url}/payments/intent",
        headers=cust_headers,
        json={
            "order_id": order_id,
            "provider": "stripe",
            "payment_method": "gateway",
        },
    )
    assert r_intent.status_code == 201, f"Payment intent failed: {r_intent.text}"
    intent = r_intent.json()["data"]
    payment_id = intent["payment_id"]

    # 6. Fetch payment to obtain the simulated Stripe transaction id
    r_payment = await client.get(f"{base_url}/payments/{payment_id}", headers=cust_headers)
    assert r_payment.status_code == 200
    payment = r_payment.json()["data"]
    assert payment["provider"] == "stripe"
    tx_id = payment["provider_transaction_id"]
    assert tx_id and tx_id.startswith("pi_")

    amount_cents = int(float(payment["amount"]) * 100)

    # 7. Send synthetic Stripe webhook
    payload = {
        "object": "event",
        "type": "payment_intent.succeeded",
        "data": {
            "object": {
                "id": tx_id,
                "amount_received": amount_cents,
                "currency": payment["currency_code"].lower(),
            }
        },
    }
    r_webhook = await client.post(
        f"{base_url}/webhooks/stripe",
        json=payload,
        headers={"Stripe-Signature": sign_stripe_webhook_payload(payload, stripe_webhook_secret)},
    )
    assert r_webhook.status_code == 200, f"Webhook failed: {r_webhook.text}"

    # 8. Verify payment captured
    r_payment_after = await client.get(f"{base_url}/payments/{payment_id}", headers=cust_headers)
    assert r_payment_after.status_code == 200
    payment_after = r_payment_after.json()["data"]
    assert payment_after["status"] == "captured"

    # 9. Verify order payment status captured
    r_order_after = await client.get(f"{base_url}/admin/orders/{order_id}", headers=admin_headers)
    assert r_order_after.status_code == 200
    order_after = r_order_after.json()["data"]
    assert order_after["payment_status"] == "captured"


@pytest.mark.asyncio
async def test_stripe_webhook_credits_wallet_topup(
    client: httpx.AsyncClient,
    admin_headers: dict,
    base_url: str,
    cleanup_registry: dict,
    stripe_webhook_secret: str,
):
    """A synthetic Stripe checkout.session.completed webhook credits a wallet top-up."""
    # 1. Register customer
    ts = uuid.uuid4().hex[:16]
    reg = await client.post(
        f"{base_url}/auth/register",
        json={
            "email_address": f"webhook-topup-{ts}@example.com",
            "display_name": f"Webhook Top-up Test {ts}",
        },
    )
    assert reg.status_code == 201
    customer_id = reg.json()["user_id"]
    cleanup_registry["customers"].append({"id": customer_id})
    token = reg.json()["tokens"]["access_token"]
    cust_headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    # 2. Get wallet balance before
    r_wallet_before = await client.get(f"{base_url}/wallet/me", headers=cust_headers)
    assert r_wallet_before.status_code == 200
    balance_before = float(r_wallet_before.json()["data"].get("balance", 0))

    # 3. Create wallet top-up checkout session
    r_topup = await client.post(
        f"{base_url}/wallet/topup/checkout",
        headers=cust_headers,
        json={"amount": 25.00, "return_url": "https://app.example.com/#wallet"},
    )
    assert r_topup.status_code == 201, f"Top-up checkout failed: {r_topup.text}"
    topup = r_topup.json()["data"]
    session_id = topup["session_id"]
    checkout_session_id = topup.get("checkout_session_id") or topup.get("session_id")

    # 4. Send synthetic Stripe checkout.session.completed webhook
    payload = {
        "object": "event",
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "id": f"cs_test_{uuid.uuid4().hex}",
                "amount_total": 2500,
                "currency": "myr",
                "payment_intent": f"pi_test_{uuid.uuid4().hex}",
                "metadata": {"wallet_topup_session_id": str(session_id)},
            }
        },
    }
    r_webhook = await client.post(
        f"{base_url}/webhooks/stripe",
        json=payload,
        headers={"Stripe-Signature": sign_stripe_webhook_payload(payload, stripe_webhook_secret)},
    )
    assert r_webhook.status_code == 200, f"Webhook failed: {r_webhook.text}"

    # 5. Verify wallet credited
    r_wallet_after = await client.get(f"{base_url}/wallet/me", headers=cust_headers)
    assert r_wallet_after.status_code == 200
    balance_after = float(r_wallet_after.json()["data"].get("balance", 0))
    assert balance_after == pytest.approx(balance_before + 25.00, rel=1e-4)

    cleanup_registry["wallet_topups"].append({"customer_id": customer_id, "amount": 25.00})
