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

# Seeded admin credentials (from scripts/seed_v3.py)
ADMIN_EMAIL = "admin@lokaespresso.my"
ADMIN_PASSWORD = "admin123"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def gen_admin_token() -> str:
    """Fallback token generator — only used if real login fails.

    Prefer the `admin_token` fixture which authenticates via the real
    /admin/auth/login endpoint (Phase 4A fix).
    """
    now = datetime.now(timezone.utc)
    payload = {
        "sub": "2",
        "type": "access",
        "iat": now,
        "exp": now + timedelta(hours=2),
        "iss": "fnb-enterprise-v3",
        "aud": "fnb-app",
        "jti": f"e2e-test-{now.timestamp()}",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def base_url() -> str:
    return BASE_URL


@pytest.fixture(scope="session")
def admin_token(base_url: str) -> str:
    """Authenticate via the real /admin/auth/login endpoint."""
    with httpx.Client(timeout=30.0) as c:
        r = c.post(f"{base_url}/admin/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD,
        })
    if r.status_code != 200:
        # Fall back to fabricated token if seed admin doesn't exist
        print(f"WARNING: Real admin login returned {r.status_code} — "
              f"falling back to fabricated JWT. Seed data may be missing.")
        return gen_admin_token()
    data = r.json()
    token = data.get("tokens", {}).get("access_token")
    if not token:
        # Try nested: data.data.tokens.access_token
        inner = data.get("data", {})
        token = inner.get("tokens", {}).get("access_token")
    if not token:
        print("WARNING: Could not extract access_token from admin login response. "
              "Falling back to fabricated JWT.")
        return gen_admin_token()
    return token


@pytest_asyncio.fixture
async def client() -> AsyncGenerator[httpx.AsyncClient, None]:
    async with httpx.AsyncClient(timeout=30.0) as c:
        yield c


@pytest.fixture
def admin_headers(admin_token: str) -> dict:
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def store_id() -> int:
    """Default active store for tests."""
    return 1


@pytest.fixture(scope="session")
def store_id_2() -> int:
    """Second active store for tests."""
    return 2


# ---------------------------------------------------------------------------
# Cleanup helpers
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session", autouse=True)
def cleanup_registry():
    """Track created resources for cleanup after all tests."""
    registry: dict[str, list[dict]] = {"customers": []}
    yield registry
    # Cleanup is best-effort — the backend may already be shut down
    if not registry["customers"]:
        return
    print(f"\n[cleanup] {len(registry['customers'])} test customers to delete...")
    try:
        token = gen_admin_token()
        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        with httpx.Client(timeout=10.0) as c:
            for cust in registry["customers"]:
                try:
                    c.delete(f"{BASE_URL}/admin/customers/{cust['id']}", headers=headers)
                except Exception:
                    pass
    except Exception:
        print("[cleanup] Admin auth for cleanup failed — skipping")
