"""Admin POS management endpoints."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import CurrentAdmin, DBDependency
from app.models.pos import OrderModificationLog, PosSession, PosTerminal
from app.schemas.base import APIResponse
from app.schemas.pos import (
    OrderModificationLogCreate,
    OrderModificationLogOut,
    PosSessionClose,
    PosSessionCreate,
    PosSessionOut,
    PosTerminalCreate,
    PosTerminalOut,
    PosTerminalUpdate,
)

router = APIRouter(prefix="/admin/pos", tags=["admin — pos"])


# ---------------------------------------------------------------------------
# Terminals
# ---------------------------------------------------------------------------

@router.get("/terminals", response_model=APIResponse)
async def list_terminals(
    db: DBDependency,
    admin: CurrentAdmin,
    store_id: int | None = Query(None),
):
    q = select(PosTerminal)
    if store_id:
        q = q.where(PosTerminal.store_id == store_id)
    q = q.order_by(PosTerminal.display_order.asc() if hasattr(PosTerminal, "display_order") else PosTerminal.name.asc())
    result = await db.execute(q)
    items = result.scalars().all()
    return APIResponse(data=[PosTerminalOut.model_validate(t) for t in items])


@router.post("/terminals", response_model=APIResponse, status_code=status.HTTP_201_CREATED)
async def create_terminal(
    payload: PosTerminalCreate,
    db: DBDependency,
    admin: CurrentAdmin,
):
    existing = await db.execute(select(PosTerminal).where(PosTerminal.terminal_code == payload.terminal_code))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Terminal code already exists")
    terminal = PosTerminal(**payload.model_dump())
    db.add(terminal)
    await db.commit()
    await db.refresh(terminal)
    return APIResponse(data=PosTerminalOut.model_validate(terminal))


@router.patch("/terminals/{terminal_id}", response_model=APIResponse)
async def update_terminal(
    terminal_id: int,
    payload: PosTerminalUpdate,
    db: DBDependency,
    admin: CurrentAdmin,
):
    terminal = await db.get(PosTerminal, terminal_id)
    if not terminal:
        raise HTTPException(status_code=404, detail="Terminal not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(terminal, field, value)
    await db.commit()
    await db.refresh(terminal)
    return APIResponse(data=PosTerminalOut.model_validate(terminal))


@router.delete("/terminals/{terminal_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_terminal(
    terminal_id: int,
    db: DBDependency,
    admin: CurrentAdmin,
):
    terminal = await db.get(PosTerminal, terminal_id)
    if not terminal:
        raise HTTPException(status_code=404, detail="Terminal not found")
    await db.delete(terminal)
    await db.commit()
    return None


# ---------------------------------------------------------------------------
# Sessions
# ---------------------------------------------------------------------------

@router.get("/sessions", response_model=APIResponse)
async def list_sessions(
    db: DBDependency,
    admin: CurrentAdmin,
    terminal_id: int | None = Query(None),
    staff_id: int | None = Query(None),
    status: str | None = Query(None),
):
    q = select(PosSession)
    if terminal_id:
        q = q.where(PosSession.terminal_id == terminal_id)
    if staff_id:
        q = q.where(PosSession.staff_id == staff_id)
    if status:
        q = q.where(PosSession.status == status)
    q = q.order_by(PosSession.opened_at.desc())
    result = await db.execute(q)
    items = result.scalars().all()
    return APIResponse(data=[PosSessionOut.model_validate(s) for s in items])


@router.post("/sessions", response_model=APIResponse, status_code=status.HTTP_201_CREATED)
async def open_session(
    payload: PosSessionCreate,
    db: DBDependency,
    admin: CurrentAdmin,
):
    # Close any existing open session for this terminal
    open_q = select(PosSession).where(
        PosSession.terminal_id == payload.terminal_id,
        PosSession.status == "open",
    )
    open_result = await db.execute(open_q)
    for existing in open_result.scalars().all():
        existing.status = "closed"
        existing.closed_at = datetime.now(timezone.utc)

    session = PosSession(**payload.model_dump())
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return APIResponse(data=PosSessionOut.model_validate(session))


@router.post("/sessions/{session_id}/close", response_model=APIResponse)
async def close_session(
    session_id: int,
    payload: PosSessionClose,
    db: DBDependency,
    admin: CurrentAdmin,
):
    session = await db.get(PosSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.status != "open":
        raise HTTPException(status_code=400, detail="Session is not open")

    session.status = "closed"
    session.closed_at = datetime.now(timezone.utc)
    session.closing_cash = payload.closing_cash
    session.expected_cash = session.opening_cash + session.total_sales_cash
    session.discrepancy = (payload.closing_cash or 0) - (session.expected_cash or 0)
    session.discrepancy_notes = payload.discrepancy_notes

    await db.commit()
    await db.refresh(session)
    return APIResponse(data=PosSessionOut.model_validate(session))


# ---------------------------------------------------------------------------
# Order Modifications
# ---------------------------------------------------------------------------

@router.get("/order-modifications", response_model=APIResponse)
async def list_modifications(
    db: DBDependency,
    admin: CurrentAdmin,
    order_id: int | None = Query(None),
    staff_id: int | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    q = select(OrderModificationLog)
    if order_id:
        q = q.where(OrderModificationLog.order_id == order_id)
    if staff_id:
        q = q.where(OrderModificationLog.staff_id == staff_id)
    q = q.order_by(OrderModificationLog.created_at.desc()).limit(limit).offset(offset)
    result = await db.execute(q)
    items = result.scalars().all()
    return APIResponse(data=[OrderModificationLogOut.model_validate(m) for m in items])


@router.post("/order-modifications", response_model=APIResponse, status_code=status.HTTP_201_CREATED)
async def create_modification(
    payload: OrderModificationLogCreate,
    db: DBDependency,
    admin: CurrentAdmin,
):
    log = OrderModificationLog(**payload.model_dump(), staff_id=admin.id)
    db.add(log)
    await db.commit()
    await db.refresh(log)
    return APIResponse(data=OrderModificationLogOut.model_validate(log))
