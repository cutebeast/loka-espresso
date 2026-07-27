"""E2E tests for POS cash drawer sessions (open float → live Z-report → close
with variance) and order merge (unpaid-only guards, totals, seat preservation)."""

import uuid
from datetime import date, timedelta

import httpx
import pytest


def _money(v) -> float:
    return round(float(v), 2)


async def _pick_item(client: httpx.AsyncClient, base_url: str):
    r = await client.get(f"{base_url}/menu/stores/1")
    assert r.status_code == 200, r.text
    item = next(i for i in r.json()["data"]["items"] if not str(i.get("item_code", "")).startswith("EX-") and float(i.get("base_price") or i.get("price") or 0) > 0)
    return item


async def _create_order(client: httpx.AsyncClient, base_url: str, staff_headers: dict, menu_item_id: int, qty: int = 1, **extra) -> int:
    r = await client.post(
        f"{base_url}/staff/pos/orders",
        headers=staff_headers,
        json={"order_type": "takeaway", "line_items": [{"menu_item_id": menu_item_id, "quantity": qty}], **extra},
    )
    assert r.status_code == 201, r.text
    data = r.json()["data"]
    return data.get("order_id") or data["id"]


@pytest.mark.asyncio
async def test_cash_drawer_session_lifecycle(client: httpx.AsyncClient, base_url: str, staff_headers: dict, admin_headers: dict):
    """Open float → cash sale → live Z → close with variance → admin listing."""
    # Ensure no session is open from a previous run
    r = await client.get(f"{base_url}/staff/pos/session/current", headers=staff_headers)
    assert r.status_code == 200, r.text
    if r.json()["data"]["session"]:
        await client.post(f"{base_url}/staff/pos/session/close", headers=staff_headers, json={"closing_cash": 0, "discrepancy_notes": "e2e cleanup"})

    # Open with float
    r = await client.post(f"{base_url}/staff/pos/session/open", headers=staff_headers, json={"opening_cash": 100})
    assert r.status_code == 201, r.text
    session_id = r.json()["data"]["session"]["id"]

    # Second open → 409
    r = await client.post(f"{base_url}/staff/pos/session/open", headers=staff_headers, json={"opening_cash": 50})
    assert r.status_code == 409, r.text

    # Cash sale inside the window
    item = await _pick_item(client, base_url)
    order_id = await _create_order(client, base_url, staff_headers, item["id"], 1)
    r = await client.get(f"{base_url}/staff/orders/{order_id}/split-state", headers=staff_headers)
    total = _money(r.json()["data"]["total_amount"])
    r = await client.patch(
        f"{base_url}/staff/orders/{order_id}/payment",
        headers=staff_headers,
        json={"payment_method": "cash", "amount_tendered": total},
    )
    assert r.status_code == 200, r.text

    # Live Z-report: expected = float + cash sales
    r = await client.get(f"{base_url}/staff/pos/session/current", headers=staff_headers)
    live = r.json()["data"]["session"]["live"]
    assert _money(live["opening_cash"]) == 100.0
    assert _money(live["sales_cash"]) == total
    assert _money(live["expected_cash"]) == _money(100 + total)
    assert live["order_count"] >= 1

    # Close short by 3 → variance −3
    counted = 100 + total - 3
    r = await client.post(f"{base_url}/staff/pos/session/close", headers=staff_headers, json={"closing_cash": counted, "discrepancy_notes": "e2e"})
    assert r.status_code == 200, r.text
    s = r.json()["data"]["session"]
    assert s["status"] == "closed"
    assert _money(s["expected_cash"]) == _money(100 + total)
    assert _money(s["closing_cash"]) == _money(counted)
    assert _money(s["discrepancy"]) == -3.0
    assert _money(s["total_sales_cash"]) == total

    # Nothing open now
    r = await client.get(f"{base_url}/staff/pos/session/current", headers=staff_headers)
    assert r.json()["data"]["session"] is None

    # Admin sees the closed session with the snapshot
    r = await client.get(f"{base_url}/admin/pos/sessions?store_id=1", headers=admin_headers)
    assert r.status_code == 200, r.text
    admin_session = next(x for x in r.json()["data"] if x["id"] == session_id)
    assert admin_session["status"] == "closed"
    assert _money(admin_session["discrepancy"]) == -3.0


@pytest.mark.asyncio
async def test_merge_orders(client: httpx.AsyncClient, base_url: str, staff_headers: dict):
    item = await _pick_item(client, base_url)
    src = await _create_order(client, base_url, staff_headers, item["id"], 1)
    tgt = await _create_order(client, base_url, staff_headers, item["id"], 2)

    r = await client.get(f"{base_url}/staff/orders/{src}/split-state", headers=staff_headers)
    src_total = _money(r.json()["data"]["total_amount"])
    r = await client.get(f"{base_url}/staff/orders/{tgt}/split-state", headers=staff_headers)
    tgt_total = _money(r.json()["data"]["total_amount"])

    # Self-merge → 400
    r = await client.post(f"{base_url}/staff/orders/{src}/merge", headers=staff_headers, json={"target_order_id": src})
    assert r.status_code == 400, r.text

    # Merge source into target
    r = await client.post(f"{base_url}/staff/orders/{src}/merge", headers=staff_headers, json={"target_order_id": tgt})
    assert r.status_code == 200, r.text
    d = r.json()["data"]
    assert d["merged_from_order_id"] == src
    assert d["moved_items"] == 1
    assert _money(d["total_amount"]) == _money(src_total + tgt_total)

    # Source is cancelled; re-merge → 400
    r = await client.post(f"{base_url}/staff/orders/{src}/merge", headers=staff_headers, json={"target_order_id": tgt})
    assert r.status_code == 400, r.text

    # Target now holds both line items
    r = await client.get(f"{base_url}/staff/orders/{tgt}/split-state", headers=staff_headers)
    state = r.json()["data"]
    assert _money(state["total_amount"]) == _money(src_total + tgt_total)
    assert sum(l["ordered_qty"] for l in state["lines"]) == 3

    # Paid target rejects further merges
    r = await client.patch(
        f"{base_url}/staff/orders/{tgt}/payment",
        headers=staff_headers,
        json={"payment_method": "cash", "amount_tendered": float(state["total_amount"])},
    )
    assert r.status_code == 200, r.text
    other = await _create_order(client, base_url, staff_headers, item["id"], 1)
    r = await client.post(f"{base_url}/staff/orders/{other}/merge", headers=staff_headers, json={"target_order_id": tgt})
    assert r.status_code == 400, r.text
    assert "unpaid" in r.json()["detail"].lower()
    # cleanup: cancel the leftover unpaid order
    await client.post(f"{base_url}/staff/orders/{other}/cancel", headers=staff_headers, json={"reason": "e2e"})


@pytest.mark.asyncio
async def test_merge_preserves_workshop_seats(client: httpx.AsyncClient, base_url: str, staff_headers: dict, admin_headers: dict):
    """Merging an order with a workshop line must NOT release the booked seats."""
    r = await client.get(f"{base_url}/menu/stores/1")
    workshop = next(i for i in r.json()["data"]["items"] if i["item_code"] == "EX-TURKISH-SAND-BREW")

    future = (date.today() + timedelta(days=4)).isoformat()
    r = await client.post(
        f"{base_url}/admin/menu/items/{workshop['id']}/sessions",
        headers=admin_headers,
        json={"session_date": future, "start_time": "11:00", "capacity": 5, "location": "E2E merge"},
    )
    assert r.status_code in (200, 201), r.text
    session_id = r.json()["data"]["id"]

    r = await client.post(
        f"{base_url}/staff/customers/find-or-create",
        headers=staff_headers,
        json={"phone_number": f"017{uuid.uuid4().int % 10**8:08d}", "display_name": "E2E Merge"},
    )
    assert r.status_code == 201, r.text
    customer_id = r.json()["data"]["id"]

    try:
        # Workshop line needs customer + session on the LINE ITEM
        r = await client.post(
            f"{base_url}/staff/pos/orders",
            headers=staff_headers,
            json={
                "order_type": "takeaway",
                "customer_id": customer_id,
                "line_items": [{"menu_item_id": workshop["id"], "quantity": 2, "class_session_id": session_id}],
            },
        )
        assert r.status_code == 201, r.text
        src = r.json()["data"].get("order_id") or r.json()["data"]["id"]

        item = await _pick_item(client, base_url)
        tgt = await _create_order(client, base_url, staff_headers, item["id"], 1)

        def _booked(sess_list):
            return next(s for s in sess_list if s["id"] == session_id)["booked_pax"]

        r = await client.get(f"{base_url}/admin/menu/items/{workshop['id']}/sessions", headers=admin_headers)
        before = _booked(r.json()["data"])
        assert before == 2

        r = await client.post(f"{base_url}/staff/orders/{src}/merge", headers=staff_headers, json={"target_order_id": tgt})
        assert r.status_code == 200, r.text

        # Seats still booked after merge
        r = await client.get(f"{base_url}/admin/menu/items/{workshop['id']}/sessions", headers=admin_headers)
        assert _booked(r.json()["data"]) == 2

        # Cleanup: cancel merged target → seats released
        r = await client.post(f"{base_url}/staff/orders/{tgt}/cancel", headers=staff_headers, json={"reason": "e2e"})
        assert r.status_code == 200, r.text
        r = await client.get(f"{base_url}/admin/menu/items/{workshop['id']}/sessions", headers=admin_headers)
        assert _booked(r.json()["data"]) == 0
    finally:
        await client.delete(f"{base_url}/admin/customers/{customer_id}", headers=admin_headers)
