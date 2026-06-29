"""E2E Test Suite: Promo banners — list, enriched voucher/survey names and CRUD."""

import pytest
import uuid

pytestmark = [pytest.mark.admin]


@pytest.mark.asyncio
async def test_promo_banner_list_enrichment(
    client, admin_headers: dict, base_url: str
):
    """List promo banners includes voucher_display_title / survey_name when linked."""
    r = await client.get(
        f"{base_url}/admin/promo-banners?per_page=50",
        headers=admin_headers,
    )
    assert r.status_code == 200
    items = r.json()["data"].get("items", [])
    assert len(items) >= 1, "No promo banners seeded"
    for banner in items:
        assert "voucher_display_title" in banner
        assert "survey_name" in banner


@pytest.mark.asyncio
async def test_promo_banner_crud_with_voucher(
    client, admin_headers: dict, base_url: str
):
    """Create a promo banner linked to a voucher and verify enriched list."""
    # Find an active voucher
    r_vouchers = await client.get(
        f"{base_url}/admin/vouchers?per_page=1&is_active=true",
        headers=admin_headers,
    )
    assert r_vouchers.status_code == 200
    vouchers = r_vouchers.json()["data"].get("items", [])
    if not vouchers:
        pytest.skip("No voucher definitions seeded for promo banner test")
    voucher_id = vouchers[0]["id"]
    voucher_title = vouchers[0].get("display_title") or vouchers[0].get("voucher_code")

    suffix = uuid.uuid4().hex[:8]
    title = f"E2E Promo {suffix}"
    r_create = await client.post(
        f"{base_url}/admin/promo-banners",
        headers=admin_headers,
        json={
            "title": title,
            "short_description": "E2E promo banner",
            "action_type": "read_claim",
            "voucher_id": voucher_id,
            "is_active": True,
        },
    )
    assert r_create.status_code in (200, 201), (
        f"Create promo banner failed: {r_create.status_code}: {r_create.text}"
    )
    banner_id = r_create.json()["data"]["id"]

    try:
        r_list = await client.get(
            f"{base_url}/admin/promo-banners?per_page=50",
            headers=admin_headers,
        )
        assert r_list.status_code == 200
        banner = next(
            (b for b in r_list.json()["data"].get("items", []) if b["id"] == banner_id),
            None,
        )
        assert banner is not None, "Created promo banner not found in list"
        assert banner["voucher_display_title"] == voucher_title
        assert banner["action_type"] == "read_claim"

        r_get = await client.get(
            f"{base_url}/admin/promo-banners/{banner_id}",
            headers=admin_headers,
        )
        assert r_get.status_code == 200
        assert r_get.json()["data"]["voucher_id"] == voucher_id
    finally:
        await client.delete(
            f"{base_url}/admin/promo-banners/{banner_id}",
            headers=admin_headers,
        )
