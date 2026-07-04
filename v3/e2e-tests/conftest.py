"""Shared fixtures for FNB v3 E2E API test suite."""

import hashlib
import hmac
import json
import logging
import os
import sys
import time
import jwt as pyjwt
import pytest
import pytest_asyncio
from datetime import datetime, timezone
from typing import AsyncGenerator
import httpx

logger = logging.getLogger(__name__)

try:
    import psycopg2
except ImportError:
    psycopg2 = None  # type: ignore

BASE_URL = os.getenv("E2E_BASE_URL", "http://localhost:13800/api")
JWT_SECRET = os.getenv("JWT_SECRET", "super-secret-jwt-key-for-development-only-12345")
JWT_ALGORITHM = "HS256"

# Bootstrap admin credentials — created by seed_v3.py if DB is blank
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "admin@loyaltysystem.uk")
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


def _get_database_url() -> str:
    """Return the sync PostgreSQL URL used by the backend."""
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        backend_env = os.path.join(os.path.dirname(__file__), "..", "backend", ".env")
        if os.path.exists(backend_env):
            with open(backend_env, "r") as f:
                for line in f:
                    line = line.strip()
                    if line.startswith("DATABASE_URL="):
                        db_url = line.split("=", 1)[1]
                        break
    if not db_url:
        db_url = "postgresql://fnb_user:fnb_pass@localhost:13334/fnb_enterprise_v3"
    return db_url.replace("postgresql+asyncpg://", "postgresql://")


def _get_stripe_webhook_secret() -> str | None:
    """Read the configured Stripe webhook secret from platform_config."""
    try:
        import psycopg2
        conn = psycopg2.connect(_get_database_url())
        cur = conn.cursor()
        cur.execute(
            "SELECT config_value FROM platform_config WHERE config_key = 'stripe.webhook_secret' LIMIT 1"
        )
        row = cur.fetchone()
        conn.close()
        if row and row[0]:
            return row[0]
    except Exception as e:
        logger.warning("Failed to read stripe.webhook_secret from DB: %s", e)
    return os.getenv("STRIPE_WEBHOOK_SECRET") or None


def sign_stripe_webhook_payload(payload: dict, secret: str, timestamp: int | None = None) -> str:
    """Generate a Stripe-Signature header value for a synthetic webhook event."""
    ts = timestamp or int(time.time())
    payload_bytes = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    signed_payload = f"{ts}.".encode("utf-8") + payload_bytes
    signature = hmac.new(secret.encode("utf-8"), signed_payload, hashlib.sha256).hexdigest()
    return f"t={ts},v1={signature}"


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


@pytest.fixture
def customer_account(base_url: str, cleanup_registry: dict) -> dict:
    """Register a unique runtime customer for the E2E session."""
    import uuid

    suffix = uuid.uuid4().hex[:8]
    email = f"e2e-runtime-{suffix}@test.com"
    fingerprint = f"e2e-runtime-device-{suffix}"
    with httpx.Client(timeout=15.0) as c:
        r = c.post(
            f"{base_url}/auth/register",
            json={"email_address": email, "display_name": "E2E Runtime Customer", "device_fingerprint": fingerprint},
        )
        assert r.status_code in (200, 201), f"Customer registration failed: {r.text}"
        data = r.json()
        customer_id = data["user_id"]
        token = data["tokens"]["access_token"]
        cleanup_registry["customers"].append({"id": customer_id})
        return {
            "id": customer_id,
            "email": email,
            "token": token,
            "headers": {"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        }


@pytest.fixture
def customer_headers(customer_account: dict) -> dict:
    return customer_account["headers"]


@pytest.fixture(scope="session")
def staff_headers(base_url: str) -> dict:
    """Authenticate as the seeded Test Staff using PIN."""
    with httpx.Client(timeout=15.0) as c:
        r = c.post(
            f"{base_url}/staff/auth/login",
            json={"display_name": "Test Staff", "store_id": 1, "password": "1234"},
        )
        assert r.status_code == 200, f"Staff login failed: {r.text}"
        token = r.json()["tokens"]["access_token"]
        return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


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
def discovered_store_id(base_url: str, _admin_token_session: str) -> int:
    """Dynamically discover the first store ID via /admin/stores."""
    try:
        headers = {"Authorization": f"Bearer {_admin_token_session}", "Content-Type": "application/json"}
        with httpx.Client(timeout=10.0) as c:
            r = c.get(f"{base_url}/admin/stores", headers=headers)
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
def _ensure_baseline_data(base_url: str, _admin_token_session: str):
    """Create minimum test data via API if DB is blank (no stores exist).

    The seed_v3.py bootstrap only creates the admin account. Everything else —
    stores, loyalty tiers, menu items, test staff — is created here via the admin API.
    This keeps the seed minimal and tests self-contained.
    """
    admin_headers = {"Authorization": f"Bearer {_admin_token_session}", "Content-Type": "application/json"}
    created = False

    # Unlock any locked staff accounts so PIN login tests don't hit 423
    try:
        import psycopg2
        conn = psycopg2.connect(_get_database_url())
        cur = conn.cursor()
        cur.execute(
            "UPDATE staff_profiles SET locked_until = NULL, failed_login_count = 0 WHERE locked_until IS NOT NULL"
        )
        if cur.rowcount > 0:
            logger.info("Unlocked %d staff account(s)", cur.rowcount)
        conn.commit()
        conn.close()
    except Exception as e:
        logger.warning("Failed to unlock staff accounts: %s", e)

    # Replenish inventory stock so order-creation tests don't hit "Insufficient stock".
    try:
        import psycopg2
        conn = psycopg2.connect(_get_database_url())
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO inventory_stock (inventory_item_id, store_id, current_stock, reserved_stock, reorder_level, reorder_quantity, par_level)
            SELECT ii.id, s.id, 10000, 0, 100, 1000, 10000
            FROM inventory_items ii
            CROSS JOIN stores s
            WHERE s.deleted_at IS NULL
            ON CONFLICT (inventory_item_id, store_id)
            DO UPDATE SET current_stock = EXCLUDED.current_stock,
                          reserved_stock = EXCLUDED.reserved_stock,
                          reorder_level = EXCLUDED.reorder_level,
                          reorder_quantity = EXCLUDED.reorder_quantity,
                          par_level = EXCLUDED.par_level
            """
        )
        if cur.rowcount > 0:
            logger.info("Replenished stock for %d inventory/store combinations", cur.rowcount)
        conn.commit()
        conn.close()
    except Exception as e:
        logger.warning("Failed to replenish inventory stock: %s", e)

    try:
        with httpx.Client(timeout=15.0) as c:
            # ── Check/create stores ──
            r = c.get(f"{base_url}/admin/stores?per_page=1", headers=admin_headers)
            stores_exist = False
            if r.status_code == 200:
                data = r.json().get("data", r.json())
                items = data.get("items", []) if isinstance(data, dict) else []
                stores_exist = len(items) > 0

            if not stores_exist:
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

            # ── Ensure test staff with known PIN exists ──
            r_staff = c.get(f"{base_url}/staff/auth/names", headers=admin_headers)
            staff_list = r_staff.json().get("data", []) if r_staff.status_code == 200 else []
            has_test_staff = any(s["display_name"] == "Test Staff" for s in staff_list)

            if not has_test_staff:
                logger.info("No 'Test Staff' found — creating test staff member...")
                r_create = c.post(f"{base_url}/admin/staff", headers=admin_headers, json={
                    "display_name": "Test Staff",
                    "email": "teststaff@lokaespresso.my",
                    "password": "TestStaff123!",
                    "pin": "1234",
                    "store_id": 1,
                    "role": "cashier",
                })
                if r_create.status_code in (200, 201):
                    logger.info("Test staff created successfully")
                    created = True
                else:
                    logger.warning("Failed to create test staff: %s", r_create.text)

            if created:
                logger.info("Baseline test data created via API")
    except Exception as e:
        logger.warning("Failed to create baseline data: %s", e)


# ---------------------------------------------------------------------------
# Cleanup helpers
# ---------------------------------------------------------------------------

def _purge_customer_records(customer_ids: list[int]) -> None:
    """Hard-delete test customers and all their dependent records from the DB.

    This complements the API-level cleanup by removing rows that would otherwise
    be left behind (payments, refunds, ledger entries, addresses, etc.).
    """
    if not psycopg2 or not customer_ids:
        return

    db_url = _get_database_url()
    if not db_url:
        logger.warning("[cleanup] No DATABASE_URL available for DB purge")
        return

    sync_url = db_url.replace("postgresql+asyncpg://", "postgresql://")
    ids_sql = ",".join(str(cid) for cid in customer_ids)

    # Delete leaf-to-root. Errors are logged and skipped so a single stuck
    # dependency does not abort the whole cleanup.
    ids_sql = ",".join(str(cid) for cid in customer_ids)
    order_subquery = "SELECT id FROM orders WHERE customer_id IN ({})".format(ids_sql)
    payment_subquery = "SELECT id FROM payments WHERE order_id IN ({})".format(order_subquery)
    cart_subquery = "SELECT id FROM customer_carts WHERE customer_id IN ({})".format(ids_sql)
    wallet_subquery = "SELECT id FROM wallets WHERE customer_id IN ({})".format(ids_sql)

    delete_statements = [
        ("payment_events", f"payment_id IN ({payment_subquery})"),
        ("refunds", f"order_id IN ({order_subquery}) OR payment_id IN ({payment_subquery})"),
        ("payments", f"order_id IN ({order_subquery})"),
        ("order_status_log", f"order_id IN ({order_subquery})"),
        ("order_modification_logs", f"order_id IN ({order_subquery})"),
        ("order_adjustments", f"order_id IN ({order_subquery})"),
        ("order_fulfillment", f"order_id IN ({order_subquery})"),
        ("order_line_items", f"order_id IN ({order_subquery})"),
        ("tip_allocations", f"order_id IN ({order_subquery})"),
        ("orders", f"customer_id IN ({ids_sql})"),
        ("cart_line_items", f"cart_id IN ({cart_subquery})"),
        ("customer_carts", f"customer_id IN ({ids_sql})"),
        ("loyalty_points_ledger", f"customer_id IN ({ids_sql})"),
        ("loyalty_accounts", f"customer_id IN ({ids_sql})"),
        ("customer_vouchers", f"customer_id IN ({ids_sql})"),
        ("customer_rewards", f"customer_id IN ({ids_sql})"),
        ("customer_consents", f"customer_id IN ({ids_sql})"),
        ("notification_delivery_log", f"message_id IN (SELECT id FROM notification_messages WHERE customer_id IN ({ids_sql}))"),
        ("notification_messages", f"customer_id IN ({ids_sql})"),
        ("notification_preferences", f"customer_id IN ({ids_sql})"),
        ("customer_devices", f"customer_id IN ({ids_sql})"),
        ("customer_addresses", f"customer_id IN ({ids_sql})"),
        ("feedback_entries", f"customer_id IN ({ids_sql})"),
        ("reservations", f"customer_id IN ({ids_sql})"),
        ("referral_events", f"referrer_customer_id IN ({ids_sql}) OR invitee_customer_id IN ({ids_sql})"),
        ("event_rsvps", f"customer_id IN ({ids_sql})"),
        ("survey_responses", f"customer_id IN ({ids_sql})"),
        ("wallet_ledger_entries", f"wallet_id IN ({wallet_subquery})"),
        ("wallets", f"customer_id IN ({ids_sql})"),
        ("wallet_topup_sessions", f"customer_id IN ({ids_sql})"),
        ("customers", f"id IN ({ids_sql})"),
    ]

    conn = None
    try:
        conn = psycopg2.connect(sync_url)
        for table, where in delete_statements:
            cur = conn.cursor()
            try:
                cur.execute(f"DELETE FROM {table} WHERE {where}")
                if cur.rowcount:
                    logger.info("[cleanup] Deleted %d rows from %s", cur.rowcount, table)
                conn.commit()
            except Exception as e:
                conn.rollback()
                logger.warning("[cleanup] Failed to delete from %s: %s", table, e)
            finally:
                cur.close()
    except Exception as e:
        logger.warning("[cleanup] DB purge failed: %s", e)
    finally:
        if conn is not None:
            conn.close()


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
                        json={"status": "cancelled_by_merchant"},
                    )
                except Exception as e:
                    logger.warning("[cleanup] Failed to cancel order %d: %s", order.get("id"), e)

            # Delete customers via API (soft delete)
            for cust in registry["customers"]:
                try:
                    c.delete(f"{BASE_URL}/admin/customers/{cust['id']}", headers=headers)
                except Exception as e:
                    logger.warning("[cleanup] Failed to delete customer %d: %s", cust.get("id"), e)

    except Exception:
        logger.warning("[cleanup] Cleanup failed — skipping", exc_info=True)

    # Hard-delete tracked test customers and all dependent rows to prevent DB bloat.
    tracked_ids = [cust["id"] for cust in registry.get("customers", []) if cust.get("id")]
    if tracked_ids:
        _purge_customer_records(tracked_ids)

    # Safety net: purge any other customers that match known test email patterns
    # (catches tests that register customers but forget to add them to the registry).
    try:
        sync_url = _get_database_url()
        conn = psycopg2.connect(sync_url)
        cur = conn.cursor()
        cur.execute(
            """
            SELECT id FROM customers
            WHERE email_address LIKE 'e2e_%%'
               OR email_address LIKE '%%@example.com'
               OR email_address LIKE '%%@test.com'
            """
        )
        leftover_ids = [r[0] for r in cur.fetchall()]
        conn.close()
        if leftover_ids:
            logger.info("[cleanup] Purging %d leftover test customers not in registry", len(leftover_ids))
            _purge_customer_records(leftover_ids)
    except Exception:
        logger.warning("[cleanup] Failed to purge leftover test customers", exc_info=True)
