"""E2E tests for content module (info cards, product cards, event cards,
promo banners, splash screens, system pages, content sections, and public reads)."""

import uuid

import pytest
import httpx


def _uniq(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


# ── Public content endpoints ──

@pytest.mark.asyncio
async def test_public_config_bootstrap(client: httpx.AsyncClient, base_url: str):
    r = await client.get(f"{base_url}/config/bootstrap")
    assert r.status_code == 200, f"Bootstrap failed: {r.text}"
    data = r.json()["data"]
    assert "currency" in data
    assert "stores" in data
    assert "features" in data


@pytest.mark.asyncio
async def test_public_promo_banners_list(client: httpx.AsyncClient, base_url: str):
    r = await client.get(f"{base_url}/promos/banners")
    assert r.status_code == 200, f"Public banners failed: {r.text}"
    items = r.json()["data"]
    assert isinstance(items, list)


@pytest.mark.asyncio
async def test_public_information_card_by_slug(
    client: httpx.AsyncClient, base_url: str, admin_headers: dict
):
    slug = _uniq("e2e-info")
    create_r = await client.post(
        f"{base_url}/admin/info-cards",
        headers=admin_headers,
        json={
            "title": "E2E Info Card",
            "slug": slug,
            "short_description": "Info card created by E2E",
            "content_type": "information",
            "is_active": True,
        },
    )
    assert create_r.status_code == 201
    card_id = create_r.json()["data"]["id"]

    r = await client.get(f"{base_url}/content/information/{slug}")
    assert r.status_code == 200, f"Public info card failed: {r.text}"
    assert r.json()["data"]["slug"] == slug

    await client.delete(f"{base_url}/admin/info-cards/{card_id}", headers=admin_headers)


@pytest.mark.asyncio
async def test_public_product_cards_list(
    client: httpx.AsyncClient, base_url: str, admin_headers: dict
):
    slug = _uniq("e2e-product")
    create_r = await client.post(
        f"{base_url}/admin/product-cards",
        headers=admin_headers,
        json={
            "title": "E2E Product Card",
            "slug": slug,
            "short_description": "Product card created by E2E",
            "price": 12.5,
            "is_active": True,
        },
    )
    assert create_r.status_code == 201
    card_id = create_r.json()["data"]["id"]

    r = await client.get(f"{base_url}/content/products")
    assert r.status_code == 200
    items = r.json()["data"]
    assert any(item.get("slug") == slug for item in items)

    await client.delete(f"{base_url}/admin/product-cards/{card_id}", headers=admin_headers)


@pytest.mark.asyncio
async def test_public_event_cards_list(
    client: httpx.AsyncClient, base_url: str, admin_headers: dict
):
    slug = _uniq("e2e-event")
    create_r = await client.post(
        f"{base_url}/admin/event-cards",
        headers=admin_headers,
        json={
            "title": "E2E Event Card",
            "slug": slug,
            "short_description": "Event card created by E2E",
            "location": "Loka Espresso",
            "is_active": True,
        },
    )
    assert create_r.status_code == 201
    card_id = create_r.json()["data"]["id"]

    r = await client.get(f"{base_url}/content/events")
    assert r.status_code == 200
    items = r.json()["data"]
    assert any(item.get("slug") == slug for item in items)

    await client.delete(f"{base_url}/admin/event-cards/{card_id}", headers=admin_headers)


@pytest.mark.asyncio
async def test_invite_only_event_rsvp_flow(
    client: httpx.AsyncClient, base_url: str, admin_headers: dict, customer_account: dict
):
    """Invite-only events: RSVP is 403 until the admin invites the customer."""
    slug = _uniq("e2e-invite-event")
    create_r = await client.post(
        f"{base_url}/admin/event-cards",
        headers=admin_headers,
        json={
            "title": "E2E Invite-Only Event",
            "slug": slug,
            "short_description": "Invite-only event created by E2E",
            "event_type": "invite_only",
            "rsvp_enabled": True,
            "rsvp_max_capacity": 5,
            "is_active": True,
        },
    )
    assert create_r.status_code == 201, create_r.text
    card_id = create_r.json()["data"]["id"]
    headers = customer_account["headers"]
    cust_id = customer_account["id"]

    try:
        # Public list exposes the event type
        r = await client.get(f"{base_url}/content/events")
        card = next(i for i in r.json()["data"] if i.get("slug") == slug)
        assert card["event_type"] == "invite_only"

        # RSVP without an invite → 403
        r = await client.post(f"{base_url}/events/{card_id}/rsvp", headers=headers)
        assert r.status_code == 403, r.text

        # Admin invites the customer; duplicate invite → 409
        r = await client.post(
            f"{base_url}/admin/event-cards/{card_id}/invites",
            headers=admin_headers,
            json={"customer_id": cust_id},
        )
        assert r.status_code == 201, r.text
        r = await client.post(
            f"{base_url}/admin/event-cards/{card_id}/invites",
            headers=admin_headers,
            json={"customer_id": cust_id},
        )
        assert r.status_code == 409

        # Detail reports is_invited for the invited customer
        r = await client.get(f"{base_url}/content/events/{slug}", headers=headers)
        assert r.json()["data"]["is_invited"] is True

        # RSVP now succeeds and the invite list reflects it
        r = await client.post(f"{base_url}/events/{card_id}/rsvp", headers=headers)
        assert r.status_code == 200, r.text
        assert r.json()["data"]["rsvp_count"] == 1

        r = await client.get(f"{base_url}/admin/event-cards/{card_id}/invites", headers=admin_headers)
        items = r.json()["data"]["items"]
        assert len(items) == 1 and items[0]["rsvped"] is True

        # Removing the invite locks RSVP again for new attempts (dup guard 409 here)
        r = await client.delete(
            f"{base_url}/admin/event-cards/{card_id}/invites/{cust_id}", headers=admin_headers
        )
        assert r.status_code == 200
        r = await client.get(f"{base_url}/content/events/{slug}", headers=headers)
        assert r.json()["data"]["is_invited"] is False
    finally:
        await client.delete(f"{base_url}/admin/event-cards/{card_id}", headers=admin_headers)


@pytest.mark.asyncio
async def test_paid_event_rejects_rsvp(
    client: httpx.AsyncClient, base_url: str, admin_headers: dict, customer_headers: dict
):
    """Paid events route customers to the workshop booking flow, not RSVP."""
    slug = _uniq("e2e-paid-event")
    create_r = await client.post(
        f"{base_url}/admin/event-cards",
        headers=admin_headers,
        json={
            "title": "E2E Paid Event",
            "slug": slug,
            "short_description": "Paid event created by E2E",
            "event_type": "paid",
            "rsvp_enabled": True,  # misconfiguration on purpose — paid must still block
            "is_active": True,
        },
    )
    assert create_r.status_code == 201, create_r.text
    card_id = create_r.json()["data"]["id"]

    try:
        r = await client.post(f"{base_url}/events/{card_id}/rsvp", headers=customer_headers)
        assert r.status_code == 400, r.text
        assert "paid" in r.json()["detail"].lower()
    finally:
        await client.delete(f"{base_url}/admin/event-cards/{card_id}", headers=admin_headers)


@pytest.mark.asyncio
async def test_public_legal_page(
    client: httpx.AsyncClient, base_url: str, admin_headers: dict
):
    page_key = _uniq("e2e-terms")
    create_r = await client.post(
        f"{base_url}/admin/system-pages",
        headers=admin_headers,
        json={
            "page_key": page_key,
            "title": "E2E Terms",
            "body_text": "These are the E2E terms.",
            "is_active": True,
        },
    )
    assert create_r.status_code == 201
    page_id = create_r.json()["data"]["id"]

    r = await client.get(f"{base_url}/content/legal/{page_key}")
    assert r.status_code == 200, f"Legal page failed: {r.text}"
    data = r.json()["data"]
    assert data["page_key"] == page_key
    assert "E2E Terms" in data["title"]

    await client.delete(f"{base_url}/admin/system-pages/{page_id}", headers=admin_headers)


@pytest.mark.asyncio
async def test_public_splash_screen(
    client: httpx.AsyncClient, base_url: str, admin_headers: dict
):
    screen_name = _uniq("e2e-splash")
    create_r = await client.post(
        f"{base_url}/admin/content/splash-screens",
        headers=admin_headers,
        json={
            "screen_name": screen_name,
            "image_url": "https://example.com/splash.png",
            "title": "E2E Splash",
            "is_active": True,
        },
    )
    assert create_r.status_code == 201
    screen_id = create_r.json()["data"]["id"]

    r = await client.get(f"{base_url}/splash")
    assert r.status_code == 200, f"Splash screen failed: {r.text}"
    data = r.json()["data"]
    assert data is not None
    assert data["screen_name"] == screen_name

    await client.delete(f"{base_url}/admin/content/splash-screens/{screen_id}", headers=admin_headers)


# ── Admin content CRUD ──

@pytest.mark.asyncio
async def test_admin_info_card_lifecycle(client: httpx.AsyncClient, base_url: str, admin_headers: dict):
    slug = _uniq("e2e-info-admin")
    create_payload = {
        "title": "E2E Admin Info Card",
        "slug": slug,
        "short_description": "Created by E2E",
        "content_type": "information",
        "is_active": True,
    }
    r = await client.post(f"{base_url}/admin/info-cards", headers=admin_headers, json=create_payload)
    assert r.status_code == 201, f"Create info card failed: {r.text}"
    card_id = r.json()["data"]["id"]

    # List
    r = await client.get(f"{base_url}/admin/info-cards?per_page=50", headers=admin_headers)
    assert r.status_code == 200
    assert any(item["id"] == card_id for item in r.json()["data"]["items"])

    # Get
    r = await client.get(f"{base_url}/admin/info-cards/{card_id}", headers=admin_headers)
    assert r.status_code == 200
    assert r.json()["data"]["title"] == create_payload["title"]

    # Update
    r = await client.patch(
        f"{base_url}/admin/info-cards/{card_id}",
        headers=admin_headers,
        json={"title": "E2E Admin Info Card Updated"},
    )
    assert r.status_code == 200, f"Update info card failed: {r.text}"

    # Delete
    r = await client.delete(f"{base_url}/admin/info-cards/{card_id}", headers=admin_headers)
    assert r.status_code == 200, f"Delete info card failed: {r.text}"
    assert r.json()["data"]["deleted"] is True


@pytest.mark.asyncio
async def test_admin_product_card_lifecycle(client: httpx.AsyncClient, base_url: str, admin_headers: dict):
    slug = _uniq("e2e-product-admin")
    create_payload = {
        "title": "E2E Admin Product Card",
        "slug": slug,
        "short_description": "Created by E2E",
        "price": 9.99,
        "is_active": True,
    }
    r = await client.post(f"{base_url}/admin/product-cards", headers=admin_headers, json=create_payload)
    assert r.status_code == 201, f"Create product card failed: {r.text}"
    card_id = r.json()["data"]["id"]

    r = await client.get(f"{base_url}/admin/product-cards/{card_id}", headers=admin_headers)
    assert r.status_code == 200
    assert r.json()["data"]["price"] == 9.99

    r = await client.patch(
        f"{base_url}/admin/product-cards/{card_id}",
        headers=admin_headers,
        json={"price": 14.99},
    )
    assert r.status_code == 200

    r = await client.delete(f"{base_url}/admin/product-cards/{card_id}", headers=admin_headers)
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_admin_event_card_lifecycle(client: httpx.AsyncClient, base_url: str, admin_headers: dict):
    slug = _uniq("e2e-event-admin")
    create_payload = {
        "title": "E2E Admin Event Card",
        "slug": slug,
        "short_description": "Created by E2E",
        "location": "Loka Espresso",
        "is_active": True,
    }
    r = await client.post(f"{base_url}/admin/event-cards", headers=admin_headers, json=create_payload)
    assert r.status_code == 201, f"Create event card failed: {r.text}"
    card_id = r.json()["data"]["id"]

    r = await client.get(f"{base_url}/admin/event-cards/{card_id}", headers=admin_headers)
    assert r.status_code == 200
    assert r.json()["data"]["location"] == "Loka Espresso"

    r = await client.patch(
        f"{base_url}/admin/event-cards/{card_id}",
        headers=admin_headers,
        json={"location": "Loka Loka Cafe"},
    )
    assert r.status_code == 200

    r = await client.delete(f"{base_url}/admin/event-cards/{card_id}", headers=admin_headers)
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_admin_promo_banner_lifecycle(client: httpx.AsyncClient, base_url: str, admin_headers: dict):
    create_payload = {
        "title": "E2E Promo Banner",
        "short_description": "Created by E2E",
        "action_type": "url",
        "action_url": "https://example.com",
        "is_active": True,
    }
    r = await client.post(f"{base_url}/admin/promo-banners", headers=admin_headers, json=create_payload)
    assert r.status_code == 201, f"Create promo banner failed: {r.text}"
    banner_id = r.json()["data"]["id"]

    r = await client.get(f"{base_url}/admin/promo-banners/{banner_id}", headers=admin_headers)
    assert r.status_code == 200
    assert r.json()["data"]["title"] == create_payload["title"]

    r = await client.patch(
        f"{base_url}/admin/promo-banners/{banner_id}",
        headers=admin_headers,
        json={"title": "E2E Promo Banner Updated"},
    )
    assert r.status_code == 200

    r = await client.delete(f"{base_url}/admin/promo-banners/{banner_id}", headers=admin_headers)
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_admin_splash_screen_lifecycle(client: httpx.AsyncClient, base_url: str, admin_headers: dict):
    screen_name = _uniq("e2e-splash-admin")
    create_payload = {
        "screen_name": screen_name,
        "image_url": "https://example.com/splash-admin.png",
        "title": "E2E Splash Screen",
        "is_active": True,
    }
    r = await client.post(
        f"{base_url}/admin/content/splash-screens", headers=admin_headers, json=create_payload
    )
    assert r.status_code == 201, f"Create splash screen failed: {r.text}"
    screen_id = r.json()["data"]["id"]

    r = await client.get(f"{base_url}/admin/content/splash-screens/{screen_id}", headers=admin_headers)
    assert r.status_code == 200
    assert r.json()["data"]["screen_name"] == screen_name

    r = await client.patch(
        f"{base_url}/admin/content/splash-screens/{screen_id}",
        headers=admin_headers,
        json={"title": "E2E Splash Screen Updated"},
    )
    assert r.status_code == 200

    r = await client.delete(f"{base_url}/admin/content/splash-screens/{screen_id}", headers=admin_headers)
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_admin_system_page_lifecycle(client: httpx.AsyncClient, base_url: str, admin_headers: dict):
    page_key = _uniq("e2e-system-admin")
    create_payload = {
        "page_key": page_key,
        "title": "E2E System Page",
        "body_text": "System page created by E2E",
        "is_active": True,
    }
    r = await client.post(f"{base_url}/admin/system-pages", headers=admin_headers, json=create_payload)
    assert r.status_code == 201, f"Create system page failed: {r.text}"
    page_id = r.json()["data"]["id"]

    r = await client.get(f"{base_url}/admin/system-pages/{page_id}", headers=admin_headers)
    assert r.status_code == 200
    assert r.json()["data"]["page_key"] == page_key

    r = await client.patch(
        f"{base_url}/admin/system-pages/{page_id}",
        headers=admin_headers,
        json={"title": "E2E System Page Updated"},
    )
    assert r.status_code == 200

    r = await client.delete(f"{base_url}/admin/system-pages/{page_id}", headers=admin_headers)
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_admin_content_sections_batch(client: httpx.AsyncClient, base_url: str, admin_headers: dict):
    slug = _uniq("e2e-sections")
    create_r = await client.post(
        f"{base_url}/admin/info-cards",
        headers=admin_headers,
        json={
            "title": "E2E Card With Sections",
            "slug": slug,
            "short_description": "Card for section testing",
            "is_active": True,
        },
    )
    assert create_r.status_code == 201
    card_id = create_r.json()["data"]["id"]

    # Batch save sections
    batch_payload = {
        "content_type": "information_cards",
        "content_id": card_id,
        "sections": [
            {"section_title": "Section A", "section_body": "Body A", "is_active": True},
            {"section_title": "Section B", "section_body": "Body B", "is_active": True},
        ],
    }
    r = await client.put(
        f"{base_url}/admin/content-sections/batch", headers=admin_headers, json=batch_payload
    )
    assert r.status_code == 200, f"Batch save sections failed: {r.text}"

    # List sections
    r = await client.get(
        f"{base_url}/admin/content-sections?content_type=information_cards&content_id={card_id}",
        headers=admin_headers,
    )
    assert r.status_code == 200
    sections = r.json()["data"]
    assert len(sections) == 2
    assert {s["section_title"] for s in sections} == {"Section A", "Section B"}

    # Cleanup: delete card (sections are not cascaded, but test data is isolated by slug)
    await client.delete(f"{base_url}/admin/info-cards/{card_id}", headers=admin_headers)
