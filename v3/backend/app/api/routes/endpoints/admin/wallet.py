"""Admin and public wallet endpoints."""
import json
import logging
from datetime import datetime, timezone
from decimal import Decimal

logger = logging.getLogger(__name__)

from fastapi import APIRouter, Form, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.api.routes.deps import ActiveCustomer, CurrentAdmin, DBDependency, require_hq_write_admin
from app.core.money import money_round, to_decimal
from app.models.platform import AuditLog
from app.models.wallet import Wallet, WalletLedgerEntry, WalletTopupSession
from app.services.platform_config import PlatformConfigService
from app.schemas.base import APIResponse, Money, PaginatedResponse, BaseSchema
from app.schemas.wallet import (
    AdminTopupRequest,
    TopUpRequest,
    WalletLedgerEntryOut,
    WalletOut,
    WalletTopupCheckoutRequest,
    WalletTopupCheckoutResponse,
)

admin_router = APIRouter(prefix="/admin/wallets", tags=["admin — wallets"])
wallet_alias_router = APIRouter(prefix="/admin/wallet", tags=["admin — wallets"])
public_router = APIRouter(prefix="/wallet", tags=["wallet"])


async def _get_wallet_or_404(db, wallet_id: int) -> Wallet:
    result = await db.execute(select(Wallet).where(Wallet.id == wallet_id))
    wallet = result.scalar_one_or_none()
    if wallet is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Wallet not found")
    return wallet


async def _get_customer_wallet(db, customer_id: int) -> Wallet | None:
    result = await db.execute(select(Wallet).where(Wallet.customer_id == customer_id))
    return result.scalar_one_or_none()


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
            parsed = json.loads(row)
            if isinstance(parsed, str):
                return parsed
        except Exception:
            logger.debug("Failed to parse config JSON", exc_info=True)
        return row
    return str(row)


def _compute_wallet_stats(ledger_entries: list[WalletLedgerEntry]) -> dict:
    total_credited = Decimal(0)
    total_debited = Decimal(0)
    for entry in ledger_entries:
        amt = entry.amount if isinstance(entry.amount, Decimal) else Decimal(str(entry.amount))
        if entry.entry_type in ("credit", "release"):
            total_credited += amt
        elif entry.entry_type in ("debit", "hold"):
            total_debited += amt
        elif entry.entry_type == "adjustment":
            total_credited += amt
    balance = total_credited - total_debited
    return {
        "balance": balance,
        "total_credited": total_credited,
        "total_debited": total_debited,
    }


def _wallet_to_out(wallet: Wallet, ledger_entries: list[WalletLedgerEntry] | None = None) -> WalletOut:
    data = {c: getattr(wallet, c) for c in wallet.__table__.columns.keys()}
    if ledger_entries is not None:
        stats = _compute_wallet_stats(ledger_entries)
        data.update(stats)
    else:
        data["balance"] = Decimal(0)
        data["total_credited"] = Decimal(0)
        data["total_debited"] = Decimal(0)
    return WalletOut.model_validate(data)


# ---------------------------------------------------------------------------
# Admin endpoints
# ---------------------------------------------------------------------------

@admin_router.get("", response_model=APIResponse[PaginatedResponse[WalletOut]])
async def list_wallets(
    db: DBDependency,
    admin: CurrentAdmin,
    customer_id: int | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=500),
):
    """List wallets with optional customer filter."""
    base_stmt = select(Wallet)
    count_stmt = select(func.count(Wallet.id))

    if customer_id is not None:
        base_stmt = base_stmt.where(Wallet.customer_id == customer_id)
        count_stmt = count_stmt.where(Wallet.customer_id == customer_id)

    total_result = await db.execute(count_stmt)
    total = total_result.scalar() or 0

    stmt = (
        base_stmt.order_by(Wallet.id.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .options(selectinload(Wallet.ledger_entries))
    )
    result = await db.execute(stmt)
    wallets = result.unique().scalars().all()

    items = []
    for wallet in wallets:
        items.append(_wallet_to_out(wallet, wallet.ledger_entries))

    return APIResponse(
        data=PaginatedResponse(
            items=items,
            total=total,
            page=page,
            per_page=per_page,
            total_pages=(total + per_page - 1) // per_page,
        )
    )


@admin_router.get("/{wallet_id}", response_model=APIResponse[WalletOut])
async def get_wallet(
    db: DBDependency,
    admin: CurrentAdmin,
    wallet_id: int,
):
    """Get wallet detail with ledger."""
    wallet = await _get_wallet_or_404(db, wallet_id)
    ledger_result = await db.execute(
        select(WalletLedgerEntry).where(WalletLedgerEntry.wallet_id == wallet_id)
    )
    ledger = ledger_result.scalars().all()
    return APIResponse(data=_wallet_to_out(wallet, ledger))


@admin_router.get("/{wallet_id}/ledger", response_model=APIResponse[PaginatedResponse[WalletLedgerEntryOut]])
async def list_wallet_ledger(
    db: DBDependency,
    admin: CurrentAdmin,
    wallet_id: int,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=500),
):
    """List ledger entries for a wallet."""
    await _get_wallet_or_404(db, wallet_id)

    count_stmt = select(func.count(WalletLedgerEntry.id)).where(WalletLedgerEntry.wallet_id == wallet_id)
    total_result = await db.execute(count_stmt)
    total = total_result.scalar() or 0

    stmt = (
        select(WalletLedgerEntry)
        .where(WalletLedgerEntry.wallet_id == wallet_id)
        .order_by(WalletLedgerEntry.id.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    result = await db.execute(stmt)
    items = [WalletLedgerEntryOut.model_validate(e) for e in result.scalars().all()]

    return APIResponse(
        data=PaginatedResponse(
            items=items,
            total=total,
            page=page,
            per_page=per_page,
            total_pages=(total + per_page - 1) // per_page,
        )
    )


class WalletAdjustRequest(BaseSchema):
    amount: Money = Field(..., gt=0)
    entry_type: str = Field(..., pattern=r"^(credit|debit|adjustment)$")
    description: str | None = Field(None, max_length=255)


@admin_router.post("/{wallet_id}/adjust", response_model=APIResponse[WalletLedgerEntryOut])
async def adjust_wallet(
    db: DBDependency,
    admin: CurrentAdmin,
    wallet_id: int,
    data: WalletAdjustRequest,
):
    """Manually adjust wallet balance (credit/debit)."""
    # Platform-wide money mutation — HQ roles only (store_manager/readonly → 403).
    await require_hq_write_admin(db, admin)

    config_service = PlatformConfigService(db)
    precision = await config_service.get_accounting_precision()
    rounding_mode = await config_service.get_accounting_rounding()

    # Lock the wallet row first so concurrent adjustments serialize on it (the
    # last-ledger-entry lock alone does not protect a wallet with no entries).
    wallet_result = await db.execute(
        select(Wallet).where(Wallet.id == wallet_id).with_for_update()
    )
    wallet = wallet_result.scalar_one_or_none()
    if wallet is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Wallet not found")

    # Get current running balance with row lock
    result = await db.execute(
        select(WalletLedgerEntry)
        .where(WalletLedgerEntry.wallet_id == wallet_id)
        .order_by(WalletLedgerEntry.id.desc())
        .limit(1)
        .with_for_update()
    )
    last_entry = result.scalar_one_or_none()
    current_balance = to_decimal(last_entry.running_balance) if last_entry else Decimal(0)
    amount = to_decimal(data.amount)

    if data.entry_type == "debit":
        new_balance = money_round(current_balance - amount, precision, rounding_mode)
    else:
        new_balance = money_round(current_balance + amount, precision, rounding_mode)

    entry = WalletLedgerEntry(
        wallet_id=wallet_id,
        entry_type=data.entry_type,
        amount=amount,
        running_balance=new_balance,
        description=data.description or f"Manual {data.entry_type} by admin {admin.id}",
        reference_type="adjustment",
        reference_id=None,
    )
    db.add(entry)
    db.add(AuditLog(
        action="update",
        resource_type="wallet",
        resource_id=wallet_id,
        principal_id=admin.id,
        severity="warning",
        changes_summary={"amount": str(amount), "entry_type": data.entry_type, "new_balance": str(new_balance), "description": data.description},
    ))
    await db.commit()
    await db.refresh(entry)
    return APIResponse(data=WalletLedgerEntryOut.model_validate(entry))


@admin_router.post("/topup", response_model=APIResponse[dict])
async def admin_topup(db: DBDependency, admin: CurrentAdmin, data: AdminTopupRequest):
    """Admin wallet top-up by customer_id."""
    # Platform-wide money mutation — HQ roles only (store_manager/readonly → 403).
    await require_hq_write_admin(db, admin)

    config_service = PlatformConfigService(db)
    precision = await config_service.get_accounting_precision()
    rounding_mode = await config_service.get_accounting_rounding()

    customer_id = data.customer_id
    amount = to_decimal(data.amount)
    reason = data.reason or "Admin top-up"
    if amount <= 0:
        raise HTTPException(400, "Amount must be positive")

    # Lock the wallet row first so concurrent top-ups serialize on it (the
    # last-ledger-entry lock alone does not protect a wallet with no entries).
    wallet_result = await db.execute(
        select(Wallet).where(Wallet.customer_id == customer_id).with_for_update()
    )
    wallet = wallet_result.scalar_one_or_none()
    if not wallet:
        wallet = Wallet(customer_id=customer_id, currency_code=await _get_default_currency(db))
        db.add(wallet); await db.flush()

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

    entry = WalletLedgerEntry(wallet_id=wallet.id, entry_type="credit", amount=amount, running_balance=new_balance, description=reason, reference_type="adjustment")
    db.add(entry)
    db.add(AuditLog(
        action="transfer",
        resource_type="wallet",
        resource_id=wallet.id,
        principal_id=admin.id,
        severity="warning",
        changes_summary={"amount": str(amount), "reason": reason, "new_balance": str(new_balance)},
    )); await db.commit(); await db.refresh(entry)
    return APIResponse(data={"message": "Top-up complete", "new_balance": float(new_balance)})


@wallet_alias_router.post("/topup", response_model=APIResponse[dict])
async def admin_topup_alias(db: DBDependency, admin: CurrentAdmin, data: AdminTopupRequest):
    """Alias for /admin/wallets/topup (matches frontend url)."""
    return await admin_topup(db, admin, data)



class AdminDeductRequest(BaseSchema):
    customer_id: int = Field(..., gt=0)
    amount: Money = Field(..., gt=0)
    reason: str | None = Field(None, max_length=255)


@admin_router.post("/deduct", response_model=APIResponse[dict])
async def admin_deduct(db: DBDependency, admin: CurrentAdmin, data: AdminDeductRequest):
    """Admin wallet deduction by customer_id."""
    # Platform-wide money mutation — HQ roles only (store_manager/readonly → 403).
    await require_hq_write_admin(db, admin)

    config_service = PlatformConfigService(db)
    precision = await config_service.get_accounting_precision()
    rounding_mode = await config_service.get_accounting_rounding()

    customer_id = data.customer_id
    amount = to_decimal(data.amount)
    reason = data.reason or "Admin deduction"

    # Lock the wallet row first so concurrent deductions serialize on it (the
    # last-ledger-entry lock alone does not protect a wallet with no entries).
    wallet_result = await db.execute(
        select(Wallet).where(Wallet.customer_id == customer_id).with_for_update()
    )
    wallet = wallet_result.scalar_one_or_none()
    if not wallet: raise HTTPException(404, "No wallet found")

    r = await db.execute(
        select(WalletLedgerEntry)
        .where(WalletLedgerEntry.wallet_id == wallet.id)
        .order_by(WalletLedgerEntry.id.desc())
        .limit(1)
        .with_for_update()
    )
    last = r.scalar_one_or_none()
    current = to_decimal(last.running_balance) if last else Decimal(0)
    if current < amount: raise HTTPException(400, f"Insufficient balance: {current}")
    new_balance = money_round(current - amount, precision, rounding_mode)

    entry = WalletLedgerEntry(wallet_id=wallet.id, entry_type="debit", amount=amount, running_balance=new_balance, description=reason, reference_type="adjustment")
    db.add(entry)
    db.add(AuditLog(
        action="transfer",
        resource_type="wallet",
        resource_id=wallet.id,
        principal_id=admin.id,
        severity="warning",
        changes_summary={"amount": str(amount), "reason": reason, "new_balance": str(new_balance)},
    )); await db.commit(); await db.refresh(entry)
    return APIResponse(data={"message": "Deducted", "new_balance": float(new_balance)})


# ---------------------------------------------------------------------------
# Public endpoints
# ---------------------------------------------------------------------------

@public_router.get("/me", response_model=APIResponse[dict])
async def get_my_wallet(
    customer: ActiveCustomer,
    db: DBDependency,
):
    """Get current customer's wallet, vouchers, and rewards. Auto-creates wallet if not found."""
    from app.services.commerce import expire_stale_wallet_items
    if await expire_stale_wallet_items(db, customer.id):
        await db.commit()
    wallet = await _get_customer_wallet(db, customer.id)
    if wallet is None:
        wallet = Wallet(
            customer_id=customer.id,
            currency_code=await _get_default_currency(db),
        )
        db.add(wallet)
        await db.commit()
        await db.refresh(wallet)
    ledger_result = await db.execute(
        select(WalletLedgerEntry).where(WalletLedgerEntry.wallet_id == wallet.id)
    )
    ledger = ledger_result.scalars().all()
    wallet_data = _wallet_to_out(wallet, ledger).model_dump()

    # Fetch active customer vouchers
    from app.models.voucher import CustomerVoucher, VoucherDefinition
    v_result = await db.execute(
        select(CustomerVoucher, VoucherDefinition)
        .join(VoucherDefinition, CustomerVoucher.voucher_definition_id == VoucherDefinition.id)
        .where(
            CustomerVoucher.customer_id == customer.id,
            CustomerVoucher.status == "active",
        )
        .order_by(CustomerVoucher.expires_at.asc()).limit(50)
    )
    vouchers = []
    for cv, vd in v_result.all():
        vouchers.append({
            "id": cv.id,
            "code": cv.voucher_code,
            "discount_type": vd.voucher_type,
            "discount_value": float(vd.discount_value) if vd else None,
            "min_spend": float(vd.minimum_order_value or 0) if vd else 0,
            "max_discount": float(vd.discount_max_amount) if vd and vd.discount_max_amount else None,
            "display_title": vd.display_title if vd else None,
            "image_url": vd.image_url if vd else None,
            "expires_at": cv.expires_at.isoformat() if cv.expires_at else None,
            "status": cv.status,
        })

    # Fetch active customer rewards
    from app.models.reward import CustomerReward, RewardCatalog
    r_result = await db.execute(
        select(CustomerReward, RewardCatalog)
        .join(RewardCatalog, CustomerReward.reward_catalog_id == RewardCatalog.id)
        .where(
            CustomerReward.customer_id == customer.id,
            CustomerReward.status == "active",
        )
        .order_by(CustomerReward.expires_at.asc()).limit(50)
    )
    rewards = []
    for cr, rc in r_result.all():
        rewards.append({
            "id": cr.id,
            "code": cr.redemption_code,
            "reward_name": rc.reward_name if rc else None,
            "reward_type": rc.reward_type if rc else None,
            "discount_value": float(rc.discount_value) if rc and rc.discount_value else None,
            "discount_max_amount": float(rc.discount_max_amount) if rc and rc.discount_max_amount else None,
            "points_spent": cr.points_spent,
            "expires_at": cr.expires_at.isoformat() if cr.expires_at else None,
            "status": cr.status,
            "reward_snapshot": cr.reward_snapshot,
        })

    wallet_data["rewards"] = rewards
    wallet_data["vouchers"] = vouchers
    return APIResponse(data=wallet_data)


@public_router.get("/ledger/me", response_model=APIResponse[PaginatedResponse[WalletLedgerEntryOut]])
async def get_my_ledger(
    customer: ActiveCustomer,
    db: DBDependency,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=500),

    date_from: str | None = Query(None, description="Start date (YYYY-MM-DD)"),
    date_to: str | None = Query(None, description="End date (YYYY-MM-DD)"),):
    """Get current customer's ledger entries. Returns empty if no wallet."""
    wallet = await _get_customer_wallet(db, customer.id)
    if wallet is None:
        return APIResponse(
            data=PaginatedResponse(
                items=[],
                total=0,
                page=page,
                per_page=per_page,
                total_pages=0,
            )
        )

    count_stmt = select(func.count(WalletLedgerEntry.id)).where(WalletLedgerEntry.wallet_id == wallet.id)
    total_result = await db.execute(count_stmt)
    total = total_result.scalar() or 0

    stmt = (
        select(WalletLedgerEntry)
        .where(WalletLedgerEntry.wallet_id == wallet.id)
        .order_by(WalletLedgerEntry.id.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    result = await db.execute(stmt)
    items = [WalletLedgerEntryOut.model_validate(e) for e in result.scalars().all()]

    return APIResponse(
        data=PaginatedResponse(
            items=items,
            total=total,
            page=page,
            per_page=per_page,
            total_pages=(total + per_page - 1) // per_page,
        )
    )


@public_router.post("/topup/checkout", response_model=APIResponse[WalletTopupCheckoutResponse], status_code=status.HTTP_201_CREATED)
async def create_wallet_topup_checkout(
    customer: ActiveCustomer,
    db: DBDependency,
    data: WalletTopupCheckoutRequest,
):
    """Create a checkout session for an online wallet top-up (Stripe or HitPay)."""
    from app.services.payment import PaymentError, create_wallet_topup_checkout_session
    from app.services.hitpay import create_hitpay_payment_request

    amount = to_decimal(data.amount)
    currency = await _get_default_currency(db)
    provider = getattr(data, 'provider', 'stripe') or 'stripe'

    session = WalletTopupSession(
        customer_id=customer.id,
        amount=amount,
        currency_code=currency,
        status="pending",
        provider=provider,
    )
    db.add(session)
    await db.flush()
    await db.refresh(session)

    config_service = PlatformConfigService(db)
    app_public_url = await config_service.get_app_public_url()
    base_return = (data.return_url or f"{app_public_url}/#wallet").rstrip("/")
    # The return_url may already carry query params (e.g. ?returnTo=checkout)
    sep = "&" if "?" in base_return else "?"
    success_url = f"{base_return}{sep}topup_session={session.id}&status=success"
    cancel_url = f"{base_return}{sep}topup_session={session.id}&status=cancel"

    if provider == "hitpay":
        try:
            resp = await create_hitpay_payment_request(
                db, None, None, None, amount=amount, currency=currency,
                return_url=success_url,
            )
            session.provider_session_id = resp["id"]
            await db.commit()
            await db.refresh(session)
            return APIResponse(data=WalletTopupCheckoutResponse(
                session_id=session.id,
                checkout_url=resp["url"],
                amount=amount,
                currency_code=currency,
                status="pending",
            ))
        except Exception as exc:
            await db.rollback()
            logger.exception("HitPay wallet top-up checkout creation failed")
            raise HTTPException(status_code=502, detail="HitPay top-up checkout could not be created") from exc

    try:
        checkout = await create_wallet_topup_checkout_session(
            db, session.id, customer.id, amount, currency, success_url=success_url, cancel_url=cancel_url
        )
    except PaymentError as exc:
        await db.rollback()
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc

    session.provider_session_id = checkout["id"]
    await db.commit()
    await db.refresh(session)

    return APIResponse(
        data=WalletTopupCheckoutResponse(
            session_id=session.id,
            checkout_url=checkout["url"],
            amount=session.amount,
            currency_code=session.currency_code,
            status=session.status,
        )
    )


@public_router.post("/topup", response_model=APIResponse[dict])
async def request_topup(
    customer: ActiveCustomer,
    db: DBDependency,
    data: TopUpRequest,
):
    """Request a wallet top-up.

    Online top-up is disabled until a real payment-provider flow is integrated.
    Previously this endpoint credited the wallet immediately without verifying
    payment, which allowed arbitrary balance inflation.
    """
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Online wallet top-up is not available until a payment provider is integrated. Please top up at a store.",
    )


# ---------------------------------------------------------------------------
# Dev/staging checkout simulator (only active when Stripe keys are NOT set)
# ---------------------------------------------------------------------------

_SIM_PAGE = """<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Simulated Checkout</title>
<style>
  body {{ font-family: -apple-system, 'Segoe UI', sans-serif; background: #F6F4EF; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }}
  .card {{ background: #fff; border: 1px solid #E8E6E0; border-radius: 14px; padding: 32px; max-width: 380px; width: 90%; text-align: center; }}
  .badge {{ display: inline-block; background: #F7F1DF; color: #8A6D1F; font-size: 11px; font-weight: 700; letter-spacing: .08em; padding: 4px 12px; border-radius: 999px; margin-bottom: 14px; }}
  h1 {{ font-size: 18px; margin: 0 0 4px; }}
  .amt {{ font-size: 30px; font-weight: 800; margin: 14px 0 24px; }}
  button {{ display: block; width: 100%; padding: 13px; border: none; border-radius: 8px; font-size: 15px; font-weight: 700; cursor: pointer; margin-top: 10px; }}
  .pay {{ background: #3B4A1A; color: #fff; }}
  .cancel {{ background: transparent; color: #4A4038; border: 1px solid #E8E6E0 !important; }}
  .note {{ font-size: 11px; color: #8A8078; margin-top: 18px; }}
</style></head><body>
<div class="card">
  <span class="badge">SIMULATED CHECKOUT</span>
  <h1>{title}</h1>
  <div class="amt">{amount}</div>
  <form method="post" action="{complete_url}">
    {hidden}
    <input type="hidden" name="success" value="{success}">
    <input type="hidden" name="cancel" value="{cancel}">
    <button class="pay" name="action" value="pay" type="submit">Pay now (simulate)</button>
    <button class="cancel" name="action" value="cancel" type="submit">Cancel</button>
  </form>
  <div class="note">Checkout is simulated on this server (Settings → Payment Gateway → Checkout Mode). No real payment is made.</div>
</div></body></html>"""


@public_router.get("/topup/simulator", response_class=None)
async def wallet_topup_simulator(
    db: DBDependency,
    session_id: int = Query(0),
    payment_id: int = Query(0),
    type: str = Query("wallet"),
    success: str = Query(""),
    cancel: str = Query(""),
):
    """Simulated checkout page — active when stripe.checkout_mode='simulator'
    or no Stripe keys are configured (404 otherwise)."""
    from fastapi.responses import HTMLResponse
    from app.services.payment import _use_simulator

    if not await _use_simulator(db):
        raise HTTPException(status_code=404, detail="Not found")

    if type == "order":
        from app.models.payment import Payment
        payment = await db.get(Payment, payment_id)
        if payment is None or payment.status not in ("initiated", "pending_authorization", "failed"):
            return HTMLResponse("<h3 style='font-family:sans-serif;text-align:center;margin-top:40px'>This checkout session is no longer valid.</h3>", status_code=410)
        amount = f"{payment.currency_code} {to_decimal(payment.amount):.2f}"
        hidden = f'<input type="hidden" name="payment_id" value="{payment.id}">'
        title = "Order Payment"
    else:
        session = await db.get(WalletTopupSession, session_id)
        if session is None or session.status != "pending":
            return HTMLResponse("<h3 style='font-family:sans-serif;text-align:center;margin-top:40px'>This checkout session is no longer valid.</h3>", status_code=410)
        amount = f"{session.currency_code} {to_decimal(session.amount):.2f}"
        hidden = f'<input type="hidden" name="session_id" value="{session.id}">'
        title = "Wallet Top-up"

    return HTMLResponse(_SIM_PAGE.format(
        amount=amount,
        title=title,
        hidden=hidden,
        success=success,
        cancel=cancel,
        complete_url="/api/wallet/topup/simulator/complete",
    ))


@public_router.post("/topup/simulator/complete", response_class=None)
async def wallet_topup_simulator_complete(
    db: DBDependency,
    session_id: int = Form(0),
    payment_id: int = Form(0),
    action: str = Form(...),
    success: str = Form(""),
    cancel: str = Form(""),
):
    """Complete (or cancel) a simulated checkout and redirect back. Runs the
    SAME completion code as the real Stripe webhook. 404 when the simulator
    is not active."""
    from fastapi.responses import RedirectResponse
    from app.services.payment import _complete_wallet_topup, _use_simulator

    if not await _use_simulator(db):
        raise HTTPException(status_code=404, detail="Not found")

    # ── Order payment: drive the standard webhook pipeline with a synthetic
    # checkout.session.completed event (capture, loyalty, e-invoice — all of it)
    if payment_id:
        from app.models.payment import Payment
        from app.services.payment import process_webhook_event
        from uuid import uuid4

        payment = await db.get(Payment, payment_id)
        if payment is None:
            raise HTTPException(status_code=410, detail="Checkout session not found")
        if action == "pay":
            fake_pi = f"pi_test_{uuid4().hex}"
            payload = {
                "type": "checkout.session.completed",
                "id": f"evt_sim_{uuid4().hex}",
                "data": {"object": {
                    "id": f"cs_test_{uuid4().hex}",
                    "payment_status": "paid",
                    "payment_intent": fake_pi,
                    "amount_total": int(round(float(payment.amount) * 100)),
                    "currency": (payment.currency_code or "myr").lower(),
                    "metadata": {"payment_id": str(payment.id), "order_id": str(payment.order_id)},
                }},
            }
            await process_webhook_event(db, "stripe", payload)
            await db.commit()
            return RedirectResponse(success or "/", status_code=303)
        if payment.status in ("initiated", "pending_authorization", "failed"):
            payment.status = "voided"
            await db.commit()
        return RedirectResponse(cancel or "/", status_code=303)

    # ── Wallet top-up
    session = await db.get(WalletTopupSession, session_id)
    if session is None:
        raise HTTPException(status_code=410, detail="Checkout session not found")

    if action == "pay" and session.status == "pending":
        await _complete_wallet_topup(db, session, "Online top-up via Stripe (simulated)")
        await db.commit()
        return RedirectResponse(success or "/#wallet?status=success", status_code=303)

    if action == "pay":
        # already completed (double submit / refresh) — just send them back
        return RedirectResponse(success or "/#wallet?status=success", status_code=303)

    if session.status == "pending":
        session.status = "cancelled"
        await db.commit()
    return RedirectResponse(cancel or "/#wallet?status=cancel", status_code=303)
