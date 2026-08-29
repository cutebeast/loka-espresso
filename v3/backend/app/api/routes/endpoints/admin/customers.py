"""Admin customer management endpoints."""

import re
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import case, func, select
from sqlalchemy.orm import selectinload

from app.api.routes.deps import CurrentAdmin, DBDependency, require_hq_write_admin, require_store_admin
from app.models.customer import Customer, CustomerAddress, CustomerConsent, CustomerDevice
from app.models.loyalty import LoyaltyAccount, LoyaltyPointsLedger, LoyaltyTier
from app.models.order import Order
from app.models.wallet import Wallet, WalletLedgerEntry
from app.models.reward import CustomerReward
from app.models.voucher import CustomerVoucher, VoucherDefinition
from app.models.platform import AuditLog
from app.models.store import Store
from app.schemas.base import APIResponse, PaginatedResponse
from app.services.platform_config import PlatformConfigService
from app.schemas.customer import (
    AdjustPointsRequest,
    AdminWorkshopBookingRequest,
    AwardVoucherRequest,
    CustomerCreate,
    CustomerUpdate,
    SetTierRequest,
)

router = APIRouter(prefix="/admin/customers", tags=["admin — customers"])


@router.get("", response_model=APIResponse[PaginatedResponse[dict]])
async def list_customers(
    admin: CurrentAdmin,
    db: DBDependency,
    search: str | None = Query(None, description="Search by name, phone, or email"),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=500),
):
    """List all customers with search."""
    base_stmt = select(Customer).where(
        Customer.deleted_at.is_(None),
        Customer.anonymized_at.is_(None),
    )
    count_stmt = select(func.count(Customer.id)).where(
        Customer.deleted_at.is_(None),
        Customer.anonymized_at.is_(None),
    )

    if search:
        search_term = f"%{search}%"
        base_stmt = base_stmt.where(
            (Customer.display_name.ilike(search_term))
            | (Customer.phone_number.ilike(search_term))
            | (Customer.email_address.ilike(search_term))
        )
        count_stmt = count_stmt.where(
            (Customer.display_name.ilike(search_term))
            | (Customer.phone_number.ilike(search_term))
            | (Customer.email_address.ilike(search_term))
        )

    total = (await db.execute(count_stmt)).scalar() or 0

    stmt = (
        base_stmt.order_by(Customer.id.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    result = await db.execute(stmt)
    customers = result.scalars().all()

    items = []
    for c in customers:
        items.append({
            "id": c.id,
            "display_name": c.display_name,
            "phone_number": c.phone_number,
            "email_address": c.email_address,
            "referral_code": c.referral_code,
            "order_count": c.order_count,
            "lifetime_value": float(c.lifetime_value),
            "is_active": c.is_active,
            "created_at": c.created_at.isoformat() if c.created_at else None,
            "last_order_at": c.last_order_at.isoformat() if c.last_order_at else None,
        })

    return APIResponse(
        data=PaginatedResponse(
            items=items,
            total=total,
            page=page,
            per_page=per_page,
            total_pages=(total + per_page - 1) // per_page if per_page else 0,
        )
    )


@router.get("/{customer_id}", response_model=APIResponse[dict])
async def get_customer_detail(admin: CurrentAdmin, db: DBDependency, customer_id: int):
    """Get customer detail with loyalty and wallet info."""
    result = await db.execute(
        select(Customer).where(Customer.id == customer_id, Customer.deleted_at.is_(None))
    )
    customer = result.scalar_one_or_none()
    if customer is None:
        raise HTTPException(status_code=404, detail="Customer not found")

    # Loyalty account
    l_result = await db.execute(
        select(LoyaltyAccount).where(LoyaltyAccount.customer_id == customer_id)
    )
    loyalty = l_result.scalar_one_or_none()

    # Wallet
    w_result = await db.execute(
        select(Wallet).where(Wallet.customer_id == customer_id)
    )
    wallet = w_result.scalar_one_or_none()
    wallet_balance = 0.0
    if wallet:
        balance_result = await db.execute(
            select(func.sum(case(
                (WalletLedgerEntry.entry_type.in_(["credit", "release", "adjustment"]), WalletLedgerEntry.amount),
                (WalletLedgerEntry.entry_type.in_(["debit", "hold"]), -WalletLedgerEntry.amount),
                else_=0,
            ))).where(WalletLedgerEntry.wallet_id == wallet.id)
        )
        wallet_balance = float(balance_result.scalar() or 0)

    # Addresses
    addr_result = await db.execute(
        select(CustomerAddress).where(
            CustomerAddress.customer_id == customer_id,
            CustomerAddress.deleted_at.is_(None),
        )
    )
    addresses = addr_result.scalars().all()

    # Recent orders
    order_result = await db.execute(
        select(Order)
        .where(Order.customer_id == customer_id, Order.deleted_at.is_(None))
        .order_by(Order.id.desc())
        .limit(10)
    )
    orders = order_result.scalars().all()

    # Consents
    consent_result = await db.execute(
        select(CustomerConsent)
        .where(CustomerConsent.customer_id == customer_id)
        .order_by(CustomerConsent.created_at.desc())
    )
    consents = consent_result.scalars().all()

    # Devices
    device_result = await db.execute(
        select(CustomerDevice)
        .where(CustomerDevice.customer_id == customer_id)
    )
    devices = device_result.scalars().all()

    return APIResponse(
        data={
            "id": customer.id,
            "display_name": customer.display_name,
            "phone_number": customer.phone_number,
            "email_address": customer.email_address,
            "phone_verified_at": customer.phone_verified_at.isoformat() if customer.phone_verified_at else None,
            "date_of_birth": customer.date_of_birth.isoformat() if customer.date_of_birth else None,
            "referral_code": customer.referral_code,
            "referred_by_customer_id": customer.referred_by_customer_id,
            "referral_count": customer.referral_count,
            "preferred_language": customer.preferred_language,
            "order_count": customer.order_count,
            "lifetime_value": float(customer.lifetime_value),
            "is_active": customer.is_active,
            "created_at": customer.created_at.isoformat() if customer.created_at else None,
            "last_order_at": customer.last_order_at.isoformat() if customer.last_order_at else None,
            "loyalty": {
                "id": loyalty.id,
                "points_balance": loyalty.points_balance,
                "lifetime_points_earned": loyalty.lifetime_points_earned,
                "lifetime_points_redeemed": loyalty.lifetime_points_redeemed,
                "current_tier_id": loyalty.current_tier_id,
            } if loyalty else None,
            "wallet": {
                "id": wallet.id,
                "is_frozen": wallet.is_frozen,
                "currency_code": wallet.currency_code,
                "balance": wallet_balance,
            } if wallet else None,
            "addresses": [
                {
                    "id": a.id,
                    "label": a.label,
                    "address_line_1": a.address_line_1,
                    "city": a.city,
                    "is_default": a.is_default,
                }
                for a in addresses
            ],
            "recent_orders": [
                {
                    "id": o.id,
                    "order_number": o.order_number,
                    "status": o.status,
                    "total_amount": float(o.total_amount),
                    "created_at": o.created_at.isoformat() if o.created_at else None,
                }
                for o in orders
            ],
            "consents": [
                {
                    "id": c.id,
                    "consent_type": c.consent_type,
                    "status": c.status,
                    "granted_at": c.granted_at.isoformat() if c.granted_at else None,
                }
                for c in consents
            ],
            "devices": [
                {
                    "id": d.id,
                    "platform": d.platform,
                    "device_model": d.device_model,
                    "is_active": d.is_active,
                    "last_seen_at": d.last_seen_at.isoformat() if d.last_seen_at else None,
                }
                for d in devices
            ],
        }
    )


@router.patch("/{customer_id}", response_model=APIResponse[dict])
async def update_customer(
    admin: CurrentAdmin,
    db: DBDependency,
    customer_id: int,
    data: CustomerUpdate,
):
    """Update customer profile."""
    result = await db.execute(
        select(Customer).where(Customer.id == customer_id, Customer.deleted_at.is_(None))
    )
    customer = result.scalar_one_or_none()
    if customer is None:
        raise HTTPException(status_code=404, detail="Customer not found")

    if data.display_name is not None:
        customer.display_name = data.display_name
    if data.phone_number is not None:
        customer.phone_number = data.phone_number
    if data.email_address is not None:
        customer.email_address = data.email_address
    if data.date_of_birth is not None:
        customer.date_of_birth = data.date_of_birth
    if data.is_active is not None:
        customer.is_active = data.is_active
    if data.preferred_language is not None:
        customer.preferred_language = data.preferred_language

    customer.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(customer)

    return APIResponse(
        data={
            "id": customer.id,
            "display_name": customer.display_name,
            "is_active": customer.is_active,
            "message": "Customer updated",
        }
    )


@router.post("", response_model=APIResponse[dict], status_code=status.HTTP_201_CREATED)
async def create_customer(
    admin: CurrentAdmin,
    db: DBDependency,
    data: CustomerCreate,
):
    """Create a new customer (admin-initiated)."""
    phone = (data.phone_number or "").strip()
    email = (data.email_address or "").strip()
    if not phone and not email:
        raise HTTPException(status_code=400, detail="At least phone_number or email_address is required")
    # Mirror ck_customers_phone_number — reject before the DB CHECK turns it into a 500.
    if phone and not re.fullmatch(r"^\+?[0-9]{7,20}$", phone):
        raise HTTPException(status_code=422, detail="Invalid phone_number format")

    customer = Customer(
        phone_number=phone or None,
        email_address=email or None,
        display_name=data.display_name,
        given_name=data.given_name,
        family_name=data.family_name,
        preferred_language=data.preferred_language,
    )
    db.add(customer)
    await db.commit()
    await db.refresh(customer)
    return APIResponse(data={"id": customer.id, "display_name": customer.display_name, "message": "Customer created"})


@router.delete("/{customer_id}", response_model=APIResponse[dict])
async def delete_customer(
    admin: CurrentAdmin,
    db: DBDependency,
    customer_id: int,
):
    """Soft-delete a customer."""
    # Platform-wide account mutation — HQ roles only (store_manager/readonly → 403).
    await require_hq_write_admin(db, admin)

    result = await db.execute(
        select(Customer).where(Customer.id == customer_id, Customer.deleted_at.is_(None))
    )
    customer = result.scalar_one_or_none()
    if customer is None:
        raise HTTPException(status_code=404, detail="Customer not found")

    customer.is_active = False
    customer.deleted_at = datetime.now(timezone.utc)
    await db.commit()
    return APIResponse(data={"id": customer_id, "deleted": True})


@router.post("/{customer_id}/adjust-points", response_model=APIResponse[dict])
async def adjust_points(admin: CurrentAdmin, db: DBDependency, customer_id: int, data: AdjustPointsRequest):
    """Award or deduct loyalty points."""
    # Platform-wide points mutation — HQ roles only (store_manager/readonly → 403).
    await require_hq_write_admin(db, admin)

    points = data.points
    reason = data.reason
    if points == 0:
        raise HTTPException(400, "Points value required (positive to award, negative to deduct)")

    # Get/validate customer
    rc = await db.execute(select(Customer).where(Customer.id == customer_id, Customer.deleted_at.is_(None)))
    customer = rc.scalar_one_or_none()
    if not customer: raise HTTPException(404, "Customer not found")

    # Get or create loyalty account (lock row to prevent race conditions)
    rl = await db.execute(select(LoyaltyAccount).where(LoyaltyAccount.customer_id == customer_id).with_for_update())
    la = rl.scalar_one_or_none()
    if not la:
        la = LoyaltyAccount(customer_id=customer_id, current_tier_id=None, points_balance=0, lifetime_points_earned=0)
        db.add(la); await db.flush()

    if points < 0 and la.points_balance < abs(points):
        raise HTTPException(400, f"Insufficient points. Current balance: {la.points_balance}")

    la.points_balance += points
    if points > 0:
        la.lifetime_points_earned += points
    else:
        la.lifetime_points_redeemed += abs(points)

    # Recalculate tier
    from app.services.commerce import _recalculate_tier
    await _recalculate_tier(db, la)

    # Log
    entry_type = "manual_adjustment"
    db.add(LoyaltyPointsLedger(
        loyalty_account_id=la.id, customer_id=customer_id,
        event_type=entry_type, points_delta=points,
        running_balance=la.points_balance, description=reason,
    ))
    db.add(AuditLog(
        principal_id=admin.id, action="update", resource_type="customer",
        resource_id=customer_id,
        changes_summary={"points_delta": points, "reason": reason, "new_balance": la.points_balance},
    ))
    await db.commit()
    return APIResponse(data={"message": f"{points} points", "new_balance": la.points_balance})


@router.post("/{customer_id}/award-voucher", response_model=APIResponse[dict])
async def award_voucher(admin: CurrentAdmin, db: DBDependency, customer_id: int, data: AwardVoucherRequest):
    """Award a voucher to a customer."""
    voucher_id = data.voucher_id
    reason = data.reason
    if not voucher_id:
        raise HTTPException(400, "voucher_id required")

    rc = await db.execute(select(Customer).where(Customer.id == customer_id, Customer.deleted_at.is_(None)))
    if not rc.scalar_one_or_none(): raise HTTPException(404, "Customer not found")

    rv = await db.execute(select(VoucherDefinition).where(VoucherDefinition.id == voucher_id))
    vd = rv.scalar_one_or_none()
    if not vd: raise HTTPException(404, "Voucher not found")

    import secrets, json
    snapshot = {
        "display_title": vd.display_title or "",
        "voucher_code": vd.voucher_code or "",
        "voucher_type": vd.voucher_type or "",
        "discount_value": float(vd.discount_value or 0),
        "minimum_order_value": float(vd.minimum_order_value or 0),
    }
    store_result = await db.execute(
        select(Store.id).where(Store.deleted_at.is_(None), Store.is_active.is_(True)).limit(1)
    )
    default_store_id = store_result.scalar_one_or_none()

    # Ensure the awarded voucher has a future expiry
    now = datetime.now(timezone.utc)
    fallback_expiry = now + timedelta(days=vd.validity_days or 30)
    if vd.valid_until and vd.valid_until > now:
        expires_at = vd.valid_until
    else:
        expires_at = fallback_expiry

    cv = CustomerVoucher(
        customer_id=customer_id,
        voucher_definition_id=voucher_id,
        store_id=default_store_id,
        source="admin_awarded",
        source_id=admin.id,
        voucher_code=f"ADMIN-{secrets.token_hex(4).upper()}",
        status="active",
        voucher_snapshot=snapshot,
        expires_at=expires_at,
    )
    db.add(cv)
    await db.commit()
    await db.refresh(cv)
    # Transactional notification (savepoint-isolated; never blocks the award).
    from app.services.transactional_notifications import notify_event
    discount = ""
    if vd.voucher_type in ("percentage_discount", "fixed_amount_off", "fixed_discount"):
        discount = f"{float(vd.discount_value or 0):g}"
        discount = (f"{discount}% off" if vd.voucher_type == "percentage_discount" else f"RM {discount} off")
    elif vd.voucher_type == "free_delivery":
        discount = "Free delivery"
    await notify_event(
        db, "voucher_granted", customer_id,
        context={"voucher_title": vd.display_title or vd.voucher_code, "discount": discount},
        entity_type="customer_voucher", entity_id=cv.id,
        self_commit=True,  # endpoint already committed — notify commits itself
    )
    return APIResponse(data={"message": "Voucher awarded", "voucher_id": cv.id, "voucher_code": cv.voucher_code, "voucher_title": vd.display_title})


@router.post("/{customer_id}/set-tier", response_model=APIResponse[dict])
async def set_tier(admin: CurrentAdmin, db: DBDependency, customer_id: int, data: SetTierRequest):
    """Override customer tier."""
    # Platform-wide tier mutation — HQ roles only (store_manager/readonly → 403).
    await require_hq_write_admin(db, admin)

    tier_key = data.tier.lower()
    reason = data.reason

    rl = await db.execute(select(LoyaltyAccount).where(LoyaltyAccount.customer_id == customer_id).with_for_update())
    la = rl.scalar_one_or_none()
    if not la:
        la = LoyaltyAccount(customer_id=customer_id, current_tier_id=None, points_balance=0, lifetime_points_earned=0)
        db.add(la); await db.flush()

    rt = await db.execute(select(LoyaltyTier).where(LoyaltyTier.tier_key == tier_key, LoyaltyTier.is_active.is_(True)))
    tier = rt.scalar_one_or_none()
    if not tier: raise HTTPException(404, f"Tier '{tier_key}' not found")

    la.current_tier_id = tier.id
    la.last_tier_change_at = datetime.now(timezone.utc)
    # Also ensure lifetime points meet minimum
    if la.lifetime_points_earned < tier.min_lifetime_points:
        delta = tier.min_lifetime_points - la.lifetime_points_earned
        la.lifetime_points_earned = tier.min_lifetime_points
        la.points_balance += delta
        db.add(LoyaltyPointsLedger(
            loyalty_account_id=la.id, customer_id=customer_id,
            event_type="tier_bonus", points_delta=delta,
            running_balance=la.points_balance, description=f"{reason}: {tier.display_name}",
        ))
    # Audit log
    db.add(AuditLog(
        principal_id=admin.id, action="update", resource_type="customer",
        resource_id=customer_id,
        changes_summary={"tier": tier_key, "reason": reason},
    ))
    await db.commit()
    return APIResponse(data={"message": f"Tier set to {tier.display_name}", "tier": tier_key})


@router.post("/{customer_id}/approve-profile", response_model=APIResponse[dict])
async def approve_profile(admin: CurrentAdmin, db: DBDependency, customer_id: int):
    """Approve customer profile — verify phone and activate."""
    rc = await db.execute(select(Customer).where(Customer.id == customer_id, Customer.deleted_at.is_(None)))
    customer = rc.scalar_one_or_none()
    if not customer: raise HTTPException(404, "Customer not found")

    if not customer.phone_verified_at:
        customer.phone_verified_at = datetime.now(timezone.utc)
    customer.is_active = True
    customer.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return APIResponse(data={"message": "Customer approved & activated", "note": "Phone verified and account activated"})


@router.get("/{customer_id}/orders", response_model=APIResponse[PaginatedResponse[dict]])
async def customer_orders(admin: CurrentAdmin, db: DBDependency, customer_id: int, page: int = Query(1, ge=1), per_page: int = Query(10, ge=1, le=50)):
    """Paginated order history for a customer."""
    base = select(Order).where(Order.customer_id == customer_id, Order.deleted_at.is_(None))
    cnt = select(func.count(Order.id)).where(Order.customer_id == customer_id, Order.deleted_at.is_(None))
    total = (await db.execute(cnt)).scalar() or 0
    result = await db.execute(base.order_by(Order.id.desc()).offset((page-1)*per_page).limit(per_page))
    items = [{"id": o.id, "order_number": o.order_number, "status": o.status, "total_amount": float(o.total_amount), "created_at": o.created_at.isoformat() if o.created_at else None} for o in result.scalars().all()]
    return APIResponse(data=PaginatedResponse(items=items, total=total, page=page, per_page=per_page, total_pages=(total+per_page-1)//per_page if per_page else 0))


@router.get("/{customer_id}/loyalty-history", response_model=APIResponse[PaginatedResponse[dict]])
async def loyalty_history(admin: CurrentAdmin, db: DBDependency, customer_id: int, page: int = Query(1, ge=1), per_page: int = Query(10, ge=1, le=50)):
    """Paginated loyalty transaction history."""
    base = select(LoyaltyPointsLedger).where(LoyaltyPointsLedger.customer_id == customer_id)
    cnt = select(func.count(LoyaltyPointsLedger.id)).where(LoyaltyPointsLedger.customer_id == customer_id)
    total = (await db.execute(cnt)).scalar() or 0
    result = await db.execute(base.order_by(LoyaltyPointsLedger.id.desc()).offset((page-1)*per_page).limit(per_page))
    items = [{"id": e.id, "event_type": e.event_type, "points_delta": e.points_delta, "running_balance": e.running_balance, "description": e.description, "created_at": e.created_at.isoformat() if e.created_at else None} for e in result.scalars().all()]
    return APIResponse(data=PaginatedResponse(items=items, total=total, page=page, per_page=per_page, total_pages=(total+per_page-1)//per_page if per_page else 0))


@router.get("/{customer_id}/wallet-history", response_model=APIResponse[PaginatedResponse[dict]])
async def wallet_history(admin: CurrentAdmin, db: DBDependency, customer_id: int, page: int = Query(1, ge=1), per_page: int = Query(10, ge=1, le=50)):
    """Paginated wallet transaction history."""
    # Get wallet for customer
    rw = await db.execute(select(Wallet).where(Wallet.customer_id == customer_id))
    wallet = rw.scalar_one_or_none()
    if not wallet:
        return APIResponse(data=PaginatedResponse(items=[], total=0, page=page, per_page=per_page, total_pages=0))

    base = select(WalletLedgerEntry).where(WalletLedgerEntry.wallet_id == wallet.id)
    cnt = select(func.count(WalletLedgerEntry.id)).where(WalletLedgerEntry.wallet_id == wallet.id)
    total = (await db.execute(cnt)).scalar() or 0
    result = await db.execute(base.order_by(WalletLedgerEntry.id.desc()).offset((page-1)*per_page).limit(per_page))
    items = [{"id": t.id, "entry_type": t.entry_type, "amount": float(t.amount), "running_balance": float(t.running_balance), "description": t.description, "created_at": t.created_at.isoformat() if t.created_at else None} for t in result.scalars().all()]
    return APIResponse(data=PaginatedResponse(items=items, total=total, page=page, per_page=per_page, total_pages=(total+per_page-1)//per_page if per_page else 0))


@router.get("/{customer_id}/wallet", response_model=APIResponse[dict])
async def customer_wallet_items(admin: CurrentAdmin, db: DBDependency, customer_id: int):
    """Get customer's active rewards and vouchers."""
    from app.models.reward import RewardCatalog

    rr = await db.execute(
        select(CustomerReward, RewardCatalog)
        .join(RewardCatalog, CustomerReward.reward_catalog_id == RewardCatalog.id, isouter=True)
        .where(CustomerReward.customer_id == customer_id, CustomerReward.status.in_(["active","reserved"]))
    )
    rewards = []
    for r, rc in rr.all():
        rewards.append({
            "id": r.id,
            "reward_id": r.reward_catalog_id,
            "name": rc.reward_name if rc else (r.reward_snapshot.get("reward_name") if r.reward_snapshot else None),
            "redemption_code": r.redemption_code,
            "status": r.status,
            "points_spent": r.points_spent,
            "expires_at": r.expires_at.isoformat() if r.expires_at else None,
        })

    rv = await db.execute(
        select(CustomerVoucher)
        .options(selectinload(CustomerVoucher.voucher_definition))
        .where(CustomerVoucher.customer_id == customer_id, CustomerVoucher.status == "active")
    )
    vouchers = []
    for v in rv.scalars().all():
        vd = v.voucher_definition
        vouchers.append({
            "id": v.id,
            "voucher_id": v.voucher_definition_id,
            "title": vd.display_title if vd else (v.voucher_snapshot.get("display_title") if v.voucher_snapshot else None),
            "code": v.voucher_code,
            "discount_type": vd.voucher_type.replace("_off", "").replace("fixed_amount", "fixed").replace("percentage", "percent") if vd else None,
            "discount_value": float(vd.discount_value) if vd else None,
            "min_spend": float(vd.minimum_order_value) if vd else None,
            "expires_at": v.expires_at.isoformat() if v.expires_at else None,
        })

    # Get wallet balance
    w_result = await db.execute(select(Wallet).where(Wallet.customer_id == customer_id))
    wallet = w_result.scalar_one_or_none()
    wallet_balance = 0.0
    if wallet:
        balance_result = await db.execute(
            select(func.sum(case(
                (WalletLedgerEntry.entry_type.in_(["credit", "release", "adjustment"]), WalletLedgerEntry.amount),
                (WalletLedgerEntry.entry_type.in_(["debit", "hold"]), -WalletLedgerEntry.amount),
                else_=0,
            ))).where(WalletLedgerEntry.wallet_id == wallet.id)
        )
        wallet_balance = float(balance_result.scalar() or 0)

    return APIResponse(data={"balance": wallet_balance, "rewards": rewards, "vouchers": vouchers})


@router.post("/{customer_id}/workshop-bookings", response_model=APIResponse[dict], status_code=status.HTTP_201_CREATED)
async def book_workshop_for_customer(
    admin: CurrentAdmin,
    db: DBDependency,
    customer_id: int,
    data: AdminWorkshopBookingRequest,
):
    """Book a workshop/class seat on behalf of a customer (management-promised
    VIP bookings, phone-assisted counter bookings). Creates a real order with
    the session line item, consumes the seat (shared session rule), and
    optionally records a cash payment; complimentary bookings record the full
    value but move no money (net revenue stays 0 — no Payment row)."""
    from uuid import uuid4

    from app.core.money import money_round, to_decimal
    from app.models.class_session import ClassSession
    from app.models.menu import MenuCategory, MenuItem, MenuVariant
    from app.models.order import Order, OrderLineItem
    from app.models.payment import Payment
    from app.models.store import StoreConfiguration
    from app.services.class_sessions import ClassSessionError, consume_session_seats
    from app.services.transactional_notifications import notify_event

    await require_store_admin(db, admin, data.store_id)

    cust_r = await db.execute(
        select(Customer).where(Customer.id == customer_id, Customer.deleted_at.is_(None))
    )
    customer = cust_r.scalar_one_or_none()
    if customer is None:
        raise HTTPException(404, "Customer not found")
    if customer.phone_number == "+0000000000":
        raise HTTPException(400, "The walk-in profile cannot hold class bookings — use a real customer")

    item_r = await db.execute(
        select(MenuItem).where(MenuItem.id == data.menu_item_id, MenuItem.deleted_at.is_(None))
    )
    item = item_r.scalar_one_or_none()
    if item is None:
        raise HTTPException(404, "Menu item not found")
    cat_r = await db.execute(select(MenuCategory.id).where(MenuCategory.slug == "experiences"))
    exp_cat_id = cat_r.scalar_one_or_none()
    if item.category_id != exp_cat_id:
        raise HTTPException(400, "This item is not a workshop — book workshops via Events & Classes")

    # Unit price = base + optional variant delta (mirrors the customer path).
    unit_price = to_decimal(item.base_price)
    if data.variant_id is not None:
        var_r = await db.execute(
            select(MenuVariant).where(MenuVariant.id == data.variant_id, MenuVariant.parent_item_id == item.id)
        )
        variant = var_r.scalar_one_or_none()
        if variant is None:
            raise HTTPException(400, "Variant does not belong to this class")
        unit_price += to_decimal(variant.price_adjustment or 0)

    # Consume the seat (locked; validates active/match/not-past/capacity).
    try:
        await consume_session_seats(
            db, menu_item_id=item.id, class_session_id=data.class_session_id, quantity=data.quantity
        )
    except ClassSessionError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)

    config_service = PlatformConfigService(db)
    precision = await config_service.get_accounting_precision()
    rounding_mode = await config_service.get_accounting_rounding()
    store_r = await db.execute(select(Store).where(Store.id == data.store_id))
    store = store_r.scalar_one_or_none()
    if store is None:
        raise HTTPException(404, "Store not found")
    cfg_r = await db.execute(
        select(StoreConfiguration).where(
            StoreConfiguration.store_id == data.store_id,
            StoreConfiguration.config_key.in_(["order.service_charge", "order.tax_rate"]),
        )
    )
    config_map = {c.config_key: c.config_value for c in cfg_r.scalars().all()}
    service_charge = to_decimal(config_map.get("order.service_charge", 0))
    tax_rate = to_decimal(config_map.get("order.tax_rate", 0))

    subtotal = money_round(unit_price * data.quantity, precision, rounding_mode)
    tax_amount = money_round(subtotal * tax_rate, precision, rounding_mode)
    total = money_round(subtotal + service_charge + tax_amount, precision, rounding_mode)

    order_number = f"POS-{datetime.now(timezone.utc).strftime('%m%d')}-{uuid4().hex[:8].upper()}"
    order = Order(
        customer_id=customer_id,
        store_id=data.store_id,
        order_number=order_number,
        order_type="takeaway",
        order_channel="pos",  # outlet/back-office assisted booking
        fulfillment_type="counter_pickup",
        status="confirmed",
        payment_status="captured",  # paid/comped — seats are secured
        payment_flow="prepaid",
        item_count=data.quantity,
        items_subtotal=subtotal,
        service_charge=service_charge,
        tax_amount=tax_amount,
        discount_amount=0,
        total_amount=total,
        total_amount_currency=store.currency_code,
    )
    db.add(order)
    await db.flush()

    db.add(OrderLineItem(
        order_id=order.id,
        menu_item_id=item.id,
        menu_variant_id=data.variant_id,
        class_session_id=data.class_session_id,
        quantity=data.quantity,
        unit_price=unit_price,
        line_total=subtotal,
        item_snapshot={"item_name": item.item_name, "image_url": item.image_url},
    ))

    if data.payment == "cash" and total > 0:
        db.add(Payment(
            order_id=order.id,
            provider="cash",
            payment_method_type="cash",
            idempotency_key=f"admin-workshop-{order.id}-cash-{total:.2f}",
            amount=total,
            currency_code=store.currency_code,
            status="captured",
            captured_amount=total,
            net_amount=total,
        ))

    await db.commit()

    # Tell the customer their seat is booked (savepoint-isolated; never blocks).
    await notify_event(
        db, "order_confirmed", customer_id,
        context={"order_number": order_number, "store_name": store.store_name},
        entity_type="order", entity_id=order.id,
    )

    return APIResponse(data={
        "order_id": order.id,
        "order_number": order_number,
        "total": float(total),
        "payment": data.payment,
        "message": "Workshop seat booked" if data.payment == "cash" else "Workshop seat booked (complimentary)",
    }, status_code=201)
