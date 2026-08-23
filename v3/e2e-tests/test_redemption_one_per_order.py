"""E2E: one-voucher-OR-one-reward golden rule (flow doc §2A).

Pins the three hard guards:
1. Customer order-create with BOTH voucher_code + reward_id → 400, and
   neither the voucher nor the reward is consumed (both stay active).
2. Staff apply-voucher → 200, then apply-reward → 400 (voucher stays applied).
3. Staff apply-reward → 200, then apply-voucher → 400 (reward stays applied).
"""

import random
import uuid
from datetime import datetime, timedelta, timezone

import httpx
import pytest


def _unique_suffix() -> str:
    return uuid.uuid4().hex[:8]


async def _register_customer(client, base_url, cleanup_registry):
    email = f"e2e-redemption-{_unique_suffix()}@test.com"
    r = await client.post(f"{base_url}/auth/register", json={
        "email_address": email,
        "display_name": "E2E Redemption Customer",
        "device_fingerprint": f"e2e-redemption-device-{_unique_suffix()}",
    })
    assert r.status_code in (200, 201), f"register failed: {r.text}"
    data = r.json()
    customer_id = data["user_id"]
    token = data["tokens"]["access_token"]
    cleanup_registry["customers"].append({"id": customer_id})
    return {
        "id": customer_id,
        "headers": {"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
    }


async def _award_voucher(client, base_url, admin_headers, customer_id):
    now = datetime.now(timezone.utc)
    voucher_code = f"E2E{uuid.uuid4().hex[:8].upper()}"
    r = await client.post(f"{base_url}/admin/vouchers", headers=admin_headers, json={
        "voucher_type": "fixed_amount_off",
        "display_title": "E2E Redemption Voucher",
        "discount_value": 5.0,
        "minimum_order_value": 0.0,
        "is_active": True,
        "voucher_code": voucher_code,
        "scope": "global",
        "valid_from": now.isoformat(),
        "valid_until": (now + timedelta(days=7)).isoformat(),
    })
    assert r.status_code in (200, 201), f"voucher create failed: {r.text}"
    vd_id = r.json().get("data", {}).get("id")

    r2 = await client.post(
        f"{base_url}/admin/customers/{customer_id}/award-voucher",
        headers=admin_headers,
        json={"voucher_id": vd_id, "reason": "E2E redemption one-per-order"},
    )
    assert r2.status_code in (200, 201), f"award-voucher failed: {r2.text}"
    # The customer's redemption code (ADMIN-…) differs from the definition's
    # voucher_code — both the customer order-create and staff apply-voucher
    # endpoints match on CustomerVoucher.voucher_code.
    customer_voucher_code = r2.json().get("data", {}).get("voucher_code")
    assert customer_voucher_code, f"no voucher_code in award response: {r2.text}"
    return vd_id, customer_voucher_code


async def _redeem_reward(client, base_url, admin_headers, customer_id, cust_headers):
    r = await client.post(f"{base_url}/admin/rewards", headers=admin_headers, json={
        "reward_name": "E2E Redemption Reward",
        "reward_key": f"E2E-RWRD-{_unique_suffix()}",
        "reward_type": "fixed_discount",
        "points_cost": 10,
        "discount_value": 5.0,
        "minimum_order_value": 0.0,
        "is_active": True,
    })
    assert r.status_code in (200, 201), f"reward create failed: {r.text}"
    rc_id = r.json().get("data", {}).get("id")

    r2 = await client.post(
        f"{base_url}/admin/customers/{customer_id}/adjust-points",
        headers=admin_headers,
        json={"points": 100, "reason": "E2E redemption one-per-order"},
    )
    assert r2.status_code == 200, f"adjust-points failed: {r2.text}"

    r3 = await client.post(f"{base_url}/rewards/{rc_id}/redeem", headers=cust_headers)
    assert r3.status_code == 200, f"redeem failed: {r3.text}"
    reward_id = r3.json().get("data", {}).get("id")
    assert reward_id is not None, f"no reward id in redeem response: {r3.text}"
    return rc_id, reward_id


async def _pick_menu_item(client, base_url, store_id):
    r = await client.get(f"{base_url}/menu/items", params={"store_id": store_id, "limit": 50})
    assert r.status_code == 200, r.text
    items = r.json().get("data", {}).get("items", [])
    for item in items:
        price = float(item.get("base_price") or item.get("price") or 0)
        code = str(item.get("item_code") or "")
        if price > 0 and not code.startswith("EX-"):
            return item["id"]
    pytest.skip("No suitable menu item available")


async def _assert_wallet_active(client, base_url, admin_headers, customer_id):
    """Both the voucher and reward must still be active (nothing consumed)."""
    r = await client.get(f"{base_url}/admin/customers/{customer_id}/wallet", headers=admin_headers)
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    # This endpoint only lists ACTIVE vouchers (status filter) and active/reserved
    # rewards, so presence implies not-consumed.
    voucher_codes = {v.get("code") for v in (data.get("vouchers") or [])}
    reward_statuses = {str(v.get("id")): v.get("status") for v in (data.get("rewards") or [])}
    return voucher_codes, reward_statuses


# ---------------------------------------------------------------------------
# 1. Customer order-create: both voucher_code + reward_id → 400, none consumed
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_customer_order_with_both_voucher_and_reward_rejected(
    client, base_url, admin_headers, store_id, cleanup_registry
):
    cust = await _register_customer(client, base_url, cleanup_registry)
    vd_id, voucher_code = await _award_voucher(client, base_url, admin_headers, cust["id"])
    rc_id, reward_id = await _redeem_reward(
        client, base_url, admin_headers, cust["id"], cust["headers"]
    )

    try:
        item_id = await _pick_menu_item(client, base_url, store_id)
        r_cart = await client.post(
            f"{base_url}/cart/items?store_id={store_id}",
            headers=cust["headers"],
            json={"menu_item_id": item_id, "quantity": 2},
        )
        assert r_cart.status_code in (200, 201), f"add to cart failed: {r_cart.text}"

        r_order = await client.post(
            f"{base_url}/orders",
            headers=cust["headers"],
            json={
                "store_id": store_id,
                "order_type": "takeaway",
                "fulfillment_type": "counter_pickup",
                "voucher_code": voucher_code,
                "reward_id": reward_id,
            },
        )
        assert r_order.status_code == 400, f"expected 400, got {r_order.status_code}: {r_order.text}"
        assert "one voucher OR one reward" in r_order.text

        # Neither was consumed: both remain active in the wallet.
        voucher_codes, reward_statuses = await _assert_wallet_active(
            client, base_url, admin_headers, cust["id"]
        )
        assert voucher_code in voucher_codes, voucher_codes
        assert reward_statuses.get(str(reward_id)) == "active", reward_statuses
    finally:
        if vd_id:
            await client.delete(f"{base_url}/admin/vouchers/{vd_id}", headers=admin_headers)
        if rc_id:
            await client.delete(f"{base_url}/admin/rewards/{rc_id}", headers=admin_headers)


# ---------------------------------------------------------------------------
# 2. Staff: apply-voucher → 200, then apply-reward → 400
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_staff_apply_voucher_then_reward_rejected(
    client, base_url, admin_headers, staff_headers, store_id, cleanup_registry
):
    cust = await _register_customer(client, base_url, cleanup_registry)
    vd_id, voucher_code = await _award_voucher(client, base_url, admin_headers, cust["id"])
    rc_id, reward_id = await _redeem_reward(
        client, base_url, admin_headers, cust["id"], cust["headers"]
    )

    try:
        item_id = await _pick_menu_item(client, base_url, store_id)
        r_order = await client.post(
            f"{base_url}/staff/pos/orders",
            headers=staff_headers,
            json={
                "order_type": "takeaway",
                "customer_id": cust["id"],
                "line_items": [{"menu_item_id": item_id, "quantity": 2}],
            },
        )
        assert r_order.status_code in (200, 201), r_order.text
        order_id = r_order.json()["data"].get("order_id") or r_order.json()["data"]["id"]
        cleanup_registry["orders"].append({"id": order_id})

        r_apply_v = await client.post(
            f"{base_url}/staff/orders/{order_id}/apply-voucher",
            headers=staff_headers,
            json={"voucher_code": voucher_code},
        )
        assert r_apply_v.status_code == 200, r_apply_v.text

        r_apply_r = await client.post(
            f"{base_url}/staff/orders/{order_id}/apply-reward",
            headers=staff_headers,
            json={"reward_id": reward_id},
        )
        assert r_apply_r.status_code == 400, f"expected 400, got {r_apply_r.status_code}: {r_apply_r.text}"
        assert "one voucher OR one reward" in r_apply_r.text
    finally:
        if vd_id:
            await client.delete(f"{base_url}/admin/vouchers/{vd_id}", headers=admin_headers)
        if rc_id:
            await client.delete(f"{base_url}/admin/rewards/{rc_id}", headers=admin_headers)


# ---------------------------------------------------------------------------
# 3. Staff: apply-reward → 200, then apply-voucher → 400
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_staff_apply_reward_then_voucher_rejected(
    client, base_url, admin_headers, staff_headers, store_id, cleanup_registry
):
    cust = await _register_customer(client, base_url, cleanup_registry)
    vd_id, voucher_code = await _award_voucher(client, base_url, admin_headers, cust["id"])
    rc_id, reward_id = await _redeem_reward(
        client, base_url, admin_headers, cust["id"], cust["headers"]
    )

    try:
        item_id = await _pick_menu_item(client, base_url, store_id)
        r_order = await client.post(
            f"{base_url}/staff/pos/orders",
            headers=staff_headers,
            json={
                "order_type": "takeaway",
                "customer_id": cust["id"],
                "line_items": [{"menu_item_id": item_id, "quantity": 2}],
            },
        )
        assert r_order.status_code in (200, 201), r_order.text
        order_id = r_order.json()["data"].get("order_id") or r_order.json()["data"]["id"]
        cleanup_registry["orders"].append({"id": order_id})

        r_apply_r = await client.post(
            f"{base_url}/staff/orders/{order_id}/apply-reward",
            headers=staff_headers,
            json={"reward_id": reward_id},
        )
        assert r_apply_r.status_code == 200, r_apply_r.text

        r_apply_v = await client.post(
            f"{base_url}/staff/orders/{order_id}/apply-voucher",
            headers=staff_headers,
            json={"voucher_code": voucher_code},
        )
        assert r_apply_v.status_code == 400, f"expected 400, got {r_apply_v.status_code}: {r_apply_v.text}"
        assert "one voucher OR one reward" in r_apply_v.text
    finally:
        if vd_id:
            await client.delete(f"{base_url}/admin/vouchers/{vd_id}", headers=admin_headers)
        if rc_id:
            await client.delete(f"{base_url}/admin/rewards/{rc_id}", headers=admin_headers)


# ---------------------------------------------------------------------------
# 4. Admin: apply-voucher → 200, then apply-reward → 400 (same golden rule)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_admin_apply_voucher_then_reward_rejected(
    client, base_url, admin_headers, staff_headers, store_id, cleanup_registry
):
    cust = await _register_customer(client, base_url, cleanup_registry)
    vd_id, voucher_code = await _award_voucher(client, base_url, admin_headers, cust["id"])
    rc_id, reward_id = await _redeem_reward(
        client, base_url, admin_headers, cust["id"], cust["headers"]
    )

    try:
        item_id = await _pick_menu_item(client, base_url, store_id)
        r_order = await client.post(
            f"{base_url}/staff/pos/orders",
            headers=staff_headers,
            json={
                "order_type": "takeaway",
                "customer_id": cust["id"],
                "line_items": [{"menu_item_id": item_id, "quantity": 2}],
            },
        )
        assert r_order.status_code in (200, 201), r_order.text
        order_id = r_order.json()["data"].get("order_id") or r_order.json()["data"]["id"]
        cleanup_registry["orders"].append({"id": order_id})

        r_apply_v = await client.post(
            f"{base_url}/admin/orders/{order_id}/apply-voucher",
            headers=admin_headers,
            json={"voucher_code": voucher_code},
        )
        assert r_apply_v.status_code == 200, r_apply_v.text

        r_apply_r = await client.post(
            f"{base_url}/admin/orders/{order_id}/apply-reward",
            headers=admin_headers,
            json={"reward_id": reward_id},
        )
        assert r_apply_r.status_code == 400, f"expected 400, got {r_apply_r.status_code}: {r_apply_r.text}"
        assert "one voucher OR one reward" in r_apply_r.text
    finally:
        if vd_id:
            await client.delete(f"{base_url}/admin/vouchers/{vd_id}", headers=admin_headers)
        if rc_id:
            await client.delete(f"{base_url}/admin/rewards/{rc_id}", headers=admin_headers)
