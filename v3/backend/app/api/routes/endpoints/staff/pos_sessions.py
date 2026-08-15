"""Staff POS cash-drawer session endpoints (open float / live Z / close)."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select

from app.api.routes.deps import DBDependency, RequireStaffRole
from app.models.pos import PosSession, PosTerminal
from app.models.staff import StaffProfile
from app.schemas.base import APIResponse, Money
from app.schemas.pos import PosSessionClose, PosSessionOut
from app.services.pos_session import close_session_with_report, compute_session_report
from pydantic import BaseModel as PydanticBase, Field

router = APIRouter(prefix="/staff/pos/session", tags=["staff — pos session"])

_DRAWER_ROLES = ("cashier", "shift_supervisor", "store_manager")


class PosSessionOpenIn(PydanticBase):
    opening_cash: Money = Field(..., ge=0)


def _session_json(session: PosSession, report: dict | None = None) -> dict:
    out = PosSessionOut.model_validate(session).model_dump(mode="json")
    out["live"] = report or None
    return out


async def _open_session_for_store(db, store_id: int) -> PosSession | None:
    """The single open drawer session for a store (any of its terminals)."""
    result = await db.execute(
        select(PosSession)
        .join(PosTerminal, PosTerminal.id == PosSession.terminal_id)
        .where(PosTerminal.store_id == store_id, PosSession.status == "open")
        .order_by(PosSession.opened_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def _default_terminal(db, store_id: int) -> PosTerminal:
    result = await db.execute(
        select(PosTerminal)
        .where(PosTerminal.store_id == store_id, PosTerminal.is_active.is_(True))
        .order_by(PosTerminal.id)
        .limit(1)
    )
    terminal = result.scalar_one_or_none()
    if terminal is None:
        raise HTTPException(status_code=400, detail="No active POS terminal configured for this store")
    return terminal


@router.get("/current", response_model=APIResponse[dict])
async def get_current_session(
    staff: Annotated[StaffProfile, Depends(RequireStaffRole(*_DRAWER_ROLES, "server"))],
    db: DBDependency,
):
    """The store's open drawer session + live Z-report figures (null when closed)."""
    session = await _open_session_for_store(db, staff.store_id)
    if session is None:
        return APIResponse(data={"session": None})
    report = await compute_session_report(db, session, staff.store_id)
    for k, v in report.items():
        if hasattr(v, "isoformat"):
            report[k] = v.isoformat()
        elif hasattr(v, "quantize"):
            report[k] = str(v)
    return APIResponse(data={"session": _session_json(session, report)})


@router.post("/open", response_model=APIResponse[dict], status_code=status.HTTP_201_CREATED)
async def open_session(
    staff: Annotated[StaffProfile, Depends(RequireStaffRole(*_DRAWER_ROLES))],
    db: DBDependency,
    data: PosSessionOpenIn,
):
    """Open the store drawer with a starting float. One open session per store."""
    # Serialize opens per store — the check-then-insert below races otherwise
    # (same advisory-lock pattern as the lucky-draw free-spin guard).
    await db.execute(select(func.pg_advisory_xact_lock(91000000 + staff.store_id)))
    existing = await _open_session_for_store(db, staff.store_id)
    if existing is not None:
        raise HTTPException(
            status_code=409,
            detail=f"Drawer already open (session #{existing.id}, opened {existing.opened_at:%Y-%m-%d %H:%M})",
        )
    terminal = await _default_terminal(db, staff.store_id)
    session = PosSession(
        terminal_id=terminal.id,
        staff_id=staff.id,
        status="open",
        opening_cash=data.opening_cash,
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return APIResponse(data={"session": _session_json(session)})


@router.post("/close", response_model=APIResponse[dict])
async def close_session(
    staff: Annotated[StaffProfile, Depends(RequireStaffRole(*_DRAWER_ROLES))],
    db: DBDependency,
    data: PosSessionClose,
):
    """Close the store drawer: counts cash, computes expected + variance (Z-report)."""
    session = await _open_session_for_store(db, staff.store_id)
    if session is None:
        raise HTTPException(status_code=404, detail="No open drawer session for this store")
    # Lock the session row — concurrent closes would silently overwrite each other.
    session = (
        await db.execute(
            select(PosSession).where(PosSession.id == session.id).with_for_update()
        )
    ).scalar_one()
    if session.status != "open":
        raise HTTPException(status_code=409, detail="Drawer session is already closed")
    await close_session_with_report(db, session, staff.store_id, data.closing_cash, data.discrepancy_notes)
    await db.commit()
    await db.refresh(session)
    return APIResponse(data={"session": _session_json(session)})
