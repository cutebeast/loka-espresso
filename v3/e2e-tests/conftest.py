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


def gen_customer_token(customer_id: int) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(customer_id),
        "type": "access",
        "customer_id": customer_id,
        "iat": now,
        "exp": now + timedelta(hours=2),
        "iss": "fnb-enterprise-v3",
        "aud": "fnb-app",
        "jti": f"e2e-cust-{customer_id}-{now.timestamp()}",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


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
