"""Security-focused tests for middleware and validation."""

import pytest


@pytest.mark.anyio
async def test_security_headers_present(client):
    """Security headers are present on responses."""
    resp = await client.get("/health")
    assert resp.status_code in (200, 503)
    assert resp.headers.get("x-content-type-options") == "nosniff"
    assert resp.headers.get("x-frame-options") == "DENY"
    assert resp.headers.get("strict-transport-security")


@pytest.mark.anyio
async def test_correlation_id_header(client):
    """Correlation ID is returned in response headers."""
    resp = await client.get("/health")
    assert resp.status_code in (200, 503)
    assert "x-correlation-id" in resp.headers


@pytest.mark.anyio
async def test_request_size_limit_rejects_oversized(client):
    """Oversized requests are rejected with 413."""
    large_body = "x" * (11 * 1024 * 1024)  # 11MB
    resp = await client.post("/api/v1/auth/login-password", data=large_body)
    assert resp.status_code == 413


@pytest.mark.anyio
async def test_invalid_json_rejected(client):
    """Malformed JSON is rejected gracefully."""
    resp = await client.post(
        "/api/v1/auth/login-password",
        content=b"not json",
        headers={"Content-Type": "application/json"}
    )
    assert resp.status_code == 422


