"""E2E test for the LHDN MyInvois e-invoice flow (simulated submissions).

Covers: auto-issue on cash payment, staff e-invoice lookup, admin document
list/detail (UBL contents), idempotent manual issue, retry guard, and config
restoration.
"""

import json

import httpx
import pytest


def _money(v) -> float:
    return round(float(v), 2)


def _config_bool(v) -> bool:
    if isinstance(v, bool):
        return v
    return str(v).strip().strip('"').lower() == "true"


def _config_str(v) -> str:
    s = v if isinstance(v, str) else json.dumps(v)
    return s.strip().strip('"')


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
async def test_einvoice_flow(client: httpx.AsyncClient, base_url: str, staff_headers: dict, admin_headers: dict):
    # 1. Read current e-invoice config, then enable auto-issue.
    r = await client.get(f"{base_url}/admin/config?prefix=einvoice.", headers=admin_headers)
    assert r.status_code == 200, r.text
    cfg = {c["config_key"]: c["config_value"] for c in r.json()["data"]}
    original_auto_issue = _config_bool(cfg.get("einvoice.auto_issue"))
    supplier_tin = _config_str(cfg.get("einvoice.tin", "C00000000000"))

    r = await client.put(
        f"{base_url}/admin/config",
        headers=admin_headers,
        json={"key": "einvoice.auto_issue", "value": "true"},
    )
    assert r.status_code in (200, 201, 204), r.text

    try:
        # 2. POS order + cash payment (auto-issue fires on captured payment).
        item = await _pick_item(client, base_url)
        order_id = await _create_order(client, base_url, staff_headers, item["id"], 1)
        r = await client.get(f"{base_url}/staff/orders/{order_id}/split-state", headers=staff_headers)
        assert r.status_code == 200, r.text
        total = _money(r.json()["data"]["total_amount"])
        r = await client.patch(
            f"{base_url}/staff/orders/{order_id}/payment",
            headers=staff_headers,
            json={"payment_method": "cash", "amount_tendered": total},
        )
        assert r.status_code == 200, r.text

        # 3. Staff sees the simulated validated document.
        r = await client.get(f"{base_url}/staff/orders/{order_id}/einvoice", headers=staff_headers)
        assert r.status_code == 200, r.text
        doc = r.json()["data"]
        assert doc is not None, "no e-invoice document after cash payment with auto_issue on"
        assert doc["document_type"] == "01"
        assert doc["status"] == "validated"
        assert doc["myinvois_uuid"] and doc["myinvois_uuid"].startswith("sim-")
        assert doc["validation_link"] and "/share/" in doc["validation_link"]
        assert doc["code_number"].startswith("EINV-")
        assert doc["submitted_at"]

        # 4. Admin list filtered by order_id returns exactly this document.
        r = await client.get(f"{base_url}/admin/einvoice/documents?order_id={order_id}", headers=admin_headers)
        assert r.status_code == 200, r.text
        page = r.json()["data"]
        assert page["total"] == 1
        row = page["items"][0]
        assert row["order_id"] == order_id
        assert row["status"] == "validated"
        assert row["code_number"] == doc["code_number"]
        doc_id = row["id"]

        # 5. Admin detail carries the UBL document with supplier TIN and totals.
        r = await client.get(f"{base_url}/admin/einvoice/documents/{doc_id}", headers=admin_headers)
        assert r.status_code == 200, r.text
        detail = r.json()["data"]
        ubl = detail["ubl_document"]
        invoices = ubl["Invoice"]
        assert isinstance(invoices, list) and invoices
        invoice = invoices[0]
        party = invoice["AccountingSupplierParty"][0]["Party"][0]
        tin = next(p["ID"][0]["_"] for p in party["PartyIdentification"] if p["ID"][0].get("schemeID") == "TIN")
        assert tin == supplier_tin
        payable = invoice["LegalMonetaryTotal"][0]["PayableAmount"][0]["_"]
        assert _money(payable) == total

        # 6. Manual issue is idempotent — same document, no duplicate.
        r = await client.post(f"{base_url}/admin/einvoice/orders/{order_id}/issue", headers=admin_headers)
        assert r.status_code in (200, 201), r.text
        assert r.json()["data"]["id"] == doc_id
        r = await client.get(f"{base_url}/admin/einvoice/documents?order_id={order_id}", headers=admin_headers)
        assert r.json()["data"]["total"] == 1

        # 7. A validated document is not retryable.
        r = await client.post(f"{base_url}/admin/einvoice/documents/{doc_id}/retry", headers=admin_headers)
        assert r.status_code == 400, r.text
    finally:
        # 8. Restore einvoice.auto_issue to its original value.
        r = await client.put(
            f"{base_url}/admin/config",
            headers=admin_headers,
            json={"key": "einvoice.auto_issue", "value": "true" if original_auto_issue else "false"},
        )
        assert r.status_code in (200, 201, 204), r.text
