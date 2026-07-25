"""E2E tests for POS workshop sales — customer find-or-create by phone and
session-guarded workshop line items at the staff POS."""

import uuid
from datetime import date, timedelta

import httpx
import pytest


def _uniq(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


@pytest.mark.asyncio
async def test_staff_find_or_create_customer(
    client: httpx.AsyncClient, base_url: str, staff_headers: dict, admin_headers: dict
):
    phone_local = "012" + uuid.uuid4().hex[:7].replace("a", "1").replace("b", "2").replace("c", "3").replace("d", "4").replace("e", "5").replace("f", "6")
    created_id = None
    try:
        # Create via local Malaysian format
        r = await client.post(
            f"{base_url}/staff/customers/find-or-create",
            headers=staff_headers,
            json={"phone_number": phone_local, "display_name": "E2E Walkin"},
        )
        assert r.status_code == 201, r.text
        data = r.json()["data"]
        created_id = data["id"]
        assert data["created"] is True
        assert data["phone_number"].startswith("+6")

        # Same phone in +60 format → found, not duplicated
        r = await client.post(
            f"{base_url}/staff/customers/find-or-create",
            headers=staff_headers,
            json={"phone_number": data["phone_number"], "display_name": "Other Name"},
        )
        assert r.status_code == 201, r.text
        again = r.json()["data"]
        assert again["id"] == created_id
        assert again["created"] is False

        # Invalid phone → 4xx
        r = await client.post(
            f"{base_url}/staff/customers/find-or-create",
            headers=staff_headers,
            json={"phone_number": "12", "display_name": "X"},
        )
        assert r.status_code in (400, 422)
    finally:
        if created_id:
            await client.delete(f"{base_url}/admin/customers/{created_id}", headers=admin_headers)


@pytest.mark.asyncio
async def test_pos_workshop_order_guards(
    client: httpx.AsyncClient, base_url: str, staff_headers: dict, admin_headers: dict
):
    """Workshop lines at POS require a session AND an attached customer."""
    # Use the seeded workshop item (Turkish Sand Brew Workshop)
    r = await client.get(f"{base_url}/menu/stores/1")
    assert r.status_code == 200
    items = r.json()["data"]["items"]
    workshop = next(i for i in items if i["item_code"] == "EX-TURKISH-SAND-BREW")

    # Future session for it
    future = (date.today() + timedelta(days=3)).isoformat()
    r = await client.post(
        f"{base_url}/admin/menu/items/{workshop['id']}/sessions",
        headers=admin_headers,
        json={"session_date": future, "start_time": "10:00", "capacity": 2, "location": "E2E"},
    )
    assert r.status_code in (200, 201), r.text
    session_id = r.json()["data"]["id"]

    customer_id = None
    order_id = None
    try:
        # 1) workshop without customer → 400
        r = await client.post(
            f"{base_url}/staff/pos/orders",
            headers=staff_headers,
            json={"order_type": "takeaway", "line_items": [{"menu_item_id": workshop["id"], "quantity": 1, "class_session_id": session_id}]},
        )
        assert r.status_code == 400, r.text
        assert "customer" in r.json()["detail"].lower()

        # 2) workshop with customer but no session → 400
        r = await client.post(
            f"{base_url}/staff/customers/find-or-create",
            headers=staff_headers,
            json={"phone_number": f"016{uuid.uuid4().int % 10**8:08d}", "display_name": "E2E POS Guest"},
        )
        assert r.status_code == 201, r.text
        customer_id = r.json()["data"]["id"]

        r = await client.post(
            f"{base_url}/staff/pos/orders",
            headers=staff_headers,
            json={"order_type": "takeaway", "customer_id": customer_id, "line_items": [{"menu_item_id": workshop["id"], "quantity": 1}]},
        )
        assert r.status_code == 400, r.text
        assert "session" in r.json()["detail"].lower()

        # 3) customer + session → 201, seats consumed
        r = await client.post(
            f"{base_url}/staff/pos/orders",
            headers=staff_headers,
            json={"order_type": "takeaway", "customer_id": customer_id, "line_items": [{"menu_item_id": workshop["id"], "quantity": 2, "class_session_id": session_id}]},
        )
        assert r.status_code == 201, r.text
        order_id = r.json()["data"]["order_id"] if "order_id" in r.json()["data"] else r.json()["data"]["id"]

        r = await client.get(f"{base_url}/admin/menu/items/{workshop['id']}/sessions", headers=admin_headers)
        sess = next(s for s in (r.json()["data"] if isinstance(r.json()["data"], list) else []) if s["id"] == session_id)
        assert sess["booked_pax"] == 2

        # 4) capacity guard — session full now
        r = await client.post(
            f"{base_url}/staff/pos/orders",
            headers=staff_headers,
            json={"order_type": "takeaway", "customer_id": customer_id, "line_items": [{"menu_item_id": workshop["id"], "quantity": 1, "class_session_id": session_id}]},
        )
        assert r.status_code == 400, r.text
        assert "seats" in r.json()["detail"].lower()

        # 5) cancel → seats released
        r = await client.post(f"{base_url}/staff/orders/{order_id}/cancel", headers=staff_headers, json={"reason": "e2e"})
        assert r.status_code == 200, r.text
        r = await client.get(f"{base_url}/admin/menu/items/{workshop['id']}/sessions", headers=admin_headers)
        sess = next(s for s in (r.json()["data"] if isinstance(r.json()["data"], list) else []) if s["id"] == session_id)
        assert sess["booked_pax"] == 0
    finally:
        await client.delete(f"{base_url}/admin/class-sessions/{session_id}", headers=admin_headers)
        if customer_id:
            await client.delete(f"{base_url}/admin/customers/{customer_id}", headers=admin_headers)
        # cancelled order + lines are audit records; remove test residue directly
        if order_id:
            from conftest import _get_database_url
            import psycopg2
            conn = psycopg2.connect(_get_database_url())
            cur = conn.cursor()
            for stmt in (
                f"DELETE FROM loyalty_points_ledger WHERE order_id={order_id}",
                f"DELETE FROM order_status_log WHERE order_id={order_id}",
                f"DELETE FROM order_line_items WHERE order_id={order_id}",
                f"DELETE FROM payments WHERE order_id={order_id}",
                f"DELETE FROM orders WHERE id={order_id}",
            ):
                cur.execute(stmt)
            conn.commit()
            conn.close()
