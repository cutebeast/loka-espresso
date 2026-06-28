"""Daily check-in admin endpoint."""

from datetime import date

from fastapi import APIRouter, Query
from sqlalchemy import func, select

from app.api.routes.deps import CurrentAdmin, DBDependency
from app.models.checkin import CustomerDailyCheckin
from app.models.customer import Customer
from app.schemas.base import APIResponse, PaginatedResponse

router = APIRouter(prefix="/admin/checkins", tags=["admin — check-ins"])


@router.get("", response_model=APIResponse[PaginatedResponse[dict]])
async def list_checkins(
    db: DBDependency, admin: CurrentAdmin,
    page: int = Query(1, ge=1), per_page: int = Query(50, ge=1, le=500),
):
    total = (await db.execute(select(func.count(CustomerDailyCheckin.id)))).scalar() or 0
    rows = (await db.execute(
        select(CustomerDailyCheckin, Customer.display_name)
        .join(Customer, Customer.id == CustomerDailyCheckin.customer_id, isouter=True)
        .order_by(CustomerDailyCheckin.checkin_date.desc(), CustomerDailyCheckin.id.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )).all()

    items = []
    for cd, cust_name in rows:
        item = {
            "id": cd.id, "customer_id": cd.customer_id,
            "customer_name": cust_name or f"Customer #{cd.customer_id}",
            "checkin_date": cd.checkin_date.isoformat(),
            "created_at": cd.created_at.isoformat() if cd.created_at else None,
        }
        items.append(item)

    return APIResponse(data=PaginatedResponse(items=items, total=total, page=page, per_page=per_page, total_pages=(total + per_page - 1) // per_page if per_page else 0))


@router.get("/stats", response_model=APIResponse[dict])
async def checkin_stats(db: DBDependency, admin: CurrentAdmin):
    today = date.today()
    total = (await db.execute(select(func.count(CustomerDailyCheckin.id)))).scalar() or 0
    today_cnt = (await db.execute(
        select(func.count(func.distinct(CustomerDailyCheckin.customer_id)))
        .where(CustomerDailyCheckin.checkin_date == today)
    )).scalar() or 0
    week_cnt = (await db.execute(
        select(func.count(func.distinct(CustomerDailyCheckin.customer_id)))
        .where(CustomerDailyCheckin.checkin_date >= func.current_date() - 7)
    )).scalar() or 0
    return APIResponse(data={"today": today_cnt, "this_week": week_cnt, "total_checkins": total})
