from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc, or_, text

from app.core.database import get_db
from app.core.security import require_hq_access, require_role, now_utc, ensure_utc
from app.core.audit import log_action, get_client_ip
from app.core.utils import to_float
from app.core.commerce import credit_wallet
from app.models.user import User, RoleIDs
from app.models.loyalty import LoyaltyAccount, LoyaltyTransaction
from app.models.order import Order
from app.models.wallet import Wallet, WalletTransaction
from app.models.voucher import Voucher, UserVoucher
from app.models.reward import UserReward, Reward
from app.schemas.admin_customers import CustomerUpdateRequest

from .admin_customer_list import _is_customer_profile_complete

router = APIRouter(prefix="/admin", tags=["Admin Customers"])

_CUSTOMER_RESET_TABLES = [
    "loyalty_transactions",
    "user_vouchers",
    "user_rewards",
    "cart_items",
    "order_items",
    "order_status_history",
    "payments",
    "feedback",
    "orders",
    "wallet_transactions",
    "wallets",
    "loyalty_accounts",
    "user_addresses",
    "device_tokens",
    "notifications",
    "favorites",
    "referrals",
    "payment_methods",
    "survey_responses",
    "audit_log",
    "token_blacklist",
    "users",
]

_ALLOWED_CUSTOMER_RESET_TABLES = {
    "loyalty_transactions", "user_vouchers", "user_rewards", "cart_items",
    "order_items", "order_status_history", "payments", "feedback", "orders",
    "wallet_transactions", "wallets", "loyalty_accounts", "user_addresses",
    "device_tokens", "notifications", "favorites", "referrals",
    "payment_methods", "survey_responses", "audit_log", "token_blacklist",
    "users",
}


class UseItemRequest(BaseModel):
    store_id: Optional[int] = None
    notes: Optional[str] = None


@router.post("/customers/{user_id}/approve-profile")
async def approve_customer_profile(
    user_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_hq_access()),
):
    """Manually approve a customer profile.

    This is used when a customer's profile is incomplete (missing name/email
    or phone not verified) and admin manually approves them to grant full access.
    Sets phone_verified=True and is_active=True regardless of profile completion.
    """
    result = await db.execute(select(User).where(User.id == user_id, User.role_id == RoleIDs.CUSTOMER))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="Customer not found")

    already_approved = target.phone_verified and target.is_active
    if already_approved:
        raise HTTPException(status_code=400, detail="Customer profile is already approved and active")

    previous_phone_verified = target.phone_verified
    previous_is_active = target.is_active

    target.phone_verified = True
    target.is_active = True

    ip = get_client_ip(request)
    await log_action(
        db,
        action="APPROVE_CUSTOMER_PROFILE",
        user_id=user.id,
        entity_type="customer",
        entity_id=user_id,
        details={
            "previous_phone_verified": previous_phone_verified,
            "previous_is_active": previous_is_active,
        },
        ip_address=ip,
    )
    await db.flush()
    await db.refresh(target)

    profile_complete = _is_customer_profile_complete(target.name, target.email, True)

    return {
        "message": "Customer approved and activated",
        "phone_verified": target.phone_verified,
        "is_active": target.is_active,
        "is_profile_complete": profile_complete,
        "note": "Profile is still missing name. Customer can update their profile from the app." if not profile_complete else None,
    }


@router.put("/customers/{user_id}")
async def update_customer(
    user_id: int,
    request: Request,
    data: CustomerUpdateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_hq_access()),
):
    result = await db.execute(select(User).where(User.id == user_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="Customer not found")

    changes = data.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=400, detail="No changes provided")

    if "phone" in changes and changes["phone"] != target.phone:
        existing = await db.execute(select(User).where(User.phone == changes["phone"]))
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="Phone number already in use by another account")

    if "email" in changes and changes["email"] and changes["email"] != target.email:
        existing = await db.execute(select(User).where(User.email == changes["email"]))
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="Email already in use by another account")

    for key, value in changes.items():
        setattr(target, key, value)

    ip = get_client_ip(request)
    await log_action(db, action="UPDATE_CUSTOMER", user_id=user.id, entity_type="customer", entity_id=user_id, details={"changes": changes}, ip_address=ip)
    await db.flush()
    await db.refresh(target)
    return {
        "id": target.id,
        "name": target.name,
        "email": target.email,
        "phone": target.phone,
    }


@router.delete("/customers/reset")
async def reset_all_customers(
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_hq_access()),
):
    """Delete ALL customers and all their associated data via API.

    Clears: users (role=customer), orders, wallets, loyalty accounts,
    vouchers, rewards, transactions, addresses, notifications, etc.
    Preserves: admin/staff accounts, stores, menu items, rewards catalog,
    voucher catalog, system config.

    Requires HQ access. Use with caution — this is irreversible.
    """
    CUSTOMER_ROLE_ID = 6

    deleted_counts = {}

    for table_name in _CUSTOMER_RESET_TABLES:
        if table_name not in _ALLOWED_CUSTOMER_RESET_TABLES:
            raise HTTPException(status_code=400, detail=f"Invalid table name: {table_name}")
        savepoint_name = f"sp_{table_name}"
        try:
            await db.execute(text(f"SAVEPOINT {savepoint_name}"))

            if table_name == "users":
                await db.execute(
                    text(f"DELETE FROM {table_name} WHERE role_id = :role_id"),
                    {"role_id": CUSTOMER_ROLE_ID}
                )
            elif table_name == "referrals":
                await db.execute(
                    text(f"""
                        DELETE FROM {table_name}
                        WHERE referrer_id IN (SELECT id FROM users WHERE role_id = :role_id)
                           OR invitee_id IN (SELECT id FROM users WHERE role_id = :role_id)
                    """),
                    {"role_id": CUSTOMER_ROLE_ID}
                )
            elif table_name == "order_items":
                await db.execute(
                    text("""
                        DELETE FROM order_items
                        WHERE order_id IN (
                            SELECT id FROM orders
                            WHERE user_id IN (SELECT id FROM users WHERE role_id = :role_id)
                        )
                    """),
                    {"role_id": CUSTOMER_ROLE_ID}
                )
            elif table_name in ("order_status_history", "payments"):
                await db.execute(
                    text(f"""
                        DELETE FROM {table_name}
                        WHERE order_id IN (
                            SELECT id FROM orders
                            WHERE user_id IN (SELECT id FROM users WHERE role_id = :role_id)
                        )
                    """),
                    {"role_id": CUSTOMER_ROLE_ID}
                )
            elif table_name == "feedback":
                await db.execute(
                    text("""
                        DELETE FROM feedback
                        WHERE order_id IN (
                            SELECT id FROM orders
                            WHERE user_id IN (SELECT id FROM users WHERE role_id = :role_id)
                        )
                    """),
                    {"role_id": CUSTOMER_ROLE_ID}
                )
            elif table_name == "audit_log":
                await db.execute(
                    text("""
                        DELETE FROM audit_log
                        WHERE user_id IN (SELECT id FROM users WHERE role_id = :role_id)
                    """),
                    {"role_id": CUSTOMER_ROLE_ID}
                )
            else:
                await db.execute(
                    text(f"""
                        DELETE FROM {table_name}
                        WHERE user_id IN (SELECT id FROM users WHERE role_id = :role_id)
                    """),
                    {"role_id": CUSTOMER_ROLE_ID}
                )
            deleted_counts[table_name] = "ok"
        except Exception as e:
            await db.execute(text(f"ROLLBACK TO SAVEPOINT {savepoint_name}"))
            deleted_counts[table_name] = f"ERROR: {str(e)[:80]}"

    try:
        await db.execute(text("DELETE FROM wallet_transactions"))
        deleted_counts["wallet_transactions"] = "ok_all"
    except Exception as e:
        deleted_counts["wallet_transactions"] = f"ERROR: {str(e)[:80]}"

    try:
        await db.execute(text("DELETE FROM wallets"))
        deleted_counts["wallets"] = "ok_all"
    except Exception as e:
        deleted_counts["wallets"] = f"ERROR: {str(e)[:80]}"

    ip = get_client_ip(request)
    await log_action(
        db,
        action="RESET_ALL_CUSTOMERS",
        user_id=user.id,
        entity_type="system",
        entity_id=None,
        details={"deleted_tables": deleted_counts},
        ip_address=ip,
    )

    return {
        "message": "All customer data deleted successfully",
        "deleted_counts": deleted_counts,
    }


@router.post("/wallet/topup")
async def admin_wallet_topup(
    request: Request,
    data: dict,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(RoleIDs.ADMIN)),
):
    """
    In-store wallet top-up processed by staff at the counter.
    Customer hands over cash/card at the counter, staff credits their wallet instantly.
    """
    phone = data.get("phone", "").strip()
    amount = data.get("amount")
    payment_method = data.get("payment_method", "cash")
    notes = data.get("notes", "")

    if not phone:
        raise HTTPException(status_code=400, detail="Customer phone number is required")
    if not amount or amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than 0")

    phone_digits = ''.join(c for c in phone if c.isdigit())
    result = await db.execute(
        select(User).where(func.regexp_replace(User.phone, r'\D', '', 'g').ilike(f"%{phone_digits}%"))
    )
    customer = result.scalar_one_or_none()
    if not customer:
        raise HTTPException(status_code=404, detail=f"Customer with phone {phone} not found")

    description = f"In-store top-up via {payment_method}"
    if notes:
        description += f" — {notes}"
    wallet, new_balance = await credit_wallet(db, customer.id, float(amount), description)

    ip = get_client_ip(request)
    await log_action(
        db,
        action="WALLET_TOPUP",
        user_id=user.id,
        entity_type="wallet",
        entity_id=wallet.id,
        details={
            "customer_id": customer.id,
            "customer_phone": phone,
            "customer_name": customer.name,
            "amount": amount,
            "payment_method": payment_method,
            "new_balance": new_balance,
            "notes": notes,
        },
        ip_address=ip,
    )

    return {
        "message": f"Top-up successful. New balance: RM {new_balance:.2f}",
        "customer_id": customer.id,
        "customer_name": customer.name,
        "customer_phone": customer.phone,
        "amount": amount,
        "payment_method": payment_method,
        "new_balance": new_balance,
        "previous_balance": round(new_balance - float(amount), 2),
    }


@router.get("/customers/{user_id}/wallet")
async def customer_wallet(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(RoleIDs.ADMIN, RoleIDs.BRAND_OWNER, RoleIDs.MANAGER, RoleIDs.ASSISTANT_MANAGER, RoleIDs.STAFF, RoleIDs.HQ_STAFF)),
):
    """
    Return a customer's available rewards and vouchers for in-store POS use.
    Staff looks up customer by phone, then calls this to see what they can apply.
    """
    now = now_utc()

    customer_result = await db.execute(select(User).where(User.id == user_id, User.role_id == RoleIDs.CUSTOMER))
    customer = customer_result.scalar_one_or_none()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    ur_query = (
        select(UserReward, Reward)
        .join(Reward, UserReward.reward_id == Reward.id, isouter=True)
        .where(
            UserReward.user_id == user_id,
            UserReward.status == "available",
            or_(UserReward.expires_at.is_(None), UserReward.expires_at > ensure_utc(now)),
        )
        .order_by(UserReward.expires_at.asc())
    )
    ur_result = await db.execute(ur_query)
    rewards = []
    for ur, r in ur_result.all():
        rewards.append({
            "id": ur.id,
            "reward_id": ur.reward_id,
            "name": r.name if r else (ur.reward_snapshot or {}).get("name", "Unknown"),
            "redemption_code": ur.redemption_code,
            "points_spent": ur.points_spent,
            "expires_at": ur.expires_at.isoformat() if ur.expires_at else None,
            "status": ur.status,
        })

    uv_query = (
        select(UserVoucher, Voucher)
        .join(Voucher, UserVoucher.voucher_id == Voucher.id, isouter=True)
        .where(
            UserVoucher.user_id == user_id,
            UserVoucher.status == "available",
            or_(UserVoucher.expires_at.is_(None), UserVoucher.expires_at > ensure_utc(now)),
        )
        .order_by(UserVoucher.expires_at.asc())
    )
    uv_result = await db.execute(uv_query)
    vouchers = []
    for uv, v in uv_result.all():
        vouchers.append({
            "id": uv.id,
            "voucher_id": uv.voucher_id,
            "title": v.title if v else uv.code,
            "code": uv.code,
            "discount_type": uv.discount_type or (v.discount_type.value if v and hasattr(v.discount_type, 'value') else None),
            "discount_value": to_float(uv.discount_value) if uv.discount_value else (to_float(v.discount_value) if v and v.discount_value else None),
            "min_spend": to_float(uv.min_spend) if uv.min_spend else (to_float(v.min_spend) if v and v.min_spend else None),
            "expires_at": uv.expires_at.isoformat() if uv.expires_at else None,
            "status": uv.status,
        })

    return {
        "customer_id": customer.id,
        "customer_name": customer.name,
        "customer_phone": customer.phone,
        "rewards": rewards,
        "vouchers": vouchers,
    }


@router.post("/customers/{user_id}/use-reward/{ur_id}")
async def use_customer_reward(
    user_id: int,
    ur_id: int,
    req: UseItemRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(RoleIDs.ADMIN, RoleIDs.BRAND_OWNER, RoleIDs.MANAGER, RoleIDs.ASSISTANT_MANAGER, RoleIDs.STAFF, RoleIDs.HQ_STAFF)),
):
    """
    Staff marks a specific reward as used at the counter.
    Called from the POS Terminal after staff confirms with customer.
    """
    now = now_utc()

    result = await db.execute(
        select(UserReward).where(UserReward.id == ur_id, UserReward.user_id == user_id)
    )
    ur = result.scalar_one_or_none()
    if not ur:
        raise HTTPException(status_code=404, detail="Reward not found for this customer")

    if ur.status == "used":
        raise HTTPException(status_code=400, detail="Reward already used")
    if ur.status == "expired":
        raise HTTPException(status_code=400, detail="Reward has expired")
    if ur.expires_at and ensure_utc(ur.expires_at) < now:
        ur.status = "expired"
        await db.flush()
        raise HTTPException(status_code=400, detail="Reward has expired")

    ur.status = "used"
    ur.is_used = True
    ur.used_at = now
    if req.store_id:
        ur.store_id = req.store_id

    r_result = await db.execute(select(Reward).where(Reward.id == ur.reward_id))
    reward = r_result.scalar_one_or_none()

    ip = get_client_ip(request)
    await log_action(
        db,
        action="REWARD_USED_IN_STORE",
        user_id=user.id,
        entity_type="user_reward",
        entity_id=ur.id,
        details={
            "customer_id": user_id,
            "reward_id": ur.reward_id,
            "redemption_code": ur.redemption_code,
            "store_id": req.store_id,
            "notes": req.notes,
        },
        ip_address=ip,
    )

    return {
        "success": True,
        "message": f"Reward used: {reward.name if reward else 'Unknown'}",
        "reward_name": reward.name if reward else (ur.reward_snapshot or {}).get("name"),
        "redemption_code": ur.redemption_code,
        "used_at": ur.used_at.isoformat() if ur.used_at else None,
    }


@router.post("/customers/{user_id}/use-voucher/{uv_id}")
async def use_customer_voucher(
    user_id: int,
    uv_id: int,
    req: UseItemRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(RoleIDs.ADMIN, RoleIDs.BRAND_OWNER, RoleIDs.MANAGER, RoleIDs.ASSISTANT_MANAGER, RoleIDs.STAFF, RoleIDs.HQ_STAFF)),
):
    """
    Staff marks a specific voucher as used at the counter.
    Called from the POS Terminal after staff confirms with customer.
    """
    now = now_utc()

    result = await db.execute(
        select(UserVoucher).where(UserVoucher.id == uv_id, UserVoucher.user_id == user_id)
    )
    uv = result.scalar_one_or_none()
    if not uv:
        raise HTTPException(status_code=404, detail="Voucher not found for this customer")

    if uv.status == "used":
        raise HTTPException(status_code=400, detail="Voucher already used")
    if uv.status == "expired":
        raise HTTPException(status_code=400, detail="Voucher has expired")
    if uv.expires_at and ensure_utc(uv.expires_at) < now:
        uv.status = "expired"
        await db.flush()
        raise HTTPException(status_code=400, detail="Voucher has expired")

    uv.status = "used"
    uv.used_at = now
    if req.store_id:
        uv.store_id = req.store_id

    v_result = await db.execute(select(Voucher).where(Voucher.id == uv.voucher_id))
    voucher = v_result.scalar_one_or_none()
    if voucher:
        voucher.used_count += 1

    ip = get_client_ip(request)
    await log_action(
        db,
        action="VOUCHER_USED_IN_STORE",
        user_id=user.id,
        entity_type="user_voucher",
        entity_id=uv.id,
        details={
            "customer_id": user_id,
            "voucher_id": uv.voucher_id,
            "code": uv.code,
            "store_id": req.store_id,
            "notes": req.notes,
        },
        ip_address=ip,
    )

    return {
        "success": True,
        "message": f"Voucher used: {voucher.title if voucher else uv.code}",
        "voucher_title": voucher.title if voucher else None,
        "code": uv.code,
        "discount_value": to_float(voucher.discount_value) if voucher else None,
        "discount_type": voucher.discount_type.value if voucher and hasattr(voucher.discount_type, 'value') else None,
        "used_at": uv.used_at.isoformat() if uv.used_at else None,
    }
