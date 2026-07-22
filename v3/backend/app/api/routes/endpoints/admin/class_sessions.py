"""Admin endpoints for managing class sessions (experience/workshop capacity)."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.api.routes.deps import CurrentAdmin, DBDependency
from app.models.class_session import ClassSession
from app.models.menu import MenuItem
from app.schemas.base import APIResponse
from app.schemas.class_session import ClassSessionCreate, ClassSessionOut, ClassSessionUpdate

router = APIRouter(tags=["admin — class sessions"])


async def _get_item_or_404(db: DBDependency, item_id: int) -> MenuItem:
    result = await db.execute(
        select(MenuItem).where(MenuItem.id == item_id, MenuItem.deleted_at.is_(None))
    )
    item = result.scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=404, detail="Menu item not found")
    return item


async def _get_session_or_404(db: DBDependency, session_id: int) -> ClassSession:
    result = await db.execute(
        select(ClassSession).where(ClassSession.id == session_id)
    )
    sess = result.scalar_one_or_none()
    if sess is None:
        raise HTTPException(status_code=404, detail="Class session not found")
    return sess


@router.get("/menu/items/{item_id}/sessions", response_model=APIResponse[list[ClassSessionOut]])
async def list_sessions(admin: CurrentAdmin, db: DBDependency, item_id: int):
    await _get_item_or_404(db, item_id)
    result = await db.execute(
        select(ClassSession)
        .where(ClassSession.menu_item_id == item_id)
        .order_by(ClassSession.session_date.desc(), ClassSession.start_time.desc())
    )
    return APIResponse(data=list(result.scalars().all()))


@router.post("/menu/items/{item_id}/sessions", response_model=APIResponse[ClassSessionOut], status_code=status.HTTP_201_CREATED)
async def create_session(admin: CurrentAdmin, db: DBDependency, item_id: int, data: ClassSessionCreate):
    await _get_item_or_404(db, item_id)
    sess = ClassSession(menu_item_id=item_id, **data.model_dump())
    db.add(sess)
    await db.commit()
    await db.refresh(sess)
    return APIResponse(data=sess)


@router.put("/class-sessions/{session_id}", response_model=APIResponse[ClassSessionOut])
async def update_session(admin: CurrentAdmin, db: DBDependency, session_id: int, data: ClassSessionUpdate):
    sess = await _get_session_or_404(db, session_id)
    updates = data.model_dump(exclude_unset=True)
    new_capacity = updates.get("capacity")
    if new_capacity is not None and new_capacity < sess.booked_pax:
        raise HTTPException(
            status_code=400,
            detail=f"Capacity cannot be below booked seats ({sess.booked_pax})",
        )
    for key, value in updates.items():
        setattr(sess, key, value)
    sess.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(sess)
    return APIResponse(data=sess)


@router.delete("/class-sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session(admin: CurrentAdmin, db: DBDependency, session_id: int):
    sess = await _get_session_or_404(db, session_id)
    if sess.booked_pax > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete a session with {sess.booked_pax} booked seat(s) — deactivate it instead",
        )
    await db.delete(sess)
    await db.commit()
