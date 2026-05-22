"""Shared fixtures for FNB v3 E2E API test suite."""

import asyncio
import jwt
import pytest
import pytest_asyncio
from datetime import datetime, timezone, timedelta
from typing import AsyncGenerator
import httpx

BASE_URL = "http://localhost:13800/api/v1"
JWT_SECRET = "super-secret-jwt-key-for-development-only-12345"
JWT_ALGORITHM = "HS256"
ADMIN_ID = 2


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def gen_admin_token() -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(ADMIN_ID),
        "type": "access",
        "iat": now,
        "exp": now + timedelta(hours=2),
        "iss": "fnb-enterprise-v3",
        "aud": "fnb-app",
        "jti": f"e2e-test-{now.timestamp()}",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


@pytest.fixture(scope="session")
def customer_token(base_url: str) -> str:
    """Dynamically register a test customer and return a real access token."""
    import httpx
    ts = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    payload = {
        "email_address": f"e2e-session-{ts}@example.com",
        "display_name": f"E2E Session Customer {ts}",
        "device_fingerprint": f"e2e-session-{ts}",
    }
    with httpx.Client(timeout=30.0) as c:
        r = c.post(f"{base_url}/auth/register", json=payload)
    if r.status_code != 201:
        raise RuntimeError(f"Failed to bootstrap session customer: {r.status_code} {r.text}")
    return r.json()["tokens"]["access_token"]


@pytest.fixture(scope="session")
def customer_headers(customer_token: str) -> dict:
    return {"Authorization": f"Bearer {customer_token}", "Content-Type": "application/json"}


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def admin_token() -> str:
    return gen_admin_token()


@pytest.fixture(scope="session")
def base_url() -> str:
    return BASE_URL


@pytest_asyncio.fixture
async def client() -> AsyncGenerator[httpx.AsyncClient, None]:
    async with httpx.AsyncClient(timeout=30.0) as c:
        yield c


@pytest_asyncio.fixture
async def admin_headers(admin_token: str) -> dict:
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def store_id() -> int:
    """Default active store for tests."""
    return 1


@pytest.fixture(scope="session")
def store_id_2() -> int:
    """Second active store for tests."""
    return 2
