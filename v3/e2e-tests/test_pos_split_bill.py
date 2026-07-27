"""E2E tests for POS split bill — per-item payments, even (by-amount) splits,
over-allocation/over-charge guards, and refunding one share of a split bill."""

import uuid

import httpx
import pytest


def _money(v) -> float:
    return round(float(v), 2)


async def _pick_items(client: httpx.AsyncClient, base_url: str, count: int = 2):
    """Pick plain sellable menu items (no workshops/experiences)."""
    r = await client.get(f"{base_url}/menu/stores/1")
    assert r.status_code == 200, r.text
    items = [
        i for i in r.json()["data"]["items"]
        if not str(i.get("item_code", "")).startswith("EX-") and float(i.get("base_price") or i.get("price") or 0) > 0
    ]
    assert len(items) >= count, "not enough seeded menu items for split-bill test"
    return items[:count]


async def _create_order(client: httpx.AsyncClient, base_url: str, staff_headers: dict, lines) -> int:
    r = await client.post(
        f"{base_url}/staff/pos/orders",
        headers=staff_headers,
        json={
            "order_type": "takeaway",
            "line_items": [{"menu_item_id": i["id"], "quantity": q} for i, q in lines],
        },
    )
    assert r.status_code == 201, r.text
    data = r.json()["data"]
    return data.get("order_id") or data["id"]


async def _split_state(client: httpx.AsyncClient, base_url: str, staff_headers: dict, order_id: int) -> dict:
    r = await client.get(f"{base_url}/staff/orders/{order_id}/split-state", headers=staff_headers)
    assert r.status_code == 200, r.text
    return r.json()["data"]


async def _pay(client: httpx.AsyncClient, base_url: str, staff_headers: dict, order_id: int, **payload):
    return await client.patch(
        f"{base_url}/staff/orders/{order_id}/payment",
        headers=staff_headers,
        json=payload,
    )


@pytest.mark.asyncio
async def test_split_bill_by_item(client: httpx.AsyncClient, base_url: str, staff_headers: dict):
    item_a, item_b = await _pick_items(client, base_url)
    order_id = await _create_order(client, base_url, staff_headers, [(item_a, 1), (item_b, 2)])

    state = await _split_state(client, base_url, staff_headers, order_id)
    assert state["total_amount"] > 0
    assert state["fully_paid"] is False
    assert len(state["lines"]) == 2
    for line in state["lines"]:
        assert {"line_item_id", "item_name", "unit_price", "ordered_qty", "paid_qty", "remaining_qty", "remaining_amount"} <= set(line)

    line_a = next(l for l in state["lines"] if l["ordered_qty"] == 1)
    line_b = next(l for l in state["lines"] if l["ordered_qty"] == 2)

    # Pay item A only
    share_a = _money(line_a["remaining_amount"])
    r = await _pay(client, base_url, staff_headers, order_id,
                   payment_method="cash", amount_tendered=share_a,
                   allocations=[{"line_item_id": line_a["line_item_id"], "quantity": 1}])
    assert r.status_code == 200, r.text
    body = r.json()["data"]
    assert _money(body["amount"]) == share_a
    assert body["payment_status"] != "captured"
    assert body["allocations"][0]["line_item_id"] == line_a["line_item_id"]

    state = await _split_state(client, base_url, staff_headers, order_id)
    la = next(l for l in state["lines"] if l["line_item_id"] == line_a["line_item_id"])
    lb = next(l for l in state["lines"] if l["line_item_id"] == line_b["line_item_id"])
    assert la["paid_qty"] == 1 and la["remaining_qty"] == 0
    assert lb["paid_qty"] == 0 and lb["remaining_qty"] == 2
    assert _money(state["total_paid"]) == share_a
    assert state["fully_paid"] is False

    # Over-allocation guard: 3× B when only 2 left
    r = await _pay(client, base_url, staff_headers, order_id,
                   payment_method="cash", amount_tendered=999,
                   allocations=[{"line_item_id": line_b["line_item_id"], "quantity": 3}])
    assert r.status_code == 400, r.text

    # Pay the rest (2× B) → order captured
    share_b = _money(lb["remaining_amount"])
    r = await _pay(client, base_url, staff_headers, order_id,
                   payment_method="cash", amount_tendered=share_b,
                   allocations=[{"line_item_id": line_b["line_item_id"], "quantity": 2}])
    assert r.status_code == 200, r.text
    assert r.json()["data"]["payment_status"] == "captured"

    state = await _split_state(client, base_url, staff_headers, order_id)
    assert state["fully_paid"] is True
    assert _money(state["remaining_due"]) == 0

    # Fully-paid guard
    r = await _pay(client, base_url, staff_headers, order_id,
                   payment_method="cash", amount_tendered=10)
    assert r.status_code == 400, r.text
    assert "fully paid" in r.json()["detail"].lower()


@pytest.mark.asyncio
async def test_split_bill_even_shares(client: httpx.AsyncClient, base_url: str, staff_headers: dict):
    (item_a,) = await _pick_items(client, base_url, count=1)
    order_id = await _create_order(client, base_url, staff_headers, [(item_a, 1)])

    state = await _split_state(client, base_url, staff_headers, order_id)
    total = _money(state["total_amount"])
    share = _money(total / 3)

    # Two equal shares — sequential identical amounts must BOTH be accepted
    for _ in range(2):
        r = await _pay(client, base_url, staff_headers, order_id,
                       payment_method="cash", amount_tendered=share, charge_amount=share)
        assert r.status_code == 200, r.text
        assert _money(r.json()["data"]["amount"]) == share

    state = await _split_state(client, base_url, staff_headers, order_id)
    remaining = _money(state["remaining_due"])
    assert remaining == _money(total - 2 * share)

    # Over-charge guard
    r = await _pay(client, base_url, staff_headers, order_id,
                   payment_method="cash", amount_tendered=remaining + 5, charge_amount=remaining + 5)
    assert r.status_code == 400, r.text

    # Final share takes the remaining balance (plain full-balance payment)
    r = await _pay(client, base_url, staff_headers, order_id,
                   payment_method="cash", amount_tendered=remaining)
    assert r.status_code == 200, r.text
    assert r.json()["data"]["payment_status"] == "captured"

    state = await _split_state(client, base_url, staff_headers, order_id)
    assert state["fully_paid"] is True


@pytest.mark.asyncio
async def test_refund_one_split_share(client: httpx.AsyncClient, base_url: str, staff_headers: dict, admin_headers: dict):
    item_a, item_b = await _pick_items(client, base_url)
    order_id = await _create_order(client, base_url, staff_headers, [(item_a, 1), (item_b, 1)])

    state = await _split_state(client, base_url, staff_headers, order_id)
    line_a, line_b = state["lines"][0], state["lines"][1]

    for line in (line_a, line_b):
        share = _money(line["remaining_amount"])
        r = await _pay(client, base_url, staff_headers, order_id,
                       payment_method="cash", amount_tendered=share,
                       allocations=[{"line_item_id": line["line_item_id"], "quantity": 1}])
        assert r.status_code == 200, r.text
    state = await _split_state(client, base_url, staff_headers, order_id)
    assert state["fully_paid"] is True

    # Admin refunds the payment covering item A
    r = await client.get(f"{base_url}/payments?order_id={order_id}", headers=admin_headers)
    assert r.status_code == 200, r.text
    payments = r.json()["data"]["items"]
    assert len(payments) == 2
    pay_a = next(p for p in payments if p.get("allocations") and p["allocations"][0]["order_line_item_id"] == line_a["line_item_id"])
    assert pay_a["allocations"][0]["item_name"]

    r = await client.post(
        f"{base_url}/payments/{pay_a['id']}/refund",
        headers=admin_headers,
        json={"amount": pay_a["amount"], "reason": f"e2e split refund {uuid.uuid4().hex[:6]}"},
    )
    assert r.status_code == 201, r.text

    # Item A becomes payable again; B stays paid
    state = await _split_state(client, base_url, staff_headers, order_id)
    la = next(l for l in state["lines"] if l["line_item_id"] == line_a["line_item_id"])
    lb = next(l for l in state["lines"] if l["line_item_id"] == line_b["line_item_id"])
    assert la["remaining_qty"] == 1
    assert lb["remaining_qty"] == 0
    assert state["fully_paid"] is False
