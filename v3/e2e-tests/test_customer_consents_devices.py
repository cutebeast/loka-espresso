"""E2E tests for customer consents and device management."""

import uuid

import pytest
import httpx

pytestmark = [pytest.mark.customer]


@pytest.mark.asyncio
async def test_customer_consent_lifecycle(
    client: httpx.AsyncClient,
    admin_headers: dict,
    customer_headers: dict,
    customer_account: dict,
    base_url: str,
):
    """Customer can grant and withdraw a consent; admin can list it."""
    # Initially empty
    r = await client.get(f"{base_url}/me/consents", headers=customer_headers)
    assert r.status_code == 200
    original_count = len(r.json()["data"])

    # Grant consent
    r = await client.post(
        f"{base_url}/me/consents",
        headers=customer_headers,
        json={"consent_type": "marketing_email", "consent_version": "1.0"},
    )
    assert r.status_code == 200, f"Consent grant failed: {r.text}"
    consent_id = r.json()["data"]["id"]
    assert r.json()["data"]["status"] == "granted"

    # Customer sees consent
    r = await client.get(f"{base_url}/me/consents", headers=customer_headers)
    assert r.status_code == 200
    assert len(r.json()["data"]) == original_count + 1

    # Admin sees consent
    r = await client.get(
        f"{base_url}/admin/customers/consents?customer_id={customer_account['id']}",
        headers=admin_headers,
    )
    assert r.status_code == 200
    assert any(c["id"] == consent_id for c in r.json()["data"]["items"])

    # Withdraw consent
    r = await client.delete(f"{base_url}/me/consents/{consent_id}", headers=customer_headers)
    assert r.status_code == 204


@pytest.mark.asyncio
async def test_customer_device_lifecycle(
    client: httpx.AsyncClient,
    admin_headers: dict,
    customer_headers: dict,
    customer_account: dict,
    base_url: str,
):
    """Customer can register a device and admin can list it; customer can deregister."""
    suffix = uuid.uuid4().hex[:8]
    payload = {
        "device_fingerprint": f"e2e-test-device-{suffix}",
        "device_type": "mobile",
        "platform": "ios",
        "push_token": f"e2e-push-token-{suffix}",
    }
    r = await client.post(f"{base_url}/me/devices", headers=customer_headers, json=payload)
    assert r.status_code == 200, f"Device registration failed: {r.text}"
    device_id = r.json()["data"]["id"]

    # Admin list
    r = await client.get(
        f"{base_url}/admin/customers/devices?customer_id={customer_account['id']}",
        headers=admin_headers,
    )
    assert r.status_code == 200
    assert any(d["id"] == device_id for d in r.json()["data"]["items"])

    # Customer deregister
    r = await client.delete(f"{base_url}/me/devices/{device_id}", headers=customer_headers)
    assert r.status_code == 204
