"""E2E coverage for GET /api/wallet/me — the customer wallet endpoint.

Regression: since round 36 the endpoint 500'd for EVERY customer
(`.limit(50)` nested inside `.order_by(...)`), but the only other caller
(test_payments_webhook.py) skips entirely when Stripe isn't configured, so
the break went unnoticed on dev. This test has no external dependencies and
always runs.
"""

import httpx
import pytest


async def _register_customer(client: httpx.AsyncClient, base_url: str, phone: str) -> dict:
    r = await client.post(
        f"{base_url}/auth/send-otp",
        json={"phone_number": phone},
    )
    assert r.status_code == 200, f"send-otp failed: {r.text}"
    r = await client.post(
        f"{base_url}/auth/login",
        json={"phone_number": phone, "otp_code": "000000"},
    )
    assert r.status_code == 200, f"login failed: {r.text}"
    body = r.json()
    token = body["tokens"]["access_token"]
    user_id = body["user_id"]
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}, user_id


@pytest.mark.asyncio
async def test_customer_wallet_me_roundtrip(client: httpx.AsyncClient, base_url: str, cleanup_registry: dict):
    """Wallet/me must 200 for a fresh customer, auto-create the wallet, and
    include vouchers/rewards arrays."""
    phone = f"+6019{uuid4_hex()}"
    headers, customer_id = await _register_customer(client, base_url, phone)
    cleanup_registry["customers"].append({"id": customer_id})

    r = await client.get(f"{base_url}/wallet/me", headers=headers)
    assert r.status_code == 200, f"wallet/me failed: {r.text}"
    data = r.json()["data"]
    assert "balance" in data
    assert isinstance(data.get("vouchers"), list)
    assert isinstance(data.get("rewards"), list)

    # Second call must not duplicate the wallet
    r2 = await client.get(f"{base_url}/wallet/me", headers=headers)
    assert r2.status_code == 200
    assert r2.json()["data"]["id"] == data["id"]


def uuid4_hex() -> str:
    import uuid
    return "".join(c for c in uuid.uuid4().hex if c.isdigit())[:8]
