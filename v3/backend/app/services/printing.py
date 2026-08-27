"""Print job queue service — provider-agnostic receipt/drawer dispatch.

The queue is the stable layer: jobs are document bodies addressed to a
per-printer token. Star CloudPRNT (app/api/routes/endpoints/print_cloudprnt.py)
is the first transport; Epson Server Direct Print can poll the same queue
later without touching job storage.

Printer registry lives in store_configuration under the key
``print.printers`` as a JSON list: [{name, token, active, last_seen}].
Platform-wide switches (PlatformConfigService):
- ``print.auto_receipt``   (default true) — receipt job on payment capture
- ``print.drawer_on_cash`` (default true) — drawer-kick job on cash capture
"""

import logging
import secrets
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.order import Order, OrderLineItem
from app.models.menu import MenuModifierOption
from app.models.payment import Payment
from app.models.print_job import PrintJob
from app.models.store import Store, StoreConfiguration
from app.services.platform_config import PlatformConfigService
from app.services.receipt import CONTENT_TYPE, compose_drawer_kick, compose_receipt

logger = logging.getLogger(__name__)

PRINTERS_CONFIG_KEY = "print.printers"

# Media types advertised in CloudPRNT poll responses. Jobs are composed as
# Star markup; application/vnd.star.line is listed so line-mode-only firmware
# still negotiates (markup is plain UTF-8 text, printable as-is).
MEDIA_TYPES = ["application/vnd.star.line", "text/vnd.star.markup"]

# A failed delivery is requeued until this many failed ACKs, then 'failed'.
MAX_ATTEMPTS = 5


class PrintError(Exception):
    """Print pipeline error."""

    def __init__(self, message: str, status_code: int = 400):
        self.message = message
        self.status_code = status_code
        super().__init__(message)


# ---------------------------------------------------------------------------
# Printer registry (store_configuration JSON)
# ---------------------------------------------------------------------------


def _normalize_printers(value) -> tuple[list[dict], bool]:
    """Return (printers, wrapped) — wrapped=True when stored as {"printers": [...]}."""
    wrapped = isinstance(value, dict)
    if wrapped:
        value = value.get("printers")
    if not isinstance(value, list):
        return [], wrapped
    return [p for p in value if isinstance(p, dict) and p.get("token")], wrapped


def _serialize_printers(printers: list[dict], wrapped: bool):
    return {"printers": printers} if wrapped else printers


async def _get_registry_row(db: AsyncSession, store_id: int) -> StoreConfiguration | None:
    result = await db.execute(
        select(StoreConfiguration).where(
            StoreConfiguration.store_id == store_id,
            StoreConfiguration.config_key == PRINTERS_CONFIG_KEY,
        )
    )
    return result.scalar_one_or_none()


async def get_store_printers(db: AsyncSession, store_id: int, active_only: bool = False) -> list[dict]:
    row = await _get_registry_row(db, store_id)
    if row is None:
        return []
    printers, _ = _normalize_printers(row.config_value)
    if active_only:
        printers = [p for p in printers if p.get("active", True)]
    return printers


async def add_store_printer(db: AsyncSession, store_id: int, name: str) -> dict:
    """Register a printer for a store and return its entry with a fresh token."""
    name = (name or "").strip()
    if not name:
        raise PrintError("Printer name is required", 400)
    row = await _get_registry_row(db, store_id)
    wrapped = False
    printers: list[dict] = []
    if row is not None:
        printers, wrapped = _normalize_printers(row.config_value)
    if any(p.get("name") == name for p in printers):
        raise PrintError(f"A printer named '{name}' already exists for this store", 409)
    entry = {
        "name": name,
        "token": secrets.token_hex(16),
        "active": True,
        "last_seen": None,
    }
    printers.append(entry)
    if row is None:
        row = StoreConfiguration(
            store_id=store_id,
            config_key=PRINTERS_CONFIG_KEY,
            config_value=_serialize_printers(printers, wrapped),
            description="Receipt/kitchen printers (CloudPRNT pairing tokens)",
        )
        db.add(row)
    else:
        row.config_value = _serialize_printers(printers, wrapped)
    await db.flush()
    return entry


async def update_store_printer(
    db: AsyncSession,
    store_id: int,
    token: str,
    *,
    name: str | None = None,
    active: bool | None = None,
) -> dict | None:
    """Rename / enable / disable a registered printer. None when not found."""
    row = await _get_registry_row(db, store_id)
    if row is None:
        return None
    printers, wrapped = _normalize_printers(row.config_value)
    entry = next((p for p in printers if p.get("token") == token), None)
    if entry is None:
        return None
    if name is not None:
        entry["name"] = name.strip() or entry["name"]
    if active is not None:
        entry["active"] = bool(active)
    row.config_value = _serialize_printers(printers, wrapped)
    await db.flush()
    return entry


async def find_printer_by_token(db: AsyncSession, token: str) -> dict | None:
    """Resolve a CloudPRNT pairing token to its registry entry (+store_id).

    The registry is JSON, so this scans the few store_configuration rows —
    trivially cheap at outlet counts (~20 stores).
    """
    result = await db.execute(
        select(StoreConfiguration).where(StoreConfiguration.config_key == PRINTERS_CONFIG_KEY)
    )
    for row in result.scalars().all():
        printers, _ = _normalize_printers(row.config_value)
        for entry in printers:
            if entry.get("token") == token:
                return {**entry, "store_id": row.store_id, "_row_id": row.id}
    return None


async def touch_printer_last_seen(db: AsyncSession, token: str) -> None:
    """Record that a printer just polled (throttled to one write per minute)."""
    found = await find_printer_by_token(db, token)
    if not found:
        return
    last_seen = found.get("last_seen")
    if last_seen:
        try:
            seen_at = datetime.fromisoformat(str(last_seen))
            if seen_at.tzinfo is None:
                seen_at = seen_at.replace(tzinfo=timezone.utc)
            if (datetime.now(timezone.utc) - seen_at).total_seconds() < 60:
                return
        except ValueError:
            pass
    row = await db.get(StoreConfiguration, found["_row_id"])
    if row is None:
        return
    printers, wrapped = _normalize_printers(row.config_value)
    for entry in printers:
        if entry.get("token") == token:
            entry["last_seen"] = datetime.now(timezone.utc).isoformat()
    row.config_value = _serialize_printers(printers, wrapped)
    await db.flush()


async def printer_statuses(db: AsyncSession, store_id: int) -> list[dict]:
    """Registry entries annotated with last-seen and latest job state."""
    printers = await get_store_printers(db, store_id)
    result: list[dict] = []
    for entry in printers:
        last_job = (
            await db.execute(
                select(PrintJob)
                .where(PrintJob.printer_token == entry["token"])
                .order_by(PrintJob.id.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        result.append(
            {
                "name": entry.get("name"),
                "token": entry.get("token"),
                "active": entry.get("active", True),
                "last_seen": entry.get("last_seen"),
                "last_job": (
                    {
                        "id": last_job.id,
                        "type": last_job.type,
                        "status": last_job.status,
                        "created_at": last_job.created_at.isoformat() if last_job.created_at else None,
                        "printed_at": last_job.printed_at.isoformat() if last_job.printed_at else None,
                        "error": last_job.error,
                    }
                    if last_job
                    else None
                ),
            }
        )
    return result


# ---------------------------------------------------------------------------
# Job queue
# ---------------------------------------------------------------------------


async def enqueue_job(
    db: AsyncSession,
    *,
    store_id: int,
    printer_token: str,
    job_type: str,
    payload: str,
    content_type: str = CONTENT_TYPE,
    order_id: int | None = None,
) -> PrintJob:
    """Append a job to a printer's queue. Caller commits."""
    job = PrintJob(
        store_id=store_id,
        printer_token=printer_token,
        type=job_type,
        status="queued",
        payload=payload,
        content_type=content_type,
        order_id=order_id,
        attempts=0,
    )
    db.add(job)
    await db.flush()
    return job


async def enqueue_to_store_printers(
    db: AsyncSession,
    store_id: int,
    job_type: str,
    payload: str,
    *,
    content_type: str = CONTENT_TYPE,
    order_id: int | None = None,
) -> list[PrintJob]:
    """Enqueue a job for every active printer of a store. Caller commits."""
    jobs: list[PrintJob] = []
    for printer in await get_store_printers(db, store_id, active_only=True):
        jobs.append(
            await enqueue_job(
                db,
                store_id=store_id,
                printer_token=printer["token"],
                job_type=job_type,
                payload=payload,
                content_type=content_type,
                order_id=order_id,
            )
        )
    return jobs


async def next_queued_job(db: AsyncSession, printer_token: str) -> PrintJob | None:
    """Oldest queued job for a printer (what the next poll should offer)."""
    result = await db.execute(
        select(PrintJob)
        .where(PrintJob.printer_token == printer_token, PrintJob.status == "queued")
        .order_by(PrintJob.id.asc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def get_queued_job(db: AsyncSession, printer_token: str, job_id: int) -> PrintJob | None:
    """Fetch a queued job by id, scoped to the polling printer's token."""
    result = await db.execute(
        select(PrintJob).where(
            PrintJob.id == job_id,
            PrintJob.printer_token == printer_token,
            PrintJob.status == "queued",
        )
    )
    return result.scalar_one_or_none()


async def confirm_job(
    db: AsyncSession,
    printer_token: str,
    job_id: int,
    code: str | None,
) -> PrintJob | None:
    """Apply a printer ACK (CloudPRNT DELETE). Caller commits.

    code starting with "2" (e.g. "200 OK") means printed; anything else is a
    delivery failure — attempts+1, requeued until MAX_ATTEMPTS then 'failed'.
    Double-ACKs are idempotent (jobs already printed/failed pass through).
    """
    result = await db.execute(
        select(PrintJob)
        .where(PrintJob.id == job_id, PrintJob.printer_token == printer_token)
        .with_for_update()
    )
    job = result.scalar_one_or_none()
    if job is None or job.status != "queued":
        return job

    if (code or "").strip().startswith("2"):
        job.status = "printed"
        job.printed_at = datetime.now(timezone.utc)
        job.error = None
    else:
        job.attempts = (job.attempts or 0) + 1
        job.error = (code or "unknown printer error")[:500]
        if job.attempts >= MAX_ATTEMPTS:
            job.status = "failed"
    await db.flush()
    return job


# ---------------------------------------------------------------------------
# Receipt building + automatic dispatch on payment capture
# ---------------------------------------------------------------------------


async def _payment_method_label(db: AsyncSession, order: Order, payment: Payment | None) -> str:
    from app.services.receipt import _payment_label

    if payment is None:
        payment = (
            await db.execute(
                select(Payment)
                .where(
                    Payment.order_id == order.id,
                    Payment.status.in_(("captured", "partially_refunded", "refunded")),
                )
                .order_by(Payment.id.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
    if payment is None:
        return ""
    return _payment_label(payment.provider, payment.payment_method_type)


async def build_receipt_payload(
    db: AsyncSession,
    order: Order,
    *,
    include_drawer: bool = False,
    reprint: bool = False,
    payment: Payment | None = None,
) -> str:
    """Compose the Star markup receipt document for an order."""
    store = await db.get(Store, order.store_id)
    lines = (
        await db.execute(
            select(OrderLineItem).where(OrderLineItem.order_id == order.id)
        )
    ).scalars().all()

    modifier_ids: set[int] = set()
    for li in lines:
        modifier_ids.update((li.selected_modifiers or {}).get("modifier_ids") or [])
    modifier_options: dict = {}
    if modifier_ids:
        opts = (
            await db.execute(
                select(MenuModifierOption).where(MenuModifierOption.id.in_(modifier_ids))
            )
        ).scalars().all()
        modifier_options = {o.id: o for o in opts}

    method_label = await _payment_method_label(db, order, payment)

    # dining_table is lazy-loaded elsewhere via relationship; avoid a lazy
    # load in async context by resolving the table number explicitly.
    table_number = None
    if getattr(order, "dining_table_id", None):
        from app.models.store import DiningTable

        table = await db.get(DiningTable, order.dining_table_id)
        table_number = table.table_number if table else None

    order_view = order
    if table_number:
        # compose_receipt reads a plain attribute; attach without touching the ORM
        order_view = _OrderView(order, table_number)

    return compose_receipt(
        order_view,
        store,
        lines,
        modifier_options,
        payment_method=method_label,
        include_drawer=include_drawer,
        reprint=reprint,
    )


class _OrderView:
    """Duck-typed Order wrapper adding display-only fields (table_number)."""

    def __init__(self, order: Order, table_number: str):
        self._order = order
        self.table_number = table_number

    def __getattr__(self, name):
        return getattr(self._order, name)


async def auto_print_on_payment(db: AsyncSession, order: Order, payment: Payment | None) -> None:
    """Fire-and-forget receipt/drawer dispatch after a captured payment.

    Mirrors auto_issue_on_payment (einvoice): self-gated on print.* config,
    idempotent per order (one auto receipt / one auto drawer-kick), and every
    failure is logged and swallowed so the payment flow is never affected.
    """
    try:
        if payment is None or payment.status not in ("captured", "partially_refunded"):
            return
        if order is None or order.deleted_at is not None:
            return
        # Only dispatch once the order is fully paid — a receipt for the first
        # share of a split bill would show money not yet collected.
        if order.payment_status not in ("captured", "settled"):
            return

        config = PlatformConfigService(db)
        printers = await get_store_printers(db, order.store_id, active_only=True)
        if not printers:
            return

        is_cash = payment.provider == "cash"
        auto_receipt = await config.get_bool("print.auto_receipt", default=True)
        drawer_on_cash = await config.get_bool("print.drawer_on_cash", default=True)

        enqueued = 0
        if auto_receipt:
            existing = (
                await db.execute(
                    select(PrintJob.id).where(
                        PrintJob.order_id == order.id, PrintJob.type == "receipt"
                    ).limit(1)
                )
            ).scalar_one_or_none()
            if existing is None:
                body = await build_receipt_payload(db, order, payment=payment)
                enqueued += len(
                    await enqueue_to_store_printers(db, order.store_id, "receipt", body, order_id=order.id)
                )

        if is_cash and drawer_on_cash:
            existing = (
                await db.execute(
                    select(PrintJob.id).where(
                        PrintJob.order_id == order.id, PrintJob.type == "drawer_kick"
                    ).limit(1)
                )
            ).scalar_one_or_none()
            if existing is None:
                enqueued += len(
                    await enqueue_to_store_printers(
                        db, order.store_id, "drawer_kick", compose_drawer_kick(), order_id=order.id
                    )
                )

        if enqueued:
            await db.commit()
            logger.info(
                "Auto print: %s job(s) enqueued for order %s (cash=%s)",
                enqueued,
                order.id,
                is_cash,
            )
    except Exception:
        logger.exception("Auto print dispatch failed for order %s", getattr(order, "id", None))
