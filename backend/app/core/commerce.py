from __future__ import annotations

from datetime import datetime, timezone
from math import atan2, cos, radians, sin, sqrt
from typing import Any

from fastapi import HTTPException
from sqlalchemy import func, select, update as sa_update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.utils import to_float
from app.models.loyalty import LoyaltyAccount, LoyaltyTier, LoyaltyTransaction
from app.models.notification import Notification
from app.models.order import Order, OrderStatus, Payment
from app.models.splash import AppConfig
from app.models.store import Store
from app.models.wallet import Wallet, WalletTransaction, WalletTxType


FLOW_A_TYPES = {"pickup", "delivery"}


def enum_value(value: Any) -> str:
    return value.value if hasattr(value, "value") else str(value)


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    earth_radius_km = 6371.0
    dlat = radians(lat2 - lat1)
    dlng = radians(lng2 - lng1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlng / 2) ** 2
    return earth_radius_km * 2 * atan2(sqrt(a), sqrt(1 - a))


def normalize_delivery_address(raw_address: Any) -> dict[str, Any]:
    if isinstance(raw_address, str):
        raw_address = {"address": raw_address}
    if not isinstance(raw_address, dict):
        raise HTTPException(status_code=400, detail="delivery_address must be an object")

    address = str(raw_address.get("address") or "").strip()
    if not address:
        raise HTTPException(status_code=400, detail="delivery_address.address is required")

    normalized: dict[str, Any] = {"address": address}
    for key in ("unit", "landmark", "recipient_name", "phone"):
        value = raw_address.get(key)
        if value is None:
            continue
        value_str = str(value).strip()
        if value_str:
            normalized[key] = value_str

    lat = raw_address.get("lat")
    lng = raw_address.get("lng")
    if (lat is None) != (lng is None):
        raise HTTPException(status_code=400, detail="Both delivery_address.lat and delivery_address.lng are required together")

    if lat is not None and lng is not None:
        try:
            normalized["lat"] = float(lat)
            normalized["lng"] = float(lng)
        except (TypeError, ValueError) as exc:
            raise HTTPException(status_code=400, detail="Invalid delivery coordinates") from exc

    return normalized


async def validate_delivery_request(
    db: AsyncSession,
    store_id: int,
    subtotal: float,
    raw_address: Any,
    customer_name: str | None = None,
    customer_phone: str | None = None,
) -> tuple[Store, dict[str, Any], float]:
    store_result = await db.execute(select(Store).where(Store.id == store_id, Store.is_active == True))
    store = store_result.scalar_one_or_none()
    if not store:
        raise HTTPException(status_code=404, detail="Selected store is not available for delivery")

    normalized = normalize_delivery_address(raw_address)
    if customer_name and not normalized.get("recipient_name"):
        normalized["recipient_name"] = customer_name
    if customer_phone and not normalized.get("phone"):
        normalized["phone"] = customer_phone

    cfg_result = await db.execute(select(AppConfig).where(AppConfig.key == "min_order_delivery"))
    cfg_row = cfg_result.scalar_one_or_none()
    min_delivery_order = to_float(cfg_row.value) if cfg_row and cfg_row.value is not None else 0.0
    if min_delivery_order > 0 and subtotal < min_delivery_order:
        raise HTTPException(
            status_code=400,
            detail=f"Delivery requires a minimum order of RM {min_delivery_order:.2f}",
        )

    normalized["store_id"] = store.id
    normalized["store_name"] = store.name

    if "lat" in normalized and "lng" in normalized and store.lat is not None and store.lng is not None:
        distance_km = _haversine_km(
            float(store.lat),
            float(store.lng),
            float(normalized["lat"]),
            float(normalized["lng"]),
        )
        max_radius_km = to_float(store.delivery_radius_km)
        normalized["distance_km"] = round(distance_km, 2)
        normalized["coverage_checked"] = True
        normalized["max_delivery_radius_km"] = round(max_radius_km, 2)
        if max_radius_km > 0 and distance_km > max_radius_km:
            raise HTTPException(
                status_code=400,
                detail=f"Address is outside this store's {max_radius_km:.2f} km delivery radius",
            )
    else:
        normalized["coverage_checked"] = False

    return store, normalized, min_delivery_order


async def get_or_create_wallet(user_id: int, db: AsyncSession) -> Wallet:
    result = await db.execute(select(Wallet).where(Wallet.user_id == user_id))
    wallet = result.scalar_one_or_none()
    if wallet is None:
        wallet = Wallet(user_id=user_id)
        db.add(wallet)
        await db.flush()
    return wallet


async def debit_wallet(db: AsyncSession, user_id: int, amount: float, description: str) -> tuple[Wallet, float]:
    """Atomically debit the wallet using SQL to prevent race conditions."""
    wallet = await get_or_create_wallet(user_id, db)
    await db.flush()

    stmt = (
        sa_update(Wallet)
        .where(Wallet.user_id == user_id, Wallet.balance >= amount)
        .values(balance=func.round(Wallet.balance - amount, 2))
        .returning(Wallet.id, Wallet.balance)
    )
    result = await db.execute(stmt)
    row = result.fetchone()

    if row is None:
        await db.refresh(wallet)
        current = to_float(wallet.balance)
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient wallet balance. Have RM {current:.2f}, need RM {amount:.2f}",
        )

    new_balance = to_float(row.balance)
    tx = WalletTransaction(
        wallet_id=wallet.id,
        user_id=user_id,
        amount=-amount,
        type=WalletTxType.payment,
        description=description,
        balance_after=new_balance,
    )
    db.add(tx)
    return wallet, new_balance


async def credit_wallet(db: AsyncSession, user_id: int, amount: float, description: str) -> tuple[Wallet, float]:
    """Atomically credit the wallet using SQL to prevent race conditions."""
    wallet = await get_or_create_wallet(user_id, db)
    await db.flush()

    stmt = (
        sa_update(Wallet)
        .where(Wallet.user_id == user_id)
        .values(balance=func.round(Wallet.balance + amount, 2))
        .returning(Wallet.id, Wallet.balance)
    )
    result = await db.execute(stmt)
    row = result.fetchone()

    new_balance = to_float(row.balance)
    tx = WalletTransaction(
        wallet_id=wallet.id,
        user_id=user_id,
        amount=amount,
        type=WalletTxType.topup,
        description=description,
        balance_after=new_balance,
    )
    db.add(tx)
    return wallet, new_balance


async def award_loyalty_for_paid_order(db: AsyncSession, order: Order) -> int:
    if order.loyalty_points_earned and order.loyalty_points_earned > 0:
        return int(order.loyalty_points_earned)

    cfg_result = await db.execute(select(AppConfig).where(AppConfig.key == "loyalty_points_per_rmse"))
    cfg_row = cfg_result.scalar_one_or_none()
    earn_rate = int(cfg_row.value) if cfg_row and cfg_row.value else 1

    la_result = await db.execute(select(LoyaltyAccount).where(LoyaltyAccount.user_id == order.user_id))
    account = la_result.scalar_one_or_none()

    multiplier = 1.0
    tier_name = account.tier if account else "bronze"
    if account:
        tier_result = await db.execute(select(LoyaltyTier).where(func.lower(LoyaltyTier.name) == account.tier.lower()))
        tier = tier_result.scalar_one_or_none()
        if tier:
            multiplier = float(tier.points_multiplier)

    points = int(round(to_float(order.total) * earn_rate * multiplier))
    if points <= 0:
        return 0

    if account:
        stmt = (
            sa_update(LoyaltyAccount)
            .where(LoyaltyAccount.id == account.id)
            .values(
                points_balance=func.round(LoyaltyAccount.points_balance + points, 0),
                total_points_earned=func.round(LoyaltyAccount.total_points_earned + points, 0),
            )
        )
        await db.execute(stmt)
        await db.refresh(account)
    else:
        account = LoyaltyAccount(
            user_id=order.user_id,
            points_balance=points,
            total_points_earned=points,
            tier=tier_name,
        )
        db.add(account)

    db.add(
        LoyaltyTransaction(
            user_id=order.user_id,
            order_id=order.id,
            store_id=order.store_id,
            points=points,
            type="earn",
            description=f"Points earned for order {order.order_number}",
        )
    )
    order.loyalty_points_earned = points

    lifetime_points = int(account.total_points_earned)
    promotion_result = await db.execute(
        select(LoyaltyTier)
        .where(LoyaltyTier.min_points <= lifetime_points)
        .order_by(LoyaltyTier.min_points.desc())
        .limit(1)
    )
    new_tier = promotion_result.scalar_one_or_none()
    if new_tier and account.tier != new_tier.name:
        account.tier = new_tier.name

    db.add(
        Notification(
            user_id=order.user_id,
            title="Payment successful",
            body=f"Payment confirmed for order {order.order_number}. +{points} points earned!",
            type="order",
        )
    )
    return points


async def credit_referral_points(
    db: AsyncSession,
    user_id: int,
    points: int,
    invitee_id: int,
) -> None:
    """Credit loyalty points to referrer when their referral places an order."""
    la_result = await db.execute(select(LoyaltyAccount).where(LoyaltyAccount.user_id == user_id))
    account = la_result.scalar_one_or_none()

    if account:
        stmt = (
            sa_update(LoyaltyAccount)
            .where(LoyaltyAccount.id == account.id)
            .values(
                points_balance=func.round(LoyaltyAccount.points_balance + points, 0),
                total_points_earned=func.round(LoyaltyAccount.total_points_earned + points, 0),
            )
        )
        await db.execute(stmt)
        await db.refresh(account)
    else:
        account = LoyaltyAccount(
            user_id=user_id,
            points_balance=points,
            total_points_earned=points,
            tier="bronze",
        )
        db.add(account)
        await db.flush()

    db.add(
        LoyaltyTransaction(
            user_id=user_id,
            points=points,
            type="earn",
            description=f"Referral reward for inviting user #{invitee_id}",
        )
    )


async def settle_order_payment(
    db: AsyncSession,
    order: Order,
    payment: Payment | None = None,
    *,
    transaction_id: str | None = None,
    provider_reference: str | None = None,
) -> int:
    if order.payment_status == "paid":
        return int(order.loyalty_points_earned or 0)

    order.payment_status = "paid"
    # Align with finalized customer journey: prepaid pickup/delivery goes straight to
    # confirmed so the kitchen can start preparing. The "paid" status is internal only.
    if enum_value(order.order_type) in FLOW_A_TYPES and enum_value(order.status) == OrderStatus.pending.value:
        order.status = OrderStatus.confirmed

    if payment is not None:
        payment.status = "paid"
        if transaction_id:
            payment.transaction_id = transaction_id
        if hasattr(payment, "provider_reference") and provider_reference:
            payment.provider_reference = provider_reference
        if hasattr(payment, "settled_at"):
            payment.settled_at = datetime.now(timezone.utc)

    return await award_loyalty_for_paid_order(db, order)


def serialize_order_item(item: dict[str, Any]) -> dict[str, Any]:
    price = to_float(item.get("unit_price", item.get("price", 0)))
    quantity = int(item.get("quantity", 0) or 0)
    return {
        **item,
        "price": price,
        "unit_price": price,
        "quantity": quantity,
        "line_total": round(price * quantity, 2),
    }
