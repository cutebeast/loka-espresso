"""Admin lucky draw (spin wheel) endpoints — campaign/segment CRUD + spins report."""

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select

from app.api.routes.deps import CurrentAdmin, DBDependency
from app.models.customer import Customer
from app.models.lucky_draw import LuckyDrawCampaign, LuckyDrawSegment, LuckyDrawSpin
from app.models.voucher import CustomerVoucher, VoucherDefinition
from app.schemas.base import APIResponse, PaginatedResponse
from app.schemas.lucky_draw import (
    LuckyDrawCampaignCreate,
    LuckyDrawCampaignOut,
    LuckyDrawCampaignUpdate,
    LuckyDrawSegmentCreate,
    LuckyDrawSegmentOut,
    LuckyDrawSegmentUpdate,
    LuckyDrawSpinReportItem,
)

router = APIRouter(prefix="/admin/lucky-draw", tags=["admin — lucky draw"])


async def _get_first_campaign(db) -> LuckyDrawCampaign | None:
    result = await db.execute(
        select(LuckyDrawCampaign).order_by(LuckyDrawCampaign.id.asc()).limit(1)
    )
    return result.scalar_one_or_none()


async def _get_campaign_or_404(db, campaign_id: int) -> LuckyDrawCampaign:
    campaign = await db.get(LuckyDrawCampaign, campaign_id)
    if campaign is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")
    return campaign


async def _validate_voucher_definition(db, voucher_definition_id: int) -> None:
    result = await db.execute(
        select(VoucherDefinition.id).where(
            VoucherDefinition.id == voucher_definition_id,
            VoucherDefinition.deleted_at.is_(None),
        )
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Voucher definition not found",
        )


# ── Campaign ──


@router.get("/campaign", response_model=APIResponse[LuckyDrawCampaignOut | None])
async def get_campaign(db: DBDependency, admin: CurrentAdmin):
    """Return the (single) configured campaign, or null if none exists yet."""
    campaign = await _get_first_campaign(db)
    return APIResponse(
        data=LuckyDrawCampaignOut.model_validate(campaign) if campaign else None
    )


@router.post("/campaign", response_model=APIResponse[LuckyDrawCampaignOut], status_code=status.HTTP_201_CREATED)
async def create_campaign(
    payload: LuckyDrawCampaignCreate,
    db: DBDependency,
    admin: CurrentAdmin,
):
    """Create the campaign (called when none exists yet)."""
    campaign = LuckyDrawCampaign(**payload.model_dump())
    db.add(campaign)
    await db.commit()
    await db.refresh(campaign)
    return APIResponse(data=LuckyDrawCampaignOut.model_validate(campaign))


@router.put("/campaign/{campaign_id}", response_model=APIResponse[LuckyDrawCampaignOut])
async def update_campaign(
    campaign_id: int,
    payload: LuckyDrawCampaignUpdate,
    db: DBDependency,
    admin: CurrentAdmin,
):
    campaign = await _get_campaign_or_404(db, campaign_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(campaign, field, value)
    await db.commit()
    await db.refresh(campaign)
    return APIResponse(data=LuckyDrawCampaignOut.model_validate(campaign))


# ── Segments ──


@router.get("/campaigns/{campaign_id}/segments", response_model=APIResponse[list[LuckyDrawSegmentOut]])
async def list_segments(campaign_id: int, db: DBDependency, admin: CurrentAdmin):
    await _get_campaign_or_404(db, campaign_id)
    result = await db.execute(
        select(LuckyDrawSegment)
        .where(LuckyDrawSegment.campaign_id == campaign_id)
        .order_by(LuckyDrawSegment.sort_order.asc(), LuckyDrawSegment.id.asc())
    )
    return APIResponse(
        data=[LuckyDrawSegmentOut.model_validate(s) for s in result.scalars().all()]
    )


@router.post(
    "/campaigns/{campaign_id}/segments",
    response_model=APIResponse[LuckyDrawSegmentOut],
    status_code=status.HTTP_201_CREATED,
)
async def create_segment(
    campaign_id: int,
    payload: LuckyDrawSegmentCreate,
    db: DBDependency,
    admin: CurrentAdmin,
):
    await _get_campaign_or_404(db, campaign_id)
    await _validate_voucher_definition(db, payload.voucher_definition_id)
    segment = LuckyDrawSegment(campaign_id=campaign_id, **payload.model_dump())
    db.add(segment)
    await db.commit()
    await db.refresh(segment)
    return APIResponse(data=LuckyDrawSegmentOut.model_validate(segment))


@router.put("/segments/{segment_id}", response_model=APIResponse[LuckyDrawSegmentOut])
async def update_segment(
    segment_id: int,
    payload: LuckyDrawSegmentUpdate,
    db: DBDependency,
    admin: CurrentAdmin,
):
    segment = await db.get(LuckyDrawSegment, segment_id)
    if segment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Segment not found")
    updates = payload.model_dump(exclude_unset=True)
    if "voucher_definition_id" in updates:
        await _validate_voucher_definition(db, updates["voucher_definition_id"])
    for field, value in updates.items():
        setattr(segment, field, value)
    await db.commit()
    await db.refresh(segment)
    return APIResponse(data=LuckyDrawSegmentOut.model_validate(segment))


@router.delete("/segments/{segment_id}", response_model=APIResponse[dict])
async def delete_segment(segment_id: int, db: DBDependency, admin: CurrentAdmin):
    segment = await db.get(LuckyDrawSegment, segment_id)
    if segment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Segment not found")
    await db.delete(segment)
    await db.commit()
    return APIResponse(data={"deleted": True, "id": segment_id})


# ── Spins report ──


@router.get("/spins", response_model=APIResponse[PaginatedResponse[LuckyDrawSpinReportItem]])
async def list_spins(
    db: DBDependency,
    admin: CurrentAdmin,
    campaign_id: int | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=500),
):
    """Recent spins, newest first, with customer + prize details."""
    base = (
        select(
            LuckyDrawSpin,
            Customer.display_name,
            Customer.phone_number,
            LuckyDrawSegment.label,
            CustomerVoucher.voucher_code,
        )
        .join(Customer, Customer.id == LuckyDrawSpin.customer_id)
        .join(LuckyDrawSegment, LuckyDrawSegment.id == LuckyDrawSpin.segment_id, isouter=True)
        .join(CustomerVoucher, CustomerVoucher.id == LuckyDrawSpin.customer_voucher_id, isouter=True)
    )
    count_stmt = select(func.count(LuckyDrawSpin.id))
    if campaign_id is not None:
        base = base.where(LuckyDrawSpin.campaign_id == campaign_id)
        count_stmt = count_stmt.where(LuckyDrawSpin.campaign_id == campaign_id)

    total = (await db.execute(count_stmt)).scalar() or 0
    rows = (
        await db.execute(
            base.order_by(LuckyDrawSpin.created_at.desc(), LuckyDrawSpin.id.desc())
            .offset((page - 1) * per_page)
            .limit(per_page)
        )
    ).all()

    items = [
        LuckyDrawSpinReportItem(
            id=spin.id,
            campaign_id=spin.campaign_id,
            customer_id=spin.customer_id,
            customer_name=display_name,
            customer_phone=phone_number,
            segment_id=spin.segment_id,
            segment_label=segment_label,
            voucher_code=voucher_code,
            created_at=spin.created_at,
        )
        for spin, display_name, phone_number, segment_label, voucher_code in rows
    ]

    return APIResponse(
        data=PaginatedResponse(
            items=items,
            total=total,
            page=page,
            per_page=per_page,
            total_pages=(total + per_page - 1) // per_page,
        )
    )
