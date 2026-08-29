"""E2E: admin books a workshop seat on behalf of a customer (VIP/management).

Workshops are PWA-only for self-service, but management can book a seat for a
customer directly from the admin portal — complimentary (no money) or cash.
"""

import uuid
from datetime import date, timedelta

import httpx
import pytest

from conftest import _get_database_url


def _payments_for(dsn: str, order_id: int):
    import psycopg2
    conn = psycopg2.connect(dsn)
    cur = conn.cursor()
    cur.execute("SELECT provider, status, amount FROM payments WHERE order_id = %s", (order_id,))
    rows = cur.fetchall()
    conn.close()
    return rows


def _cleanup_booking(dsn: str, order_ids: list[int], session_id: int):
    """Hard-delete probe bookings + release the session seat (seats are only
    released by cancel, which is blocked for captured-cash orders — so reset
    booked_pax directly for the test residue)."""
    import psycopg2
    conn = psycopg2.connect(dsn)
    cur = conn.cursor()
    for oid in order_ids:
        cur.execute("DELETE FROM payments WHERE order_id = %s", (oid,))
        cur.execute("DELETE FROM order_line_items WHERE order_id = %s", (oid,))
        cur.execute("DELETE FROM orders WHERE id = %s", (oid,))
    cur.execute("DELETE FROM class_sessions WHERE id = %s", (session_id,))
    conn.commit()
    conn.close()


@pytest.mark.asyncio
async def test_admin_books_workshop_for_customer(
    client: httpx.AsyncClient, base_url: str, admin_headers: dict, cleanup_registry
):
    dsn = _get_database_url()

    # workshop item + a future session
    r = await client.get(f"{base_url}/menu/stores/1")
    ws = next(i for i in r.json()["data"]["items"] if i["item_code"] == "EX-TURKISH-SAND-BREW")
    future = (date.today() + timedelta(days=6)).isoformat()
    r = await client.post(
        f"{base_url}/admin/menu/items/{ws['id']}/sessions",
        headers=admin_headers,
        json={"session_date": future, "start_time": "10:00", "capacity": 2, "location": "E2E admin booking"},
    )
    assert r.status_code in (200, 201), r.text
    session_id = r.json()["data"]["id"]

    # a real (non-walk-in) customer
    email = f"e2e-vip-{uuid.uuid4().hex[:8]}@test.com"
    reg = await client.post(f"{base_url}/auth/register", json={"email_address": email, "display_name": "E2E VIP"})
    assert reg.status_code == 201, reg.text
    customer_id = reg.json()["user_id"]
    ch = {"Authorization": f"Bearer {reg.json()['tokens']['access_token']}"}
    cleanup_registry["customers"].append({"id": customer_id})

    order_ids = []
    try:
        # 1) complimentary booking — confirmed, no payment, seat consumed, notified
        r = await client.post(
            f"{base_url}/admin/customers/{customer_id}/workshop-bookings",
            headers=admin_headers,
            json={"store_id": 1, "menu_item_id": ws["id"], "class_session_id": session_id,
                  "quantity": 1, "payment": "complimentary"},
        )
        assert r.status_code == 201, r.text
        oid = r.json()["data"]["order_id"]
        order_ids.append(oid)
        d = (await client.get(f"{base_url}/admin/orders/{oid}", headers=admin_headers)).json()["data"]
        assert d["status"] == "confirmed" and d["payment_status"] == "captured"
        assert d["total_amount"] > 0
        assert _payments_for(dsn, oid) == []  # complimentary = no money
        inbox = (await client.get(f"{base_url}/notifications/me", headers=ch)).json()["data"]["items"]
        assert any("confirmed" in (m["title"] or "").lower() for m in inbox)

        # 2) cash booking — captured cash payment
        r = await client.post(
            f"{base_url}/admin/customers/{customer_id}/workshop-bookings",
            headers=admin_headers,
            json={"store_id": 1, "menu_item_id": ws["id"], "class_session_id": session_id,
                  "quantity": 1, "payment": "cash"},
        )
        assert r.status_code == 201, r.text
        oid2 = r.json()["data"]["order_id"]
        order_ids.append(oid2)
        pmts = _payments_for(dsn, oid2)
        assert len(pmts) == 1 and pmts[0][0] == "cash" and pmts[0][1] == "captured"

        # 3) over-capacity rejected (2 booked / 2 capacity)
        r = await client.post(
            f"{base_url}/admin/customers/{customer_id}/workshop-bookings",
            headers=admin_headers,
            json={"store_id": 1, "menu_item_id": ws["id"], "class_session_id": session_id,
                  "quantity": 1, "payment": "complimentary"},
        )
        assert r.status_code == 400, r.text
        assert "seats" in r.json()["detail"].lower()

        # 4) walk-in profile rejected
        r = await client.post(
            f"{base_url}/admin/customers/1/workshop-bookings",
            headers=admin_headers,
            json={"store_id": 1, "menu_item_id": ws["id"], "class_session_id": session_id,
                  "quantity": 1, "payment": "complimentary"},
        )
        # customer id 1 may not be the walk-in on every DB — use the real walk-in lookup instead
        rw = await client.get(f"{base_url}/admin/customers?search=%2B0000000000", headers=admin_headers)
        walkin = rw.json()["data"]["items"][0]["id"] if rw.json()["data"]["items"] else None
        if walkin:
            r = await client.post(
                f"{base_url}/admin/customers/{walkin}/workshop-bookings",
                headers=admin_headers,
                json={"store_id": 1, "menu_item_id": ws["id"], "class_session_id": session_id,
                      "quantity": 1, "payment": "complimentary"},
            )
            assert r.status_code == 400, r.text
            assert "walk-in" in r.json()["detail"].lower()

        # 5) non-workshop item rejected
        menu = (await client.get(f"{base_url}/menu/stores/1")).json()["data"]["items"]
        normal = next(i for i in menu if not str(i.get("item_code", "")).startswith("EX-"))
        r = await client.post(
            f"{base_url}/admin/customers/{customer_id}/workshop-bookings",
            headers=admin_headers,
            json={"store_id": 1, "menu_item_id": normal["id"], "class_session_id": session_id,
                  "quantity": 1, "payment": "complimentary"},
        )
        assert r.status_code == 400, r.text
        assert "not a workshop" in r.json()["detail"].lower()
    finally:
        _cleanup_booking(dsn, order_ids, session_id)
        await client.delete(f"{base_url}/admin/customers/{customer_id}", headers=admin_headers)
