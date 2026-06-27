"""E2E tests for public UI translations and admin translation management."""

import uuid

import pytest
import httpx

pytestmark = [pytest.mark.admin]


@pytest.mark.asyncio
async def test_public_ui_translations(client: httpx.AsyncClient, base_url: str):
    """Public UI translations endpoint returns key/value pairs."""
    r = await client.get(f"{base_url}/public/translations/ui?locale=ms&namespace=pwa-ui")
    assert r.status_code == 200
    data = r.json()["data"]
    assert isinstance(data, dict)


@pytest.mark.asyncio
async def test_admin_translation_lifecycle(client: httpx.AsyncClient, admin_headers: dict, base_url: str):
    """Admin can create, list, update and delete a translation."""
    key = f"e2e.test.{uuid.uuid4().hex[:8]}"
    payload = {
        "translation_key": key,
        "locale": "ms",
        "translated_text": "Ujian",
        "source_text": "Test",
        "namespace": "pwa-ui",
        "table_name": "",
        "record_id": 0,
        "column_name": "",
    }
    r = await client.post(f"{base_url}/translations", headers=admin_headers, json=payload)
    assert r.status_code == 201, f"Translation create failed: {r.text}"
    trans_id = r.json()["data"]["id"]

    # List
    r = await client.get(f"{base_url}/translations?locale=ms&namespace=pwa-ui", headers=admin_headers)
    assert r.status_code == 200
    assert any(t["id"] == trans_id for t in r.json()["data"]["items"])

    # Update
    r = await client.put(
        f"{base_url}/translations/{trans_id}",
        headers=admin_headers,
        json={"translated_text": "Ujian Kemas Kini"},
    )
    assert r.status_code == 200, f"Translation update failed: {r.text}"
    assert r.json()["data"]["translated_text"] == "Ujian Kemas Kini"

    # Delete
    r = await client.delete(f"{base_url}/translations/{trans_id}", headers=admin_headers)
    assert r.status_code in (200, 204)
