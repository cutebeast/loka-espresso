"""Authentication endpoint tests."""

import pytest


@pytest.mark.anyio
async def test_session_endpoint_no_cookie(client):
    """Session check without token returns authenticated=False."""
    resp = await client.get("/api/v1/auth/session")
    assert resp.status_code == 200
    data = resp.json()
    assert data["authenticated"] is False


@pytest.mark.anyio
async def test_docs_endpoint_accessible(client):
    """Swagger docs are accessible without auth."""
    resp = await client.get("/docs")
    assert resp.status_code == 200


@pytest.mark.anyio
async def test_openapi_schema_accessible(client):
    """OpenAPI schema is accessible without auth."""
    resp = await client.get("/openapi.json")
    assert resp.status_code == 200
    data = resp.json()
    assert "paths" in data


@pytest.mark.anyio
async def test_health_endpoint_returns_valid_status(client):
    """Health check returns 200 (healthy) or 503 (DB unavailable)."""
    resp = await client.get("/health")
    assert resp.status_code in (200, 503)
