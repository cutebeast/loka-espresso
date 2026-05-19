"""Admin customer management endpoints."""

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select

from app.api.v1.deps import CurrentAdmin, DBDependency
from app.models.customer import Customer, CustomerAddress, CustomerConsent, CustomerDevice
from app.models.loyalty import LoyaltyAccount, LoyaltyPointsLedger, LoyaltyTier
from app.models.order import Order
from app.models.wallet import Wallet, WalletLedgerEntry
from app.models.reward import CustomerReward
from app.models.voucher import CustomerVoucher, VoucherDefinition
from app.schemas.base import APIResponse, PaginatedResponse

router = APIRouter(prefix="/admin/customers", tags=["admin — customers"])


@router.get("", response_model=APIResponse[PaginatedResponse[dict]])
async def list_customers(
    admin: CurrentAdmin,
    db: DBDependency,
    search: str | None = Query(None, description="Search by name, phone, or email"),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
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
        from app.models.wallet import WalletLedgerEntry
        lr = await db.execute(
            select(WalletLedgerEntry).where(WalletLedgerEntry.wallet_id == wallet.id)
        )
        total_credited = 0.0
        total_debited = 0.0
        for entry in lr.scalars().all():
            if entry.entry_type in ("credit", "release"):
                total_credited += float(entry.amount)
            elif entry.entry_type in ("debit", "hold"):
                total_debited += float(entry.amount)
            elif entry.entry_type == "adjustment":
                total_credited += float(entry.amount)
        wallet_balance = total_credited - total_debited

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
    data: dict,
):
    """Update customer profile."""
    result = await db.execute(
        select(Customer).where(Customer.id == customer_id, Customer.deleted_at.is_(None))
    )
    customer = result.scalar_one_or_none()
    if customer is None:
        raise HTTPException(status_code=404, detail="Customer not found")

    allowed = ["display_name", "phone_number", "email_address", "date_of_birth", "is_active", "preferred_language"]
    for key in allowed:
        if key in data:
            setattr(customer, key, data[key])

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
    data: dict,
):
    """Create a new customer (admin-initiated)."""
    phone = (data.get("phone_number") or "").strip()
    email = (data.get("email_address") or "").strip()
    if not phone and not email:
        raise HTTPException(status_code=400, detail="At least phone_number or email_address is required")

    customer = Customer(
        phone_number=phone or None,
        email_address=email or None,
        display_name=data.get("display_name"),
        given_name=data.get("given_name"),
        family_name=data.get("family_name"),
        preferred_language=data.get("preferred_language", "en"),
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
async def adjust_points(admin: CurrentAdmin, db: DBDependency, customer_id: int, data: dict):
    """Award or deduct loyalty points."""
    points = int(data.get("points", 0))
    reason = data.get("reason", "Admin adjustment")
    if points == 0:
        raise HTTPException(400, "Points value required (positive to award, negative to deduct)")

    # Get/validate customer
    rc = await db.execute(select(Customer).where(Customer.id == customer_id, Customer.deleted_at.is_(None)))
    customer = rc.scalar_one_or_none()
    if not customer: raise HTTPException(404, "Customer not found")

    # Get or create loyalty account
    rl = await db.execute(select(LoyaltyAccount).where(LoyaltyAccount.customer_id == customer_id))
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
    await db.commit()
    return APIResponse(data={"message": f"{points} points", "new_balance": la.points_balance})


@router.post("/{customer_id}/award-voucher", response_model=APIResponse[dict])
async def award_voucher(admin: CurrentAdmin, db: DBDependency, customer_id: int, data: dict):
    """Award a voucher to a customer."""
    voucher_id = int(data.get("voucher_id", 0))
    reason = data.get("reason", "Admin awarded")
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
        "discount_value": str(vd.discount_value or 0),
        "minimum_order_value": str(vd.minimum_order_value or 0),
    }
    cv = CustomerVoucher(
        customer_id=customer_id,
        voucher_definition_id=voucher_id,
        store_id=1,  # admin-awarded vouchers default to store 1
        source="admin_awarded",
        source_id=admin.id,
        voucher_code=f"ADMIN-{secrets.token_hex(4).upper()}",
        status="active",
        voucher_snapshot=snapshot,
        expires_at=vd.valid_until or (datetime.now(timezone.utc) + __import__('datetime').timedelta(days=vd.validity_days or 30)),
    )
    db.add(cv)
    await db.commit()
    await db.refresh(cv)
    return APIResponse(data={"message": "Voucher awarded", "voucher_code": cv.voucher_code, "voucher_title": vd.display_title})


@router.post("/{customer_id}/use-reward/{reward_id}", response_model=APIResponse[dict])
async def use_reward(admin: CurrentAdmin, db: DBDependency, customer_id: int, reward_id: int, data: dict):
    """Mark a customer's reward as used in-store."""
    result = await db.execute(
        select(CustomerReward).where(
            CustomerReward.id == reward_id,
            CustomerReward.customer_id == customer_id,
        )
    )
    cr = result.scalar_one_or_none()
    if not cr:
        raise HTTPException(status_code=404, detail="Reward not found for this customer")

    if cr.status == "used":
        raise HTTPException(status_code=400, detail="Reward already used")
    if cr.status == "expired":
        raise HTTPException(status_code=400, detail="Reward has expired")
    if cr.status == "cancelled":
        raise HTTPException(status_code=400, detail="Reward was cancelled")

    now = datetime.now(timezone.utc)
    if cr.expires_at and cr.expires_at < now:
        cr.status = "expired"
        await db.commit()
        raise HTTPException(status_code=400, detail="Reward has expired")

    cr.status = "used"
    cr.used_at = now
    if data.get("store_id"):
        cr.store_id = int(data["store_id"])

    await db.commit()
    return APIResponse(data={"message": "Reward marked as used", "success": True})


@router.post("/{customer_id}/use-voucher/{voucher_id}", response_model=APIResponse[dict])
async def use_voucher(admin: CurrentAdmin, db: DBDependency, customer_id: int, voucher_id: int, data: dict):
    """Mark a customer's voucher as used in-store."""
    result = await db.execute(
        select(CustomerVoucher).where(
            CustomerVoucher.id == voucher_id,
            CustomerVoucher.customer_id == customer_id,
        )
    )
    cv = result.scalar_one_or_none()
    if not cv:
        raise HTTPException(status_code=404, detail="Voucher not found for this customer")

    if cv.status == "used":
        raise HTTPException(status_code=400, detail="Voucher already used")
    if cv.status == "expired":
        raise HTTPException(status_code=400, detail="Voucher has expired")
    if cv.status == "revoked":
        raise HTTPException(status_code=400, detail="Voucher was revoked")

    now = datetime.now(timezone.utc)
    if cv.expires_at and cv.expires_at < now:
        cv.status = "expired"
        await db.commit()
        raise HTTPException(status_code=400, detail="Voucher has expired")

    cv.status = "used"
    cv.used_at = now
    if data.get("store_id"):
        cv.store_id = int(data["store_id"])

    await db.commit()
    return APIResponse(data={"message": "Voucher marked as used", "success": True})


@router.post("/{customer_id}/set-tier", response_model=APIResponse[dict])
async def set_tier(admin: CurrentAdmin, db: DBDependency, customer_id: int, data: dict):
    """Override customer tier."""
    tier_key = data.get("tier", "").lower()
    reason = data.get("reason", "Admin override")

    rl = await db.execute(select(LoyaltyAccount).where(LoyaltyAccount.customer_id == customer_id))
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
            event_type="tier_upgrade", points_delta=delta,
            running_balance=la.points_balance, description=f"{reason}: {tier.display_name}",
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

    rv = await db.execute(select(CustomerVoucher).where(CustomerVoucher.customer_id == customer_id, CustomerVoucher.status == "active"))
    vouchers = []
    for v in rv.scalars().all():
        vd = await db.get(VoucherDefinition, v.voucher_definition_id)
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
        lr = await db.execute(select(WalletLedgerEntry).where(WalletLedgerEntry.wallet_id == wallet.id))
        total_credited = 0.0
        total_debited = 0.0
        for entry in lr.scalars().all():
            if entry.entry_type in ("credit", "release"):
                total_credited += float(entry.amount)
            elif entry.entry_type in ("debit", "hold"):
                total_debited += float(entry.amount)
            elif entry.entry_type == "adjustment":
                total_credited += float(entry.amount)
        wallet_balance = total_credited - total_debited

    return APIResponse(data={"balance": wallet_balance, "rewards": rewards, "vouchers": vouchers})
