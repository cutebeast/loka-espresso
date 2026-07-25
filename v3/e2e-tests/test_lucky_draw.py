"""E2E tests for the lucky draw draw types — free_daily and ticket_spend."""

import uuid

import httpx
import pytest


def _phone() -> str:
    return f"+6016{uuid.uuid4().int % 10**8:08d}"


@pytest.mark.asyncio
async def test_lucky_draw_free_daily_regression(
    client: httpx.AsyncClient, base_url: str, admin_headers: dict
):
    """Default campaign is free_daily; guest sees config, no tickets field set."""
    r = await client.get(f"{base_url}/lucky-draw/active")
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert data["draw_type"] == "free_daily"
    assert data["max_segments"] >= 2
    assert data["spins_per_day"] >= 1
    assert len(data["segments"]) >= 1
    assert data["tickets_available"] is None  # guest


@pytest.mark.asyncio
async def test_lucky_draw_max_segments_enforced(
    client: httpx.AsyncClient, base_url: str, admin_headers: dict
):
    """Segment creation is capped by campaign.max_segments."""
    # shrink cap to the current segment count, then one more add must 400
    r = await client.get(f"{base_url}/admin/lucky-draw/campaign", headers=admin_headers)
    campaign = r.json()["data"]
    cid = campaign["id"]
    r = await client.get(f"{base_url}/admin/lucky-draw/campaigns/{cid}/segments", headers=admin_headers)
    seg_count = len(r.json()["data"])
    r = await client.put(
        f"{base_url}/admin/lucky-draw/campaign/{cid}",
        headers=admin_headers,
        json={"max_segments": seg_count},
    )
    assert r.status_code == 200, r.text
    # any voucher definition works for the extra segment
    r = await client.get(f"{base_url}/admin/vouchers?per_page=1", headers=admin_headers)
    vd_id = r.json()["data"]["items"][0]["id"]
    r = await client.post(
        f"{base_url}/admin/lucky-draw/campaigns/{cid}/segments",
        headers=admin_headers,
        json={"voucher_definition_id": vd_id, "label": "Over Cap", "probability_weight": 1},
    )
    assert r.status_code == 400, r.text
    assert "at most" in r.json()["detail"]
    # restore cap
    r = await client.put(
        f"{base_url}/admin/lucky-draw/campaign/{cid}",
        headers=admin_headers,
        json={"max_segments": 8},
    )
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_lucky_draw_ticket_spend_flow(
    client: httpx.AsyncClient, base_url: str, admin_headers: dict, staff_headers: dict
):
    """ticket_spend: paid order earns floor(total/RM50) tickets; spins consume them."""
    r = await client.get(f"{base_url}/admin/lucky-draw/campaign", headers=admin_headers)
    cid = r.json()["data"]["id"]
    customer_id = None
    order_id = None
    spin_ids = []
    try:
        # switch to ticket_spend at RM 50
        r = await client.put(
            f"{base_url}/admin/lucky-draw/campaign/{cid}",
            headers=admin_headers,
            json={"draw_type": "ticket_spend", "spend_per_ticket_cents": 5000},
        )
        assert r.status_code == 200, r.text

        # fresh customer + RM 120 paid POS order → 2 tickets
        phone = _phone()
        r = await client.post(
            f"{base_url}/staff/customers/find-or-create",
            headers=staff_headers,
            json={"phone_number": phone, "display_name": "LD E2E"},
        )
        assert r.status_code == 201, r.text
        customer_id = r.json()["data"]["id"]

        # 10 × Espresso (RM 12) = RM 120, paid cash
        r = await client.get(f"{base_url}/menu/stores/1")
        espresso = next(i for i in r.json()["data"]["items"] if i["item_code"] == "CSC-ESPRESSO")
        r = await client.post(
            f"{base_url}/staff/pos/orders",
            headers=staff_headers,
            json={
                "order_type": "takeaway",
                "customer_id": customer_id,
                "line_items": [{"menu_item_id": espresso["id"], "quantity": 10}],
                "payment": {"method": "cash", "amount_tendered": 120},
            },
        )
        assert r.status_code == 201, r.text
        order_id = r.json()["data"]["order_id"] if "order_id" in r.json()["data"] else r.json()["data"]["id"]

        # customer sees 2 tickets
        r = await client.post(f"{base_url}/auth/login", json={"phone_number": phone, "otp_code": "000000"})
        token = r.json()["tokens"]["access_token"]
        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        r = await client.get(f"{base_url}/lucky-draw/active", headers=headers)
        assert r.json()["data"]["draw_type"] == "ticket_spend"
        assert r.json()["data"]["tickets_available"] == 2

        # spin 1 → 1 left; spin 2 → 0 left; spin 3 → 429
        r = await client.post(f"{base_url}/lucky-draw/spin", headers=headers)
        assert r.status_code == 200, r.text
        spin_ids.append(r.json()["data"]["segment"]["id"])
        assert r.json()["data"]["tickets_remaining"] == 1
        r = await client.post(f"{base_url}/lucky-draw/spin", headers=headers)
        assert r.status_code == 200, r.text
        assert r.json()["data"]["tickets_remaining"] == 0
        r = await client.post(f"{base_url}/lucky-draw/spin", headers=headers)
        assert r.status_code == 429

        # admin ticket stats reflect the consumption
        r = await client.get(f"{base_url}/admin/lucky-draw/campaigns/{cid}/ticket-stats", headers=admin_headers)
        stats = r.json()["data"]
        assert stats["tickets_issued"] >= 2
        assert stats["tickets_consumed"] >= 2
    finally:
        # restore default type
        await client.put(
            f"{base_url}/admin/lucky-draw/campaign/{cid}",
            headers=admin_headers,
            json={"draw_type": "free_daily"},
        )
        # direct cleanup of created rows
        from conftest import _get_database_url
        import psycopg2
        conn = psycopg2.connect(_get_database_url())
        cur = conn.cursor()
        if order_id:
            cur.execute("DELETE FROM lucky_draw_tickets WHERE order_id = %s", (order_id,))
        if customer_id:
            cur.execute("DELETE FROM lucky_draw_spins WHERE customer_id = %s", (customer_id,))
            cur.execute("DELETE FROM customer_vouchers WHERE customer_id = %s", (customer_id,))
            cur.execute("DELETE FROM loyalty_points_ledger WHERE customer_id = %s", (customer_id,))
            cur.execute("DELETE FROM loyalty_accounts WHERE customer_id = %s", (customer_id,))
        if order_id:
            cur.execute("DELETE FROM order_status_log WHERE order_id = %s", (order_id,))
            cur.execute("DELETE FROM order_line_items WHERE order_id = %s", (order_id,))
            cur.execute("DELETE FROM payments WHERE order_id = %s", (order_id,))
            cur.execute("DELETE FROM orders WHERE id = %s", (order_id,))
        if customer_id:
            cur.execute("DELETE FROM customers WHERE id = %s", (customer_id,))
        conn.commit()
        conn.close()
