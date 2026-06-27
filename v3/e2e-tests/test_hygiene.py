"""E2E tests for hygiene check reporting and admin verification."""

import pytest
import httpx

pytestmark = [pytest.mark.admin, pytest.mark.staff]


@pytest.mark.asyncio
async def test_staff_hygiene_reports_and_admin_verification(
    client: httpx.AsyncClient,
    admin_headers: dict,
    staff_headers: dict,
    base_url: str,
    store_id: int,
):
    """Staff can submit hygiene reports; admin can list and verify them."""
    # Grease trap report
    r1 = await client.post(
        f"{base_url}/staff/hygiene/grease-trap",
        headers=staff_headers,
        json={"store_id": store_id, "notes": "Grease trap cleaned during E2E", "before_image_urls": [], "after_image_urls": []},
    )
    assert r1.status_code == 201, f"Grease trap report failed: {r1.text}"
    grease_id = r1.json()["data"]["id"]

    # Garbage disposal report
    r2 = await client.post(
        f"{base_url}/staff/hygiene/garbage",
        headers=staff_headers,
        json={"store_id": store_id, "notes": "Garbage disposed during E2E", "image_urls": []},
    )
    assert r2.status_code == 201, f"Garbage report failed: {r2.text}"
    garbage_id = r2.json()["data"]["id"]

    # Admin list
    r = await client.get(f"{base_url}/admin/hygiene/reports?store_id={store_id}&per_page=50", headers=admin_headers)
    assert r.status_code == 200
    items = r.json()["data"]["items"]
    assert any(i["id"] == grease_id for i in items)
    assert any(i["id"] == garbage_id for i in items)

    # Admin verify one
    r = await client.patch(
        f"{base_url}/admin/hygiene/reports/{grease_id}",
        headers=admin_headers,
        json={"status": "verified", "notes": "Verified via E2E"},
    )
    assert r.status_code == 200, f"Hygiene verify failed: {r.text}"
    assert r.json()["data"]["status"] == "verified"
