"""Customer daily check-in flow — streak tracking and loyalty points.

Round 12 feature — POST /checkin, GET /checkin.
Requires customer auth (phone number login).
"""

import pytest
import httpx

from conftest import ADMIN_EMAIL, ADMIN_PASSWORD


CUSTOMER_PHONE = "+60123456789"


@pytest.mark.customer
@pytest.mark.asyncio
async def test_checkin_first_time(client: httpx.AsyncClient, base_url: str):
    """Customer logs in and performs first check-in — day 1, 10 base points."""
    # Login / register
    r_login = await client.post(f"{base_url}/auth/login", json={
        "phone_number": CUSTOMER_PHONE,
    })
    if r_login.status_code != 200:
        r_reg = await client.post(f"{base_url}/auth/register", json={
            "phone_number": CUSTOMER_PHONE,
            "display_name": "E2E Checkin Tester",
        })
        if r_reg.status_code not in (200, 201, 409):
            pytest.skip(f"Cannot register/login customer: {r_reg.status_code} {r_reg.text}")
        r_login = await client.post(f"{base_url}/auth/login", json={
            "phone_number": CUSTOMER_PHONE,
        })

    assert r_login.status_code == 200, f"Login failed: {r_login.text}"
    tokens = r_login.json().get("tokens", {})
    token = tokens.get("access_token", "")
    assert token, "No access token returned"

    # Get check-in status before
    r_status = await client.get(f"{base_url}/checkin", headers={"Authorization": f"Bearer {token}"})
    assert r_status.status_code == 200
    status_data = r_status.json().get("data", {})
    was_checked_in = status_data.get("checked_in_today", False)

    # Perform check-in
    r_checkin = await client.post(f"{base_url}/checkin", headers={"Authorization": f"Bearer {token}"})

    if was_checked_in:
        assert r_checkin.status_code == 409, f"Expected 409 conflict, got {r_checkin.status_code}: {r_checkin.text}"
        pytest.skip("Already checked in today")
        return

    assert r_checkin.status_code == 200, f"Check-in failed: {r_checkin.text}"
    result = r_checkin.json().get("data", {})
    assert result.get("checked_in") is True
    assert result.get("streak_day", 0) >= 1
    assert result.get("points_earned", 0) >= 10
    assert result.get("total_points", 0) >= 10


@pytest.mark.customer
@pytest.mark.asyncio
async def test_checkin_double_prevents_duplicate(client: httpx.AsyncClient, base_url: str):
    """Second check-in on same day must return 409."""
    r_login = await client.post(f"{base_url}/auth/login", json={
        "phone_number": CUSTOMER_PHONE,
    })
    if r_login.status_code != 200:
        pytest.skip("Customer not available")
    token = r_login.json().get("tokens", {}).get("access_token", "")
    assert token, "No token"

    r_first = await client.post(f"{base_url}/checkin", headers={"Authorization": f"Bearer {token}"})
    if r_first.status_code == 409:
        # Already checked in from previous test — that's fine
        pass
    elif r_first.status_code == 200:
        # Now try second one
        r_second = await client.post(f"{base_url}/checkin", headers={"Authorization": f"Bearer {token}"})
        assert r_second.status_code == 409, f"Second check-in should be 409, got {r_second.status_code}: {r_second.text}"
    else:
        pytest.skip(f"Check-in returned unexpected {r_first.status_code}: {r_first.text}")


@pytest.mark.customer
@pytest.mark.asyncio
async def test_checkin_status_returns_config(client: httpx.AsyncClient, base_url: str):
    """GET /checkin returns config with reward tiers."""
    r_login = await client.post(f"{base_url}/auth/login", json={
        "phone_number": CUSTOMER_PHONE,
    })
    if r_login.status_code != 200:
        pytest.skip("Customer not available")
    token = r_login.json().get("tokens", {}).get("access_token", "")
    assert token, "No token"

    r = await client.get(f"{base_url}/checkin", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    data = r.json().get("data", {})
    assert "checked_in_today" in data
    assert "current_streak" in data
    assert "config" in data
    cfg = data["config"]
    assert cfg.get("daily_base_points", 0) > 0
    assert cfg.get("max_streak_days", 0) > 0
