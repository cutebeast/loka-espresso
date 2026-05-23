"""Shared fixtures for FNB v3 E2E API test suite."""

import jwt
import logging
import pytest
import pytest_asyncio
from datetime import datetime, timezone
from typing import AsyncGenerator
import httpx

logger = logging.getLogger(__name__)

BASE_URL = "http://localhost:13800/api/v1"
JWT_SECRET = "super-secret-jwt-key-for-development-only-12345"
JWT_ALGORITHM = "HS256"

# Seeded admin credentials (from scripts/seed_v3.py)
ADMIN_EMAIL = "admin@lokaespresso.my"
ADMIN_PASSWORD = "admin123"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _login_and_get_token(base_url: str, email: str, password: str, timeout: float = 30.0) -> str | None:
    """Login via /admin/auth/login and return access_token or None."""
    try:
        with httpx.Client(timeout=timeout) as c:
            r = c.post(f"{base_url}/admin/auth/login", json={"email": email, "password": password})
        if r.status_code != 200:
            return None
        data = r.json()
        token = data.get("tokens", {}).get("access_token")
        if not token:
            inner = data.get("data", {})
            token = inner.get("tokens", {}).get("access_token")
        return token
    except Exception:
        return None


def _is_token_expired(token: str) -> bool:
    """Check if a JWT token is expired (or expiring within 60 seconds)."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM], options={"verify_exp": True})
        exp = payload.get("exp")
        if exp is None:
            return True
        now = datetime.now(timezone.utc).timestamp()
        return now >= exp - 60
    except Exception:
        return True


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def base_url() -> str:
    return BASE_URL


@pytest.fixture(scope="session")
def _admin_token_session(base_url: str) -> str:
    """Session-scoped admin token (accessed via fresh_admin_token only)."""
    token = _login_and_get_token(base_url, ADMIN_EMAIL, ADMIN_PASSWORD)
    if not token:
        pytest.skip(
            "Real admin login returned non-200 — backend not running or seed data missing. "
            "Run seed script and start backend before executing E2E tests."
        )
    return token


@pytest.fixture
def admin_token(base_url: str, _admin_token_session: str) -> str:
    """Test-level admin token that refreshes if expired."""
    if _is_token_expired(_admin_token_session):
        token = _login_and_get_token(base_url, ADMIN_EMAIL, ADMIN_PASSWORD)
        if not token:
            pytest.skip("Admin token expired and refresh failed — backend not available.")
        return token
    return _admin_token_session


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
    """Track created resources for cleanup after all tests.

    Supported resource types: customers, orders, wallet_topups, point_adjustments.
    Cleanup reverses mutations in reverse order so dependencies are preserved.
    """
    registry: dict[str, list[dict]] = {
        "customers": [],
        "orders": [],
        "wallet_topups": [],
        "point_adjustments": [],
    }
    yield registry

    has_resources = any(len(v) > 0 for v in registry.values())
    if not has_resources:
        return

    logger.info("[cleanup] Starting post-test resource cleanup (customers=%d, orders=%d, wallet_topups=%d, point_adjustments=%d)",
                len(registry["customers"]), len(registry["orders"]),
                len(registry["wallet_topups"]), len(registry["point_adjustments"]))

    try:
        with httpx.Client(timeout=10.0) as c:
            token = _login_and_get_token(BASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD)
            if not token:
                logger.warning("[cleanup] Admin login failed — skipping cleanup")
                return
            headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

            # Revert point adjustments
            for adj in reversed(registry["point_adjustments"]):
                try:
                    c.post(
                        f"{BASE_URL}/admin/customers/{adj['customer_id']}/adjust-points",
                        headers=headers,
                        json={"points": -adj["points"], "reason": "E2E cleanup reversal"},
                    )
                except Exception:
                    pass

            # Revert wallet top-ups (no undo endpoint, but we can try a negative top-up)
            for w in reversed(registry["wallet_topups"]):
                try:
                    c.post(
                        f"{BASE_URL}/admin/wallets/topup",
                        headers=headers,
                        json={"customer_id": w["customer_id"], "amount": -w["amount"], "reason": "E2E cleanup reversal"},
                    )
                except Exception:
                    pass

            # Cancel orders
            for order in reversed(registry["orders"]):
                try:
                    c.patch(
                        f"{BASE_URL}/admin/orders/{order['id']}/status",
                        headers=headers,
                        json={"status": "cancelled"},
                    )
                except Exception:
                    pass

            # Delete customers
            for cust in registry["customers"]:
                try:
                    c.delete(f"{BASE_URL}/admin/customers/{cust['id']}", headers=headers)
                except Exception:
                    pass

    except Exception:
        logger.warning("[cleanup] Cleanup failed — skipping", exc_info=True)
