"""End-to-end API test for HitPay endpoints (in-process, mocked external API)."""

import asyncio
import json
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from unittest.mock import patch

import httpx
import jwt as pyjwt
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

from app.core.config import get_settings
from app.main import app
from app.models.customer import Customer
from app.models.order import Order
from app.models.payment import Payment
from app.models.store import Store
from app.services.hitpay import _get_salt


class _MockResponse:
    def __init__(self, status_code: int, data: dict | None = None):
        self.status_code = status_code
        self._data = data or {}

    def json(self) -> dict:
        return self._data

    @property
    def text(self) -> str:
        return json.dumps(self._data)


class _MockAsyncClient:
    def __init__(self, responses: dict):
        self.responses = responses

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        pass

    def _match(self, method: str, url: str):
        for (m, needle), (status, data) in self.responses.items():
            if m == method and needle in url:
                return _MockResponse(status, data)
        return _MockResponse(500, {"error": f"unexpected {method} {url}"})

    async def post(self, url: str, **kwargs):
        return self._match("POST", url)

    async def get(self, url: str, **kwargs):
        return self._match("GET", url)

    async def delete(self, url: str, **kwargs):
        return self._match("DELETE", url)


def _mock_client(responses: dict):
    return _MockAsyncClient(responses)


async def _create_test_customer_and_order(db, suffix: str):
    email = f"hitpay-api-test-{suffix}@example.com"
    existing = await db.execute(select(Customer).where(Customer.email_address == email))
    customer = existing.scalar_one_or_none()
    if not customer:
        customer = Customer(
            email_address=email,
            display_name="HitPay API Test",
            given_name="HitPay",
            family_name="API",
            phone_number=f"+601234{int(suffix, 16) % 10000:04d}",
        )
        db.add(customer)
        await db.flush()
        await db.refresh(customer)

    store = await db.execute(select(Store).where(Store.id == 1))
    store = store.scalar_one_or_none()
    if not store:
        raise RuntimeError("Store 1 missing")

    order = Order(
        customer_id=customer.id,
        store_id=store.id,
        order_number=f"HITPAY-API-{suffix}",
        order_type="takeaway",
        order_channel="mobile_app",
        status="pending",
        payment_status="initiated",
        fulfillment_type="counter_pickup",
        item_count=1,
        items_subtotal=Decimal("15.00"),
        total_amount=Decimal("15.00"),
        total_amount_currency="MYR",
    )
    db.add(order)
    await db.flush()
    await db.refresh(order)
    return customer, order


async def _customer_token(customer: Customer) -> str:
    settings = get_settings()
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(customer.id),
        "type": "access",
        "iss": "fnb-enterprise-v3",
        "aud": "fnb-app",
        "iat": now,
        "exp": now + timedelta(hours=1),
    }
    return pyjwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


async def main():
    settings = get_settings()
    engine = create_async_engine(settings.database_url)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    import uuid

    suffix = uuid.uuid4().hex[:8]

    async with Session() as db:
        customer, order = await _create_test_customer_and_order(db, suffix)
        await db.commit()
        token = await _customer_token(customer)
        payment_request_id = f"hitpay-api-req-{suffix}"
        checkout_url = f"https://securecheckout.sandbox.hit-pay.com/payment-request/@test/{payment_request_id}/checkout"

        try:
            responses = {
                ("POST", "/v1/payment-requests"): (
                    200,
                    {
                        "id": payment_request_id,
                        "status": "pending",
                        "url": checkout_url,
                        "amount": "15.00",
                        "currency": "MYR",
                    },
                )
            }

            with patch("app.services.hitpay._hitpay_client", side_effect=lambda: _mock_client(responses)):
                async with httpx.AsyncClient(
                    transport=httpx.ASGITransport(app=app),
                    base_url="https://localhost",
                ) as ac:
                    r = await ac.post(
                        "/api/payments/intent",
                        json={
                            "order_id": order.id,
                            "provider": "hitpay",
                            "payment_method": "hitpay",
                        },
                        headers={"Authorization": f"Bearer {token}"},
                    )

            assert r.status_code == 201, f"intent failed: {r.text}"
            data = r.json()["data"]
            assert data["redirect_url"] == checkout_url
            payment_id = data["payment_id"]
            print("✓ POST /api/payments/intent returned HitPay redirect_url")

            # HitPay webhook
            payload = {
                "id": payment_request_id,
                "status": "completed",
                "amount": "15.00",
                "currency": "MYR",
                "reference_number": f"order-{order.id}-payment-{payment_id}",
                "payments": [
                    {
                        "id": f"hitpay-pay-{suffix}",
                        "payment_type": "touch_n_go",
                        "amount": "15.00",
                        "fees": "0.30",
                        "status": "succeeded",
                    }
                ],
            }
            body = json.dumps(payload).encode()
            salt = await _get_salt(db)
            assert salt, "HitPay salt not configured"
            import hmac, hashlib

            sig = hmac.new(salt.encode(), body, hashlib.sha256).hexdigest()

            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app=app),
                base_url="https://localhost",
            ) as ac:
                wh = await ac.post(
                    "/api/webhooks/hitpay",
                    content=body,
                    headers={
                        "Hitpay-Signature": sig,
                        "Hitpay-Event-Type": "completed",
                        "Hitpay-Event-Object": "payment_request",
                        "Content-Type": "application/json",
                    },
                )
            assert wh.status_code == 200, f"webhook failed: {wh.text}"
            wh_data = wh.json()["data"]
            assert wh_data["payment_id"] == payment_id
            print("✓ POST /api/webhooks/hitpay captured payment via signed payload")

            # Customer confirm (idempotent after webhook capture)
            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app=app),
                base_url="https://localhost",
            ) as ac:
                cr = await ac.post(
                    f"/api/payments/{payment_id}/confirm",
                    headers={"Authorization": f"Bearer {token}"},
                )
            assert cr.status_code == 200, f"confirm failed: {cr.text}"
            assert cr.json()["data"]["status"] == "captured"
            print("✓ POST /api/payments/{id}/confirm returned captured HitPay payment")

            # Create a second intent and cancel it (customer)
            payment_request_id_2 = f"hitpay-api-req-cancel-{suffix}"
            checkout_url_2 = f"https://securecheckout.sandbox.hit-pay.com/payment-request/@test/{payment_request_id_2}/checkout"
            cancel_responses = {
                ("POST", "/v1/payment-requests"): (
                    200,
                    {
                        "id": payment_request_id_2,
                        "status": "pending",
                        "url": checkout_url_2,
                        "amount": "15.00",
                        "currency": "MYR",
                    },
                ),
                ("DELETE", "/v1/payment-requests/"): (204, {}),
            }
            with patch("app.services.hitpay._hitpay_client", side_effect=lambda: _mock_client(cancel_responses)):
                async with httpx.AsyncClient(
                    transport=httpx.ASGITransport(app=app),
                    base_url="https://localhost",
                ) as ac:
                    r2 = await ac.post(
                        "/api/payments/intent",
                        json={
                            "order_id": order.id,
                            "provider": "hitpay",
                            "payment_method": "hitpay",
                        },
                        headers={"Authorization": f"Bearer {token}"},
                    )
                    assert r2.status_code == 201, f"second intent failed: {r2.text}"
                    payment_id_2 = r2.json()["data"]["payment_id"]
                    ca = await ac.post(
                        f"/api/payments/{payment_id_2}/cancel",
                        headers={"Authorization": f"Bearer {token}"},
                    )
            assert ca.status_code == 200, f"cancel failed: {ca.text}"
            assert ca.json()["data"]["status"] == "voided"
            print("✓ POST /api/payments/{id}/cancel voided pending HitPay payment")

            # Admin refund
            admin_token = pyjwt.encode(
                {"admin_id": 1, "type": "access", "iss": "fnb-enterprise-v3", "aud": "fnb-app", "iat": datetime.now(timezone.utc), "exp": datetime.now(timezone.utc) + timedelta(hours=1)},
                settings.jwt_secret,
                algorithm=settings.jwt_algorithm,
            )
            refund_responses = {
                ("POST", "/v1/refund"): (200, {"id": f"hitpay-refund-{suffix}", "status": "completed"})
            }
            with patch("app.services.hitpay._hitpay_client", side_effect=lambda: _mock_client(refund_responses)):
                async with httpx.AsyncClient(
                    transport=httpx.ASGITransport(app=app),
                    base_url="https://localhost",
                ) as ac:
                    rr = await ac.post(
                        f"/api/payments/{payment_id}/refund",
                        json={"amount": 5.0, "reason": "test refund", "reason_category": "customer_request"},
                        headers={"Authorization": f"Bearer {admin_token}"},
                    )
            assert rr.status_code == 201, f"refund failed: {rr.text}"
            assert rr.json()["data"]["status"] in ("completed", "pending")
            assert rr.json()["data"]["amount"] == 5.0
            print("✓ POST /api/payments/{id}/refund triggered HitPay refund")

            print("\nAll HitPay API endpoint checks passed.")

        finally:
            await db.execute(delete(Payment).where(Payment.order_id == order.id))
            await db.delete(order)
            await db.delete(customer)
            await db.commit()
            print("Cleaned up API test data.")


if __name__ == "__main__":
    asyncio.run(main())
