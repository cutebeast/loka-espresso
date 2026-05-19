"""Admin and public wallet endpoints."""

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select

from app.api.v1.deps import ActiveCustomer, CurrentAdmin, DBDependency
from app.models.wallet import Wallet, WalletLedgerEntry
from app.schemas.base import APIResponse, PaginatedResponse
from app.schemas.wallet import TopUpRequest, WalletLedgerEntryOut, WalletOut

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


def _compute_wallet_stats(ledger_entries: list[WalletLedgerEntry]) -> dict:
    total_credited = 0.0
    total_debited = 0.0
    for entry in ledger_entries:
        if entry.entry_type in ("credit", "release"):
            total_credited += float(entry.amount)
        elif entry.entry_type in ("debit", "hold"):
            total_debited += float(entry.amount)
        elif entry.entry_type == "adjustment":
            # Treat adjustment directionally based on running balance change
            # Since we don't have previous entry easily, just add to credited as a simplification
            total_credited += float(entry.amount)
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
        data["balance"] = 0.0
        data["total_credited"] = 0.0
        data["total_debited"] = 0.0
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
    per_page: int = Query(20, ge=1, le=100),
):
    """List wallets with optional customer filter."""
    base_stmt = select(Wallet)
    count_stmt = select(func.count(Wallet.id))

    if customer_id is not None:
        base_stmt = base_stmt.where(Wallet.customer_id == customer_id)
        count_stmt = count_stmt.where(Wallet.customer_id == customer_id)

    total_result = await db.execute(count_stmt)
    total = total_result.scalar() or 0

    stmt = base_stmt.order_by(Wallet.id.desc()).offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(stmt)
    wallets = result.scalars().all()

    items = []
    for wallet in wallets:
        # Fetch ledger for stats
        ledger_result = await db.execute(
            select(WalletLedgerEntry).where(WalletLedgerEntry.wallet_id == wallet.id)
        )
        ledger = ledger_result.scalars().all()
        items.append(_wallet_to_out(wallet, ledger))

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
    per_page: int = Query(20, ge=1, le=100),
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


class _WalletAdjustRequest:
    amount: float
    entry_type: str
    description: str | None = None


from pydantic import BaseModel, Field


class WalletAdjustRequest(BaseModel):
    amount: float = Field(..., gt=0)
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
    wallet = await _get_wallet_or_404(db, wallet_id)

    # Get current running balance
    result = await db.execute(
        select(WalletLedgerEntry)
        .where(WalletLedgerEntry.wallet_id == wallet_id)
        .order_by(WalletLedgerEntry.id.desc())
        .limit(1)
    )
    last_entry = result.scalar_one_or_none()
    current_balance = float(last_entry.running_balance) if last_entry else 0.0

    if data.entry_type == "debit":
        new_balance = current_balance - data.amount
    else:
        new_balance = current_balance + data.amount

    entry = WalletLedgerEntry(
        wallet_id=wallet_id,
        entry_type=data.entry_type,
        amount=data.amount,
        running_balance=new_balance,
        description=data.description or f"Manual {data.entry_type} by admin {admin.id}",
        reference_type="adjustment",
        reference_id=None,
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return APIResponse(data=WalletLedgerEntryOut.model_validate(entry))


@admin_router.post("/topup", response_model=APIResponse[dict])
async def admin_topup(db: DBDependency, admin: CurrentAdmin, data: dict):
    """Admin wallet top-up by customer_id."""
    customer_id = int(data.get("user_id") or data.get("customer_id", 0))
    amount = float(data.get("amount", 0))
    reason = data.get("reason") or data.get("description") or "Admin top-up"
    if amount <= 0: raise HTTPException(400, "Amount must be positive")

    wallet = await _get_customer_wallet(db, customer_id)
    if not wallet:
        wallet = Wallet(customer_id=customer_id, currency_code="MYR")
        db.add(wallet); await db.flush()

    r = await db.execute(
        select(WalletLedgerEntry)
        .where(WalletLedgerEntry.wallet_id == wallet.id)
        .order_by(WalletLedgerEntry.id.desc())
        .limit(1)
        .with_for_update()
    )
    last = r.scalar_one_or_none()
    new_balance = (float(last.running_balance) if last else 0.0) + amount

    entry = WalletLedgerEntry(wallet_id=wallet.id, entry_type="credit", amount=amount, running_balance=new_balance, description=reason, reference_type="adjustment")
    db.add(entry); await db.commit(); await db.refresh(entry)
    return APIResponse(data={"message": "Top-up complete", "new_balance": new_balance})


@wallet_alias_router.post("/topup", response_model=APIResponse[dict])
async def admin_topup_alias(db: DBDependency, admin: CurrentAdmin, data: dict):
    """Alias for /admin/wallets/topup (matches frontend url)."""
    return await admin_topup(db, admin, data)



@admin_router.post("/deduct", response_model=APIResponse[dict])
async def admin_deduct(db: DBDependency, admin: CurrentAdmin, data: dict):
    """Admin wallet deduction by customer_id."""
    customer_id = int(data.get("user_id") or data.get("customer_id", 0))
    amount = float(data.get("amount", 0))
    reason = data.get("reason") or data.get("description") or "Admin deduction"
    if amount <= 0: raise HTTPException(400, "Amount must be positive")

    wallet = await _get_customer_wallet(db, customer_id)
    if not wallet: raise HTTPException(404, "No wallet found")

    r = await db.execute(
        select(WalletLedgerEntry)
        .where(WalletLedgerEntry.wallet_id == wallet.id)
        .order_by(WalletLedgerEntry.id.desc())
        .limit(1)
        .with_for_update()
    )
    last = r.scalar_one_or_none()
    current = float(last.running_balance) if last else 0.0
    if current < amount: raise HTTPException(400, f"Insufficient balance: {current}")
    new_balance = current - amount

    entry = WalletLedgerEntry(wallet_id=wallet.id, entry_type="debit", amount=amount, running_balance=new_balance, description=reason, reference_type="adjustment")
    db.add(entry); await db.commit(); await db.refresh(entry)
    return APIResponse(data={"message": "Deducted", "new_balance": new_balance})


# ---------------------------------------------------------------------------
# Public endpoints
# ---------------------------------------------------------------------------

@public_router.get("/me", response_model=APIResponse[WalletOut])
async def get_my_wallet(
    customer: ActiveCustomer,
    db: DBDependency,
):
    """Get current customer's wallet. Auto-creates if not found."""
    wallet = await _get_customer_wallet(db, customer.id)
    if wallet is None:
        # Auto-create wallet for existing customers
        wallet = Wallet(
            customer_id=customer.id,
            currency_code="MYR",
        )
        db.add(wallet)
        await db.commit()
        await db.refresh(wallet)
    ledger_result = await db.execute(
        select(WalletLedgerEntry).where(WalletLedgerEntry.wallet_id == wallet.id)
    )
    ledger = ledger_result.scalars().all()
    return APIResponse(data=_wallet_to_out(wallet, ledger))


@public_router.get("/ledger/me", response_model=APIResponse[PaginatedResponse[WalletLedgerEntryOut]])
async def get_my_ledger(
    customer: ActiveCustomer,
    db: DBDependency,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
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


@public_router.post("/topup", response_model=APIResponse[dict])
async def request_topup(
    customer: ActiveCustomer,
    db: DBDependency,
    data: TopUpRequest,
):
    """Request a wallet top-up. Auto-creates wallet if needed."""
    wallet = await _get_customer_wallet(db, customer.id)
    if wallet is None:
        wallet = Wallet(
            customer_id=customer.id,
            currency_code="MYR",
        )
        db.add(wallet)
        await db.commit()
        await db.refresh(wallet)
    # In a real implementation this would create a payment intent.
    return APIResponse(
        data={
            "status": "pending",
            "amount": data.amount,
            "payment_method_id": data.payment_method_id,
            "wallet_id": wallet.id,
        }
    )
