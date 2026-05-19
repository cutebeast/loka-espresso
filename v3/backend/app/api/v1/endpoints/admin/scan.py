"""Staff QR scanner endpoints (customer card, reward, voucher)."""

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from sqlalchemy import func, select

from app.api.v1.deps import CurrentAdmin, DBDependency
from app.models.customer import Customer
from app.models.loyalty import LoyaltyAccount
from app.models.reward import CustomerReward, RewardCatalog
from app.models.voucher import CustomerVoucher, VoucherDefinition
from app.models.wallet import Wallet, WalletLedgerEntry
from app.schemas.base import APIResponse

router = APIRouter(prefix="/admin/scan", tags=["admin — scan"])


@router.post("/customer", response_model=APIResponse[dict])
async def scan_customer_qr(admin: CurrentAdmin, db: DBDependency, data: dict):
    """Scan customer QR code (format: loka:customer:{id})."""
    code = (data.get("code") or "").strip()
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


@router.post("/reward/{code}", response_model=APIResponse[dict])
async def scan_reward_code(admin: CurrentAdmin, db: DBDependency, code: str, data: dict):
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

    cr.status = "used"
    cr.used_at = now
    if data.get("store_id"):
        cr.store_id = int(data["store_id"])

    rc_result = await db.execute(select(RewardCatalog).where(RewardCatalog.id == cr.reward_catalog_id))
    rc = rc_result.scalar_one_or_none()

    await db.commit()

    snapshot = cr.reward_snapshot or {}
    return APIResponse(
        data={
            "reward_id": cr.id,
            "name": rc.reward_name if rc else snapshot.get("reward_name"),
            "reward_name": rc.reward_name if rc else snapshot.get("reward_name"),
            "customer_id": cr.customer_id,
            "valid": True,
            "success": True,
            "message": f"Reward redeemed: {rc.reward_name if rc else 'Unknown'}",
        }
    )


@router.post("/voucher/{code}", response_model=APIResponse[dict])
async def scan_voucher_code(admin: CurrentAdmin, db: DBDependency, code: str, data: dict):
    """Scan voucher per-instance code (e.g. WELCOME10-A3F2B1)."""
    now = datetime.now(timezone.utc)

    # Try redemption_code first (used by admin-awarded vouchers), fall back to voucher_code
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

    cv.status = "used"
    cv.used_at = now
    if data.get("store_id"):
        cv.store_id = int(data["store_id"])

    vd_result = await db.execute(select(VoucherDefinition).where(VoucherDefinition.id == cv.voucher_definition_id))
    vd = vd_result.scalar_one_or_none()
    if vd:
        vd.global_use_count += 1

    await db.commit()

    snapshot = cv.voucher_snapshot or {}
    return APIResponse(
        data={
            "voucher_id": cv.id,
            "title": vd.display_title if vd else snapshot.get("display_title"),
            "voucher_title": vd.display_title if vd else snapshot.get("display_title"),
            "customer_id": cv.customer_id,
            "valid": True,
            "success": True,
            "message": f"Voucher applied: {vd.display_title if vd else 'Unknown'}",
        }
    )
