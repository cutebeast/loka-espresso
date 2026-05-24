"""Shared fixtures for FNB v3 E2E API test suite."""

import os
import sys
import jwt as pyjwt
import logging
import pytest
import pytest_asyncio
from datetime import datetime, timezone
from typing import AsyncGenerator
import httpx

logger = logging.getLogger(__name__)

BASE_URL = os.getenv("E2E_BASE_URL", "http://localhost:13800/api/v1")
JWT_SECRET = os.getenv("JWT_SECRET", "super-secret-jwt-key-for-development-only-12345")
JWT_ALGORITHM = "HS256"

# Bootstrap admin credentials — created by seed_v3.py if DB is blank
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "admin@lokaespresso.my")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin123")


# ---------------------------------------------------------------------------
# Auto-bootstrap: run seed_v3.py if no admin account exists
# ---------------------------------------------------------------------------

def _bootstrap_admin_if_needed(base_url: str) -> bool:
    """Run seed_v3.py if admin login fails — DB is blank and needs bootstrap."""
    token = _login_and_get_token(base_url, ADMIN_EMAIL, ADMIN_PASSWORD)
    if token:
        return True

    # DB is blank — run minimal seed
    logger.info("Admin login failed — DB appears blank. Running bootstrap seed...")
    seed_dir = os.path.join(os.path.dirname(__file__), "..", "backend", "scripts")
    if seed_dir not in sys.path:
        sys.path.insert(0, seed_dir)
    try:
        import seed_v3
        import asyncio as _asyncio
        _asyncio.run(seed_v3.main())
        logger.info("Bootstrap complete. Retrying admin login...")
        return True
    except Exception as e:
        logger.error("Bootstrap failed: %s", e)
        return False


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
    except httpx.ConnectError as e:
        logger.error("Admin login: backend connection refused — %s", e)
        return None
    except Exception as e:
        logger.error("Admin login: unexpected error — %s: %s", type(e).__name__, str(e))
        return None


def _is_token_expired(token: str) -> bool:
    """Check if a JWT token is expired (or expiring within 60 seconds)."""
    try:
        payload = pyjwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM], options={"verify_exp": True})
        exp = payload.get("exp")
        if exp is None:
            return True
        now = datetime.now(timezone.utc).timestamp()
        return now >= exp - 60
    except (pyjwt.ExpiredSignatureError, pyjwt.InvalidTokenError, pyjwt.DecodeError):
        return True


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def base_url() -> str:
    return BASE_URL


@pytest.fixture(scope="session")
def _admin_token_session(base_url: str) -> str:
    """Session-scoped admin token. Auto-bootstraps if DB is blank."""
    _bootstrap_admin_if_needed(base_url)
    token = _login_and_get_token(base_url, ADMIN_EMAIL, ADMIN_PASSWORD)
    if not token:
        pytest.skip("Backend not running or admin account could not be created")
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


@pytest.fixture(scope="session")
def discovered_admin_id(base_url: str, _admin_token_session: str) -> str:
    """Dynamically discover the admin ID via /admin/auth/me or JWT decode."""
    # Try the auth/me endpoint first
    try:
        with httpx.Client(timeout=10.0) as c:
            r = c.get(
                f"{base_url}/admin/auth/me",
                headers={"Authorization": f"Bearer {_admin_token_session}"},
            )
        if r.status_code == 200:
            data = r.json()
            profile = data.get("data", data)
            admin_id = profile.get("id") or profile.get("admin_id") or profile.get("sub")
            if admin_id is not None:
                return str(admin_id)
    except Exception as e:
        logger.warning("discovered_admin_id: /admin/auth/me failed — %s", e)

    # Fallback: decode the JWT to get the sub claim
    try:
        payload = pyjwt.decode(
            _admin_token_session, JWT_SECRET, algorithms=[JWT_ALGORITHM],
            options={"verify_exp": False},
        )
        sub = payload.get("sub")
        if sub is not None:
            return str(sub)
    except Exception as e:
        logger.warning("discovered_admin_id: JWT decode failed — %s", e)

    # Final fallback: return the hardcoded value
    return "2"


@pytest.fixture(scope="session")
def discovered_store_id(base_url: str) -> int:
    """Dynamically discover the first store ID via /admin/stores."""
    try:
        with httpx.Client(timeout=10.0) as c:
            r = c.get(f"{base_url}/stores")
        if r.status_code == 200:
            data = r.json()
            inner = data.get("data", data)
            items = inner.get("items", inner if isinstance(inner, list) else [])
            if items and len(items) > 0:
                return int(items[0]["id"])
    except Exception as e:
        logger.warning("discovered_store_id: /admin/stores failed — %s", e)

    # Fallback
    return 1


# ---------------------------------------------------------------------------
# Baseline test data — created via API if DB is blank
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session", autouse=True)
def _ensure_baseline_data(base_url: str, admin_headers: dict):
    """Create minimum test data via API if DB is blank (no stores exist).

    The seed_v3.py bootstrap only creates the admin account. Everything else —
    stores, loyalty tiers, menu items — is created here via the admin API.
    This keeps the seed minimal and tests self-contained.
    """
    created = False
    try:
        with httpx.Client(timeout=15.0) as c:
            # Check if stores exist
            r = c.get(f"{base_url}/admin/stores?per_page=1", headers=admin_headers)
            if r.status_code == 200:
                data = r.json().get("data", r.json())
                items = data.get("items", []) if isinstance(data, dict) else []
                if len(items) > 0:
                    logger.info("Baseline data exists — %d stores found, skipping creation", len(items))
                    return

            logger.info("No stores found — creating baseline test data via API...")

            # Create loyalty tiers
            tiers = [
                ("bronze",   "Bronze",   0,      1.0),
                ("silver",   "Silver",   500,    1.1),
                ("gold",     "Gold",     2000,   1.2),
                ("platinum", "Platinum", 10000,  1.5),
            ]
            tier_ids = {}
            for key, name, min_pts, mult in tiers:
                r = c.post(f"{base_url}/admin/loyalty/tiers", headers=admin_headers, json={
                    "tier_key": key, "display_name": name,
                    "minimum_points": min_pts, "points_multiplier": mult,
                    "color_hex": {"bronze":"#CD7F32","silver":"#C0C0C0","gold":"#FFD700","platinum":"#E5E4E2"}[key],
                })
                if r.status_code in (200, 201):
                    tier_ids[key] = r.json().get("data", r.json()).get("id", 0)
                    created = True

            # Create stores
            stores_data = [
                {"store_name": "Loka HQ", "store_code": "HQ001", "city": "Kuala Lumpur",
                 "address_line_1": "1 Jalan Test", "phone_number": "+60123456789", "postal_code": "50000"},
                {"store_name": "Loka Bangsar", "store_code": "BS001", "city": "Kuala Lumpur",
                 "address_line_1": "2 Jalan Test", "phone_number": "+60123456780", "postal_code": "59100"},
            ]
            for sd in stores_data:
                r = c.post(f"{base_url}/admin/stores", headers=admin_headers, json=sd)
                if r.status_code in (200, 201):
                    created = True

            if created:
                logger.info("Baseline test data created via API")
    except Exception as e:
        logger.warning("Failed to create baseline data: %s", e)


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
                except Exception as e:
                    logger.warning("[cleanup] Failed to revert points for customer %d: %s", adj.get("customer_id"), e)

            # Revert wallet top-ups
            for w in reversed(registry["wallet_topups"]):
                try:
                    c.post(
                        f"{BASE_URL}/admin/wallets/topup",
                        headers=headers,
                        json={"customer_id": w["customer_id"], "amount": -w["amount"], "reason": "E2E cleanup reversal"},
                    )
                except Exception as e:
                    logger.warning("[cleanup] Failed to revert wallet topup for customer %d: %s", w.get("customer_id"), e)

            # Cancel orders
            for order in reversed(registry["orders"]):
                try:
                    c.patch(
                        f"{BASE_URL}/admin/orders/{order['id']}/status",
                        headers=headers,
                        json={"status": "cancelled"},
                    )
                except Exception as e:
                    logger.warning("[cleanup] Failed to cancel order %d: %s", order.get("id"), e)

            # Delete customers
            for cust in registry["customers"]:
                try:
                    c.delete(f"{BASE_URL}/admin/customers/{cust['id']}", headers=headers)
                except Exception as e:
                    logger.warning("[cleanup] Failed to delete customer %d: %s", cust.get("id"), e)

    except Exception:
        logger.warning("[cleanup] Cleanup failed — skipping", exc_info=True)
