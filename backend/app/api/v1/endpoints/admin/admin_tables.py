import secrets
import io
from datetime import timezone, datetime
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

import qrcode

from app.core.database import get_db
from app.core.security import require_store_access
from app.core.audit import log_action, get_client_ip
from app.models.admin_user import AdminUser
from app.models.store import Store, StoreTable
from app.schemas.store import TableCreate, TableUpdate

router = APIRouter(prefix="/admin", tags=["Admin"])


def _generate_qr_token() -> str:
    return secrets.token_urlsafe(32)


def _generate_qr_image_url(slug: str, table_id: int, token: str) -> str:
    return f"https://app.loyaltysystem.uk?store={slug}&table={table_id}&t={token}"


def _make_qr_png(data: str, size: int = 10) -> io.BytesIO:
    qr = qrcode.QRCode(version=1, error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=size, border=2)
    qr.add_data(data)
    qr.make(fit=True)
    img = qr.make_image(fill_color="#2D3B2D", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return buf


@router.post("/stores/{store_id}/tables", status_code=201)
async def create_table(
    store_id: int,
    request: Request,
    req: TableCreate,
    user: AdminUser = Depends(require_store_access("store_id")),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(
        select(StoreTable).where(
            StoreTable.store_id == store_id,
            StoreTable.table_number == req.table_number,
            StoreTable.is_active == True,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"Table '{req.table_number}' already exists in this store")
    table = StoreTable(store_id=store_id, table_number=req.table_number, capacity=req.capacity)
    db.add(table)
    await db.flush()
    ip = get_client_ip(request)
    await log_action(db, action="CREATE_TABLE", user_id=user.id, store_id=store_id, entity_type="store_table", entity_id=table.id, details={"table_number": table.table_number}, ip_address=ip)
    return {
        "id": table.id,
        "table_number": table.table_number,
        "capacity": table.capacity,
        "qr_code_url": None,
        "qr_generated_at": None,
        "message": "Table created. Generate QR code to activate for dine-in.",
    }


@router.put("/stores/{store_id}/tables/{table_id}")
async def update_table(
    store_id: int, table_id: int,
    request: Request,
    req: TableUpdate,
    user: AdminUser = Depends(require_store_access("store_id")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(StoreTable).where(StoreTable.id == table_id, StoreTable.store_id == store_id))
    table = result.scalar_one_or_none()
    if not table:
        raise HTTPException(404, "Table not found")
    if req.table_number is not None:
        existing = await db.execute(
            select(StoreTable).where(
                StoreTable.store_id == store_id,
                StoreTable.table_number == req.table_number,
                StoreTable.id != table_id,
                StoreTable.is_active == True,
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail=f"Table '{req.table_number}' already exists in this store")
        table.table_number = req.table_number
    if req.capacity is not None:
        table.capacity = req.capacity
    if req.is_active is not None:
        table.is_active = req.is_active
    ip = get_client_ip(request)
    await log_action(db, action="UPDATE_TABLE", user_id=user.id, store_id=store_id, entity_type="store_table", entity_id=table_id, ip_address=ip)
    return {"id": table.id, "table_number": table.table_number, "capacity": table.capacity, "is_active": table.is_active}


@router.delete("/stores/{store_id}/tables/{table_id}")
async def delete_table(
    store_id: int, table_id: int,
    request: Request,
    user: AdminUser = Depends(require_store_access("store_id")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(StoreTable).where(StoreTable.id == table_id, StoreTable.store_id == store_id))
    table = result.scalar_one_or_none()
    if not table:
        raise HTTPException(404, "Table not found")
    table.is_active = False
    ip = get_client_ip(request)
    await log_action(db, action="DELETE_TABLE", user_id=user.id, store_id=store_id, entity_type="store_table", entity_id=table_id, details={"table_number": table.table_number}, ip_address=ip)
    return {"message": "Table deactivated", "id": table_id}


@router.get("/stores/{store_id}/tables/{table_id}/qr-image")
async def get_table_qr_image(
    store_id: int, table_id: int,
    user: AdminUser = Depends(require_store_access("store_id")),
    db: AsyncSession = Depends(get_db),
):
    """Serve the QR code as a PNG image for display/download."""
    result = await db.execute(select(StoreTable).where(StoreTable.id == table_id, StoreTable.store_id == store_id))
    table = result.scalar_one_or_none()
    if not table or not table.qr_code_url:
        raise HTTPException(404, "Table or QR code not found")
    buf = _make_qr_png(table.qr_code_url)
    return StreamingResponse(buf, media_type="image/png", headers={
        "Content-Disposition": f'inline; filename="table-{table.table_number}-qr.png"',
    })


@router.post("/stores/{store_id}/tables/{table_id}/generate-qr")
async def generate_table_qr(
    store_id: int, table_id: int,
    request: Request,
    user: AdminUser = Depends(require_store_access("store_id")),
    db: AsyncSession = Depends(get_db),
):
    """Regenerate QR code with a new security token. Old QR codes become invalid."""
    result = await db.execute(select(StoreTable).where(StoreTable.id == table_id, StoreTable.store_id == store_id))
    table = result.scalar_one_or_none()
    if not table:
        raise HTTPException(404, "Table not found")

    store_result = await db.execute(select(Store).where(Store.id == store_id))
    store = store_result.scalar_one_or_none()
    slug = store.slug if store else str(store_id)

    new_token = _generate_qr_token()
    table.qr_token = new_token
    table.qr_code_url = _generate_qr_image_url(slug, table.id, new_token)
    table.qr_generated_at = datetime.now(timezone.utc)

    ip = get_client_ip(request)
    await log_action(db, action="GENERATE_QR", user_id=user.id, store_id=store_id, entity_type="store_table", entity_id=table_id, details={"table_number": table.table_number}, ip_address=ip)

    return {
        "id": table.id,
        "table_number": table.table_number,
        "qr_code_url": table.qr_code_url,
        "qr_generated_at": table.qr_generated_at,
        "message": "QR code generated. Print and place on the table.",
    }
