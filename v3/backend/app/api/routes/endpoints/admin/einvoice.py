"""Admin LHDN MyInvois e-invoice endpoints."""

from datetime import datetime

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select

from app.api.routes.deps import CurrentAdmin, DBDependency
from app.models.einvoice import EinvoiceDocument
from app.models.order import Order
from app.models.payment import Payment
from app.models.platform import AuditLog
from app.schemas.base import APIResponse, PaginatedResponse
from app.services.einvoice import _submit, issue_einvoice

router = APIRouter(prefix="/admin/einvoice", tags=["admin — einvoice"])

# Submission statuses from which a retry is allowed.
RETRIABLE_STATUSES = ("failed", "rejected", "pending")


def _doc_dict(doc: EinvoiceDocument, order_number: str | None = None, include_ubl: bool = False) -> dict:
    data = {
        "id": doc.id,
        "order_id": doc.order_id,
        "order_number": order_number,
        "payment_id": doc.payment_id,
        "store_id": doc.store_id,
        "document_type": doc.document_type,
        "code_number": doc.code_number,
        "status": doc.status,
        "myinvois_uuid": doc.myinvois_uuid,
        "submission_uid": doc.submission_uid,
        "validation_link": doc.validation_link,
        "error_message": doc.error_message,
        "submitted_at": doc.submitted_at.isoformat() if doc.submitted_at else None,
        "created_at": doc.created_at.isoformat() if doc.created_at else None,
        "updated_at": doc.updated_at.isoformat() if doc.updated_at else None,
    }
    if include_ubl:
        data["ubl_document"] = doc.ubl_document
    return data


@router.get("/documents", response_model=APIResponse[PaginatedResponse[dict]])
async def list_einvoice_documents(
    db: DBDependency,
    admin: CurrentAdmin,
    store_id: int | None = Query(None),
    status_filter: str | None = Query(None, alias="status"),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    order_id: int | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=200),
):
    """List e-invoice documents with pagination and filters."""
    base = select(EinvoiceDocument)
    cnt = select(func.count(EinvoiceDocument.id))
    if store_id is not None:
        base = base.where(EinvoiceDocument.store_id == store_id)
        cnt = cnt.where(EinvoiceDocument.store_id == store_id)
    if status_filter:
        base = base.where(EinvoiceDocument.status == status_filter)
        cnt = cnt.where(EinvoiceDocument.status == status_filter)
    if order_id is not None:
        base = base.where(EinvoiceDocument.order_id == order_id)
        cnt = cnt.where(EinvoiceDocument.order_id == order_id)
    if date_from:
        try:
            dfrom = datetime.fromisoformat(date_from)
            base = base.where(EinvoiceDocument.created_at >= dfrom)
            cnt = cnt.where(EinvoiceDocument.created_at >= dfrom)
        except ValueError:
            pass
    if date_to:
        try:
            dto = datetime.fromisoformat(date_to)
            base = base.where(EinvoiceDocument.created_at <= dto)
            cnt = cnt.where(EinvoiceDocument.created_at <= dto)
        except ValueError:
            pass

    total = (await db.execute(cnt)).scalar() or 0
    result = await db.execute(
        base.order_by(EinvoiceDocument.id.desc()).offset((page - 1) * per_page).limit(per_page)
    )
    docs = result.scalars().all()

    # Batched order_number enrichment (one query for the whole page)
    order_ids = {d.order_id for d in docs}
    order_map: dict[int, str] = {}
    if order_ids:
        rows = await db.execute(select(Order.id, Order.order_number).where(Order.id.in_(order_ids)))
        order_map = {oid: onum for oid, onum in rows.all()}

    items = [_doc_dict(d, order_map.get(d.order_id)) for d in docs]
    return APIResponse(data=PaginatedResponse(
        items=items,
        total=total,
        page=page,
        per_page=per_page,
        total_pages=(total + per_page - 1) // per_page if per_page else 0,
    ))


@router.get("/documents/{doc_id}", response_model=APIResponse[dict])
async def get_einvoice_document(
    doc_id: int,
    db: DBDependency,
    admin: CurrentAdmin,
):
    """Full e-invoice document row, including the generated UBL JSON."""
    doc = await db.get(EinvoiceDocument, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="E-invoice document not found")
    order = await db.get(Order, doc.order_id)
    return APIResponse(data=_doc_dict(doc, order.order_number if order else None, include_ubl=True))


@router.post("/documents/{doc_id}/retry", response_model=APIResponse[dict])
async def retry_einvoice_document(
    doc_id: int,
    db: DBDependency,
    admin: CurrentAdmin,
):
    """Re-submit a failed/rejected/pending document to MyInvois."""
    doc = await db.get(EinvoiceDocument, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="E-invoice document not found")
    if doc.status not in RETRIABLE_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot retry a document with status '{doc.status}'",
        )

    await _submit(db, doc)
    db.add(AuditLog(
        principal_id=admin.id,
        action="update",
        resource_type="einvoice_document",
        resource_id=doc.id,
        changes_summary={"code_number": doc.code_number, "new_status": doc.status},
    ))
    await db.commit()
    await db.refresh(doc)

    order = await db.get(Order, doc.order_id)
    return APIResponse(data=_doc_dict(doc, order.order_number if order else None, include_ubl=True))


@router.post("/orders/{order_id}/issue", response_model=APIResponse[dict], status_code=status.HTTP_201_CREATED)
async def issue_einvoice_for_order(
    order_id: int,
    db: DBDependency,
    admin: CurrentAdmin,
):
    """Manually issue an e-invoice for an order using its latest captured payment."""
    result = await db.execute(
        select(Order).where(Order.id == order_id, Order.deleted_at.is_(None))
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    pay_result = await db.execute(
        select(Payment)
        .where(Payment.order_id == order.id, Payment.status.in_(("captured", "partially_refunded")))
        .order_by(Payment.id.desc())
        .limit(1)
    )
    payment = pay_result.scalar_one_or_none()
    if payment is None:
        raise HTTPException(status_code=400, detail="Order has no captured payment")

    doc = await issue_einvoice(db, order, payment)
    db.add(AuditLog(
        principal_id=admin.id,
        action="create",
        resource_type="einvoice_document",
        resource_id=doc.id,
        changes_summary={
            "order_id": order.id,
            "order_number": order.order_number,
            "payment_id": payment.id,
            "code_number": doc.code_number,
        },
    ))
    await db.commit()
    await db.refresh(doc)
    return APIResponse(data=_doc_dict(doc, order.order_number, include_ubl=True))
