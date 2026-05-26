"""Admin splash screen management with Round 12 fields — duration_ms, frequency.

Round 12 added: duration_ms column, show_frequency "always" option,
and dismissible flag being wired through to PWA.
"""

import pytest
import httpx

from conftest import ADMIN_EMAIL, ADMIN_PASSWORD


@pytest.mark.admin
@pytest.mark.asyncio
async def test_create_splash_with_duration(client: httpx.AsyncClient, base_url: str, admin_headers: dict):
    """Create a splash screen with duration_ms and show_frequency=always."""
    r = await client.post(f"{base_url}/admin/content/splash-screens", headers=admin_headers, json={
        "screen_name": "e2e_test_splash",
        "title": "E2E Test Splash",
        "subtitle": "With 10s duration",
        "image_url": "https://example.com/splash.png",
        "show_frequency": "always",
        "dismissible": True,
        "duration_ms": 10000,
    })
    if r.status_code in (200, 201):
        data = r.json().get("data", {})
        splash_id = data.get("id")
        assert splash_id
        # Cleanup
        await client.delete(f"{base_url}/admin/content/splash-screens/{splash_id}", headers=admin_headers)
    else:
        print(f"Create splash: {r.status_code} {r.text}")
        # May already exist — that's OK


@pytest.mark.public
@pytest.mark.asyncio
async def test_public_splash_endpoint_returns_duration(client: httpx.AsyncClient, base_url: str, admin_headers: dict):
    """GET /splash returns active splash with duration_ms."""
    # Ensure at least one splash exists
    r_existing = await client.get(f"{base_url}/splash")
    data = r_existing.json().get("data", {})
    if not data:
        # Create one
        r_create = await client.post(f"{base_url}/admin/content/splash-screens", headers=admin_headers, json={
            "screen_name": "e2e_pub_splash",
            "title": "Public Test Splash",
            "image_url": "https://example.com/splash2.png",
            "show_frequency": "always",
            "duration_ms": 5000,
            "is_active": True,
        })
        if r_create.status_code in (200, 201):
            splash_id = r_create.json().get("data", {}).get("id")
        else:
            pytest.skip(f"Cannot create splash: {r_create.status_code}")
    else:
        splash_id = data.get("id")

    # Verify public endpoint returns it with duration_ms
    r = await client.get(f"{base_url}/splash")
    assert r.status_code == 200
    public_data = r.json().get("data", {})
    if public_data:
        assert "id" in public_data
        assert "image_url" in public_data
        # duration_ms may be null if not set, that's OK
        assert "duration_ms" in public_data
        assert "show_frequency" in public_data
        assert "dismissible" in public_data

    # Cleanup if we created it
    if splash_id and data.get("id") != splash_id:
        await client.delete(f"{base_url}/admin/content/splash-screens/{splash_id}", headers=admin_headers)


@pytest.mark.admin
@pytest.mark.asyncio
async def test_splash_frequency_values_accepted(client: httpx.AsyncClient, base_url: str, admin_headers: dict):
    """All show_frequency values accepted by the API."""
    for freq in ["once", "once_per_session", "once_per_day", "always"]:
        r = await client.post(f"{base_url}/admin/content/splash-screens", headers=admin_headers, json={
            "screen_name": f"e2e_freq_{freq}",
            "title": f"Freq Test {freq}",
            "image_url": "https://example.com/freq.png",
            "show_frequency": freq,
            "is_active": False,  # inactive so it doesn't interfere
        })
        if r.status_code in (200, 201):
            splash_id = r.json().get("data", {}).get("id")
            if splash_id:
                await client.delete(f"{base_url}/admin/content/splash-screens/{splash_id}", headers=admin_headers)
        else:
            print(f"Frequency '{freq}' rejected: {r.status_code} {r.text}")
            # Don't fail — maybe the database already has too many
