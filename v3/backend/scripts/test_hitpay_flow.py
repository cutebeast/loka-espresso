"""In-process HitPay integration smoke test.

This exercises the full backend flow against mocked HitPay API responses so
no real money moves. It requires a migrated/seeded local DB.
"""

import asyncio
import json
from contextlib import asynccontextmanager
from decimal import Decimal
from unittest.mock import patch

from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

from app.core.config import get_settings
from app.core.money import to_decimal
from app.models.customer import Customer
from app.models.order import Order
from app.models.payment import Payment
from app.models.store import Store
from app.services.payment import (
    PaymentError,
    cancel_payment,
    confirm_payment,
    create_payment_intent,
    process_webhook_event,
    refund_payment,
)


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
    """httpx.AsyncClient stand-in that returns scripted responses."""

    def __init__(self, responses: dict):
        # responses key: (method, url_contains) -> (status_code, data)
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


async def _get_or_create_test_customer(db, suffix: str) -> Customer:
    email = f"hitpay-test-{suffix}@example.com"
    result = await db.execute(select(Customer).where(Customer.email_address == email))
    customer = result.scalar_one_or_none()
    if customer:
        return customer
    customer = Customer(
        email_address=email,
        display_name="HitPay Test Customer",
        given_name="HitPay",
        family_name="Test",
        phone_number=f"+6012345{int(suffix, 16) % 10000:04d}",
    )
    db.add(customer)
    await db.flush()
    await db.refresh(customer)
    return customer


async def _create_test_order(db, customer: Customer, suffix: str) -> Order:
    store_result = await db.execute(select(Store).where(Store.id == 1))
    store = store_result.scalar_one_or_none()
    if store is None:
        raise RuntimeError("Store 1 not found; seed the DB first")

    order = Order(
        customer_id=customer.id,
        store_id=store.id,
        order_number=f"HITPAY-TEST-{suffix}",
        order_type="takeaway",
        order_channel="mobile_app",
        status="pending",
        payment_status="initiated",
        fulfillment_type="counter_pickup",
        item_count=1,
        items_subtotal=Decimal("10.00"),
        total_amount=Decimal("10.00"),
        total_amount_currency="MYR",
    )
    db.add(order)
    await db.flush()
    await db.refresh(order)
    return order


async def _cleanup(db, order: Order, customer: Customer):
    from sqlalchemy import delete
    await db.execute(delete(Payment).where(Payment.order_id == order.id))
    await db.delete(order)
    await db.delete(customer)
    await db.commit()


async def main():
    settings = get_settings()
    engine = create_async_engine(settings.database_url)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    import uuid

    suffix = uuid.uuid4().hex[:8]

    async with Session() as db:
        customer = await _get_or_create_test_customer(db, suffix)
        order = await _create_test_order(db, customer, suffix)

        try:
            # 1. Create HitPay payment intent
            payment_request_id = f"hitpay-req-{suffix}"
            hitpay_payment_id = f"hitpay-pay-{suffix}"
            checkout_url = f"https://securecheckout.sandbox.hit-pay.com/payment-request/@test/{payment_request_id}/checkout"

            create_responses = {
                ("POST", "/v1/payment-requests"): (
                    200,
                    {
                        "id": payment_request_id,
                        "status": "pending",
                        "url": checkout_url,
                        "amount": "10.00",
                        "currency": "MYR",
                        "reference_number": f"order-{order.id}-payment-1",
                    },
                )
            }

            with patch("app.services.hitpay._hitpay_client", side_effect=lambda: _mock_client(create_responses)):
                payment, provider_response = await create_payment_intent(
                    db=db,
                    order_id=order.id,
                    provider="hitpay",
                    payment_method_type="qr_pay",
                    payment_method_id=None,
                    return_url=None,
                    customer_id=customer.id,
                )

            assert payment.provider == "hitpay"
            assert payment.provider_transaction_id == payment_request_id
            assert payment.status == "pending_authorization"
            assert provider_response["redirect_url"] == checkout_url
            print("✓ create_payment_intent produced HitPay redirect URL")

            # 2. Simulate HitPay webhook: payment_request.completed
            webhook_payload = {
                "type": "payment_request.completed",
                "data": {
                    "object": {
                        "id": payment_request_id,
                        "status": "completed",
                        "amount": "10.00",
                        "currency": "MYR",
                        "reference_number": f"order-{order.id}-payment-1",
                        "payments": [
                            {
                                "id": hitpay_payment_id,
                                "payment_type": "duitnow",
                                "amount": "10.00",
                                "fees": "0.12",
                                "status": "succeeded",
                            }
                        ],
                    }
                },
            }
            await process_webhook_event(db, "hitpay", webhook_payload)
            await db.refresh(payment)
            await db.refresh(order)

            assert payment.status == "captured"
            assert payment.captured_amount == to_decimal("10.00")
            assert payment.fee_amount == to_decimal("0.12")
            assert payment.net_amount == to_decimal("9.88")
            assert payment.extra_metadata.get("hitpay_payment_id") == hitpay_payment_id
            assert order.payment_status == "captured"
            print("✓ HitPay webhook marked payment/order as captured with correct fee")

            # 3. Confirm payment idempotency (already captured)
            confirmed = await confirm_payment(db, payment.id)
            assert confirmed.status == "captured"
            print("✓ confirm_payment is idempotent when already captured")

            # 4. Refund partial amount
            refund_responses = {
                ("POST", "/v1/refund"): (
                    200,
                    {"id": f"hitpay-refund-{suffix}", "status": "completed"},
                )
            }
            with patch("app.services.hitpay._hitpay_client", side_effect=lambda: _mock_client(refund_responses)):
                refund = await refund_payment(
                    db=db,
                    payment_id=payment.id,
                    amount=Decimal("5.00"),
                    reason="Customer request",
                    reason_category="customer_request",
                    approved_by=None,
                )
            assert refund.provider_refund_id == f"hitpay-refund-{suffix}"
            assert refund.status == "completed"
            assert payment.status == "partially_refunded"
            assert payment.refunded_amount == to_decimal("5.00")
            print("✓ refund_payment called HitPay refund API and updated local state")

            # 5. Cancel a fresh pending payment
            cancel_payment_request_id = f"hitpay-req-cancel-{suffix}"
            cancel_responses = {
                ("POST", "/v1/payment-requests"): (
                    200,
                    {
                        "id": cancel_payment_request_id,
                        "status": "pending",
                        "url": checkout_url,
                        "amount": "10.00",
                        "currency": "MYR",
                    },
                ),
                ("DELETE", f"/v1/payment-requests/{cancel_payment_request_id}"): (204, {}),
            }
            with patch("app.services.hitpay._hitpay_client", side_effect=lambda: _mock_client(cancel_responses)):
                pending_payment, _ = await create_payment_intent(
                    db=db,
                    order_id=order.id,
                    provider="hitpay",
                    payment_method_type="qr_pay",
                    payment_method_id=None,
                    return_url=None,
                    customer_id=customer.id,
                )
                cancelled = await cancel_payment(db, pending_payment.id)
            assert cancelled.status == "voided"
            print("✓ cancel_payment voided pending HitPay payment")

            print("\nAll HitPay integration checks passed.")

        finally:
            await _cleanup(db, order, customer)
            print("Cleaned up test customer/order/payments.")


if __name__ == "__main__":
    asyncio.run(main())
