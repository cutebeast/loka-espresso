"""Smoke test that creates a real HitPay sandbox payment request via the API."""

import asyncio
import jwt as pyjwt
from datetime import datetime, timezone, timedelta
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

from app.core.config import get_settings
from app.main import app
from app.models.customer import Customer
from app.models.order import Order
from app.models.payment import Payment
from app.models.store import Store
import httpx


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
        email = f"hitpay-sandbox-test-{suffix}@example.com"
        customer = Customer(
            email_address=email,
            display_name="HitPay Sandbox Test",
            given_name="HitPay",
            family_name="Sandbox",
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
            order_number=f"HITPAY-SBOX-{suffix}",
            order_type="takeaway",
            order_channel="mobile_app",
            status="pending",
            payment_status="initiated",
            fulfillment_type="counter_pickup",
            item_count=1,
            items_subtotal=15.00,
            total_amount=15.00,
            total_amount_currency="MYR",
        )
        db.add(order)
        await db.flush()
        await db.refresh(order)

        await db.commit()
        token = await _customer_token(customer)

        try:
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
                print(f"✓ Created real sandbox payment request")
                print(f"  payment_id: {data['payment_id']}")
                print(f"  redirect_url: {data['redirect_url']}")
                print(f"  status: {data['status']}")

                payment_id = data["payment_id"]
                ca = await ac.post(
                    f"/api/payments/{payment_id}/cancel",
                    headers={"Authorization": f"Bearer {token}"},
                )
                assert ca.status_code == 200, f"cancel failed: {ca.text}"
                print(f"✓ Cancelled local payment (status={ca.json()['data']['status']})")

        finally:
            await db.execute(delete(Payment).where(Payment.order_id == order.id))
            await db.delete(order)
            await db.delete(customer)
            await db.commit()
            print("Cleaned up sandbox smoke-test data.")


if __name__ == "__main__":
    asyncio.run(main())
