"""Staff-scoped customer, wallet, reward, voucher, and scan operations."""

import re
from datetime import datetime, timezone
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import case, func, select
from sqlalchemy.orm import selectinload

from app.api.routes.deps import CurrentStaff, DBDependency, RequireStaffRole
from app.core.money import money_round, to_decimal
from app.models.customer import Customer, CustomerAddress, CustomerConsent, CustomerDevice
from app.models.loyalty import LoyaltyAccount, LoyaltyPointsLedger, LoyaltyTier
from app.models.order import Order
from app.models.platform import AuditLog
from app.models.reward import CustomerReward, RewardCatalog
from app.models.staff import StaffProfile
from app.models.store import Store
from app.models.voucher import CustomerVoucher, VoucherDefinition
from app.models.wallet import Wallet, WalletLedgerEntry
from app.schemas.base import APIResponse, BaseSchema
from app.schemas.wallet import AdminTopupRequest, WalletOut
from app.services.platform_config import PlatformConfigService

router = APIRouter(tags=["staff — customers"])


def _audit_principal_id(staff) -> int | None:
    """Return the principal_id to use for audit logs, or None if not available."""
    pid = getattr(staff, "principal_id", None)
    return pid if pid else None


async def _get_customer_or_404(db, customer_id: int) -> Customer:
    result = await db.execute(
        select(Customer).where(Customer.id == customer_id, Customer.deleted_at.is_(None))
    )
    customer = result.scalar_one_or_none()
    if customer is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")
    return customer


async def _get_default_currency(db) -> str:
    from app.models.platform import PlatformConfig
    result = await db.execute(
        select(PlatformConfig.config_value).where(PlatformConfig.config_key == "currency.default")
    )
    row = result.scalar_one_or_none()
    if row is None:
        return "USD"
    if isinstance(row, str):
        try:
            import json
            parsed = json.loads(row)
            if isinstance(parsed, str):
                return parsed
        except Exception:
            pass
        return row
    return str(row)


async def _get_customer_wallet(db, customer_id: int) -> Wallet | None:
    result = await db.execute(select(Wallet).where(Wallet.customer_id == customer_id))
    return result.scalar_one_or_none()


# ── Customer Search ──

@router.get("/staff/customers/search")
async def staff_customer_search(staff: CurrentStaff, db: DBDependency, request: Request, q: str = Query(..., min_length=1)):
    q_clean = q.strip()
    result = await db.execute(
        select(Customer).where(
            Customer.deleted_at.is_(None),
            (Customer.phone_number.ilike(f"%{q_clean}%")) |
            (Customer.display_name.ilike(f"%{q_clean}%")) |
            (Customer.id == int(q_clean) if q_clean.isdigit() else False)
        ).limit(20)
    )
    items = []
    for c in result.scalars().all():
        items.append({
            "id": c.id, "display_name": c.display_name or f"Customer #{c.id}",
            "phone_number": c.phone_number or "",
            "email_address": c.email_address or "",
            "loyalty_tier": "Standard",
        })
    return APIResponse(data={"items": items})


class FindOrCreateCustomerRequest(BaseSchema):
    phone_number: str = Field(..., min_length=5, max_length=25)
    display_name: str = Field(..., min_length=1, max_length=100)


@router.post("/staff/customers/find-or-create", response_model=APIResponse[dict], status_code=status.HTTP_201_CREATED)
async def staff_find_or_create_customer(
    staff: Annotated[StaffProfile, Depends(RequireStaffRole("cashier", "server", "shift_supervisor", "store_manager"))],
    db: DBDependency,
    data: FindOrCreateCustomerRequest,
):
    """POS walk-in lookup: find a customer by phone or create a minimal profile.

    Phone is the identity anchor (passwordless login). No OTP here — staff are
    facing the customer in person; if the customer later signs up with the
    same phone via OTP, they take over this very profile, so workshop bookings
    and loyalty history stay attached to the phone.

    Accepts Malaysian formats (012…, 012-345 6001, 6012…, +6012…).
    """
    digits = re.sub(r"\D", "", data.phone_number or "")
    if digits.startswith("60"):
        phone = f"+{digits}"
    elif digits.startswith("0"):
        phone = f"+6{digits}"
    elif digits:
        phone = f"+{digits}"
    else:
        phone = ""
    if not re.fullmatch(r"^\+[0-9]{7,20}$", phone):
        raise HTTPException(status_code=400, detail="Invalid phone number — use a Malaysian mobile (e.g. 0123456789)")

    result = await db.execute(
        select(Customer).where(Customer.phone_number == phone)
    )
    cust = result.scalar_one_or_none()
    created = False
    revived = False
    name = data.display_name.strip()
    if cust is None:
        cust = Customer(phone_number=phone, display_name=name, is_active=True)
        db.add(cust)
        await db.flush()
        created = True
    elif cust.deleted_at is not None:
        # Previously archived profile — customer is physically here, restore it
        cust.deleted_at = None
        cust.is_active = True
        cust.display_name = name
        revived = True
    elif name and (not cust.display_name or cust.display_name in ("Walk-in", cust.phone_number)):
        # Upgrade placeholder names with the one staff collected
        cust.display_name = name
    await db.commit()
    return APIResponse(data={
        "id": cust.id,
        "display_name": cust.display_name or name,
        "phone_number": cust.phone_number,
        "loyalty_tier": "Standard",
        "created": created,
        "revived": revived,
    })


@router.get("/staff/customers/{customer_id}", response_model=APIResponse[dict])
async def get_staff_customer_detail(staff: CurrentStaff, db: DBDependency, customer_id: int):
    """Get customer detail with loyalty and wallet info scoped to staff's store."""
    customer = await _get_customer_or_404(db, customer_id)

    l_result = await db.execute(
        select(LoyaltyAccount).where(LoyaltyAccount.customer_id == customer_id)
    )
    loyalty = l_result.scalar_one_or_none()

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

    addr_result = await db.execute(
        select(CustomerAddress).where(
            CustomerAddress.customer_id == customer_id,
            CustomerAddress.deleted_at.is_(None),
        )
    )
    addresses = addr_result.scalars().all()

    order_result = await db.execute(
        select(Order)
        .where(
            Order.customer_id == customer_id,
            Order.store_id == staff.store_id,
            Order.deleted_at.is_(None),
        )
        .order_by(Order.id.desc())
        .limit(10)
    )
    orders = order_result.scalars().all()

    consent_result = await db.execute(
        select(CustomerConsent)
        .where(CustomerConsent.customer_id == customer_id)
        .order_by(CustomerConsent.created_at.desc())
    )
    consents = consent_result.scalars().all()

    device_result = await db.execute(
        select(CustomerDevice)
        .where(CustomerDevice.customer_id == customer_id)
    )
    devices = device_result.scalars().all()

    tier_name = None
    if loyalty and loyalty.current_tier_id:
        tier_result = await db.execute(
            select(LoyaltyTier).where(LoyaltyTier.id == loyalty.current_tier_id)
        )
        tier = tier_result.scalar_one_or_none()
        tier_name = tier.display_name if tier else None

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
                "tier_name": tier_name,
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


@router.get("/staff/customers/{customer_id}/wallet", response_model=APIResponse[dict])
async def staff_customer_wallet_items(staff: CurrentStaff, db: DBDependency, customer_id: int):
    """Get customer's active rewards and vouchers (staff-scoped view)."""
    customer = await _get_customer_or_404(db, customer_id)

    from app.services.commerce import expire_stale_wallet_items
    if await expire_stale_wallet_items(db, customer_id):
        await db.commit()

    rr = await db.execute(
        select(CustomerReward, RewardCatalog)
        .join(RewardCatalog, CustomerReward.reward_catalog_id == RewardCatalog.id, isouter=True)
        .where(
            CustomerReward.customer_id == customer_id,
            CustomerReward.status.in_(["active", "reserved"]),
        )
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
        .where(
            CustomerVoucher.customer_id == customer_id,
            CustomerVoucher.status == "active",
        )
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

    wallet = await _get_customer_wallet(db, customer_id)
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


@router.post("/staff/wallets/topup", response_model=APIResponse[dict])
async def staff_wallet_topup(staff: Annotated[StaffProfile, Depends(RequireStaffRole("cashier", "server", "shift_supervisor", "store_manager"))], db: DBDependency, data: AdminTopupRequest):
    """Top-up a customer's wallet in staff's store."""
    config_service = PlatformConfigService(db)
    precision = await config_service.get_accounting_precision()
    rounding_mode = await config_service.get_accounting_rounding()

    customer_id = data.customer_id
    amount = to_decimal(data.amount)
    reason = data.reason or "Staff top-up"
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")

    customer = await _get_customer_or_404(db, customer_id)

    # Lock the wallet row first so concurrent top-ups serialize on it (the
    # last-ledger-entry lock alone does not protect a wallet with no entries).
    wallet_result = await db.execute(
        select(Wallet).where(Wallet.customer_id == customer_id).with_for_update()
    )
    wallet = wallet_result.scalar_one_or_none()
    if not wallet:
        wallet = Wallet(customer_id=customer_id, currency_code=await _get_default_currency(db))
        db.add(wallet)
        await db.flush()

    r = await db.execute(
        select(WalletLedgerEntry)
        .where(WalletLedgerEntry.wallet_id == wallet.id)
        .order_by(WalletLedgerEntry.id.desc())
        .limit(1)
        .with_for_update()
    )
    last = r.scalar_one_or_none()
    current_balance = to_decimal(last.running_balance) if last else Decimal(0)
    new_balance = money_round(current_balance + amount, precision, rounding_mode)

    entry = WalletLedgerEntry(
        wallet_id=wallet.id,
        entry_type="credit",
        amount=amount,
        running_balance=new_balance,
        description=reason,
        reference_type="adjustment",
    )
    db.add(entry)

    principal_id = _audit_principal_id(staff)
    if principal_id:
        db.add(AuditLog(
            action="transfer",
            resource_type="wallet",
            resource_id=wallet.id,
            principal_id=principal_id,
            severity="warning",
            changes_summary={"amount": str(amount), "reason": reason, "new_balance": str(new_balance)},
        ))

    await db.commit()
    await db.refresh(entry)
    return APIResponse(data={"message": "Top-up complete", "new_balance": float(new_balance)})


# ── Scan endpoints ──

class ScanCustomerQRRequest(BaseSchema):
    code: str


class ScanRewardCodeRequest(BaseSchema):
    store_id: int | None = None


class ScanVoucherCodeRequest(BaseSchema):
    store_id: int | None = None


@router.post("/staff/scan/customer", response_model=APIResponse[dict])
async def staff_scan_customer_qr(staff: CurrentStaff, db: DBDependency, data: ScanCustomerQRRequest):
    """Scan customer QR code (format: loka:customer:{id})."""
    code = (data.code or "").strip()
    if not code:
        raise HTTPException(status_code=400, detail="code is required")
    if not code.startswith("loka:customer:"):
        raise HTTPException(status_code=400, detail="Invalid QR code format")

    try:
        customer_id = int(code.split(":")[-1])
    except (ValueError, IndexError):
        raise HTTPException(status_code=400, detail="Invalid customer ID in QR code")

    result = await db.execute(
        select(Customer).where(Customer.id == customer_id, Customer.deleted_at.is_(None))
    )
    customer = result.scalar_one_or_none()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    wallet_result = await db.execute(select(Wallet).where(Wallet.customer_id == customer_id))
    wallet = wallet_result.scalar_one_or_none()
    wallet_balance = 0
    if wallet:
        last_entry = await db.execute(
            select(WalletLedgerEntry)
            .where(WalletLedgerEntry.wallet_id == wallet.id)
            .order_by(WalletLedgerEntry.id.desc())
            .limit(1)
        )
        entry = last_entry.scalar_one_or_none()
        wallet_balance = float(entry.running_balance) if entry else 0

    loyalty_result = await db.execute(select(LoyaltyAccount).where(LoyaltyAccount.customer_id == customer_id))
    loyalty = loyalty_result.scalar_one_or_none()

    rewards_count = (
        await db.execute(
            select(func.count(CustomerReward.id)).where(
                CustomerReward.customer_id == customer_id,
                CustomerReward.status.in_(["active", "reserved"]),
            )
        )
    ).scalar() or 0

    vouchers_count = (
        await db.execute(
            select(func.count(CustomerVoucher.id)).where(
                CustomerVoucher.customer_id == customer_id,
                CustomerVoucher.status == "active",
            )
        )
    ).scalar() or 0

    return APIResponse(
        data={
            "success": True,
            "customer_id": customer.id,
            "customer_name": customer.display_name,
            "customer_phone": customer.phone_number,
            "wallet_balance": wallet_balance,
            "loyalty_points": loyalty.points_balance if loyalty else 0,
            "rewards_count": rewards_count,
            "vouchers_count": vouchers_count,
        }
    )


@router.post("/staff/scan/reward/{code}", response_model=APIResponse[dict])
async def staff_scan_reward_code(
    staff: Annotated[StaffProfile, Depends(RequireStaffRole("cashier", "server", "shift_supervisor", "store_manager"))],
    db: DBDependency,
    code: str,
    data: ScanRewardCodeRequest,
):
    """Scan reward redemption code (e.g. RWD-{id}-{token})."""
    now = datetime.now(timezone.utc)

    result = await db.execute(
        select(CustomerReward).where(CustomerReward.redemption_code == code)
    )
    cr = result.scalar_one_or_none()
    if not cr:
        raise HTTPException(status_code=404, detail="Redemption code not found")

    if cr.status == "used":
        raise HTTPException(status_code=400, detail="Reward already used")
    if cr.status == "expired":
        raise HTTPException(status_code=400, detail="Reward has expired")
    if cr.status == "cancelled":
        raise HTTPException(status_code=400, detail="Reward was cancelled")
    if cr.expires_at and cr.expires_at < now:
        cr.status = "expired"
        await db.flush()
        raise HTTPException(status_code=400, detail="Reward has expired")

    # Scan = lookup/validation ONLY. The reward is consumed when staff apply
    # it to an order at checkout (/staff/orders/{id}/apply-reward).
    rc_result = await db.execute(select(RewardCatalog).where(RewardCatalog.id == cr.reward_catalog_id))
    rc = rc_result.scalar_one_or_none()
    snapshot = cr.reward_snapshot or {}
    return APIResponse(
        data={
            "reward_id": cr.id,
            "name": rc.reward_name if rc else snapshot.get("reward_name"),
            "reward_name": rc.reward_name if rc else snapshot.get("reward_name"),
            "customer_id": cr.customer_id,
            "valid": True,
            "success": True,
            "message": f"Reward valid: {rc.reward_name if rc else 'Unknown'}",
        }
    )


@router.post("/staff/scan/voucher/{code}", response_model=APIResponse[dict])
async def staff_scan_voucher_code(
    staff: Annotated[StaffProfile, Depends(RequireStaffRole("cashier", "server", "shift_supervisor", "store_manager"))],
    db: DBDependency,
    code: str,
    data: ScanVoucherCodeRequest,
):
    """Scan voucher per-instance code (e.g. WELCOME10-A3F2B1)."""
    now = datetime.now(timezone.utc)

    r_result = await db.execute(
        select(CustomerVoucher).where(CustomerVoucher.voucher_code == code)
    )
    cv = r_result.scalar_one_or_none()
    if not cv:
        raise HTTPException(status_code=404, detail="Voucher code not found")

    if cv.status == "used":
        raise HTTPException(status_code=400, detail="Voucher already used")
    if cv.status == "expired":
        raise HTTPException(status_code=400, detail="Voucher has expired")
    if cv.status == "revoked":
        raise HTTPException(status_code=400, detail="Voucher was revoked")
    if cv.expires_at and cv.expires_at < now:
        cv.status = "expired"
        await db.flush()
        raise HTTPException(status_code=400, detail="Voucher has expired")

    # Scan = lookup/validation ONLY. The voucher is consumed when staff apply
    # it to an order at checkout (/staff/orders/{id}/apply-voucher).
    vd_result = await db.execute(select(VoucherDefinition).where(VoucherDefinition.id == cv.voucher_definition_id))
    vd = vd_result.scalar_one_or_none()
    snapshot = cv.voucher_snapshot or {}
    return APIResponse(
        data={
            "voucher_id": cv.id,
            "title": vd.display_title if vd else snapshot.get("display_title"),
            "voucher_title": vd.display_title if vd else snapshot.get("display_title"),
            "customer_id": cv.customer_id,
            "valid": True,
            "success": True,
            "message": f"Voucher valid: {vd.display_title if vd else 'Unknown'}",
        }
    )
