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
    """Workshops are PWA-only — POS menu hides them and POS orders reject them."""
    # Seeded workshop item
    r = await client.get(f"{base_url}/menu/stores/1")
    assert r.status_code == 200
    workshop = next(i for i in r.json()["data"]["items"] if i["item_code"] == "EX-TURKISH-SAND-BREW")

    # POS categories exclude the experiences category
    r = await client.get(f"{base_url}/staff/menu/categories", headers=staff_headers)
    assert r.status_code == 200, r.text
    slugs = [c["slug"] for c in r.json()["data"]]
    assert "experiences" not in slugs, slugs

    # POS items exclude workshop items
    r = await client.get(f"{base_url}/staff/menu/items?per_page=500", headers=staff_headers)
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    items = data if isinstance(data, list) else data.get("items", [])
    codes = [i.get("item_code") for i in items]
    assert all(not (c or "").startswith("EX-") for c in codes), codes

    # POS order with a workshop item → 400
    future = (date.today() + timedelta(days=3)).isoformat()
    r = await client.post(
        f"{base_url}/admin/menu/items/{workshop['id']}/sessions",
        headers=admin_headers,
        json={"session_date": future, "start_time": "10:00", "capacity": 2, "location": "E2E"},
    )
    assert r.status_code in (200, 201), r.text
    session_id = r.json()["data"]["id"]

    try:
        r = await client.post(
            f"{base_url}/staff/pos/orders",
            headers=staff_headers,
            json={"order_type": "takeaway", "line_items": [{"menu_item_id": workshop["id"], "quantity": 1, "class_session_id": session_id}]},
        )
        assert r.status_code == 400, r.text
        assert "mobile app" in r.json()["detail"].lower()
    finally:
        await client.delete(f"{base_url}/admin/class-sessions/{session_id}", headers=admin_headers)



