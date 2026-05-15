"""Daily check-in admin endpoint."""

from fastapi import APIRouter, Query
from sqlalchemy import text as sa_text

from app.api.v1.deps import CurrentAdmin, DBDependency
from app.models.checkin import CustomerDailyCheckin
from app.schemas.base import APIResponse, PaginatedResponse

router = APIRouter(prefix="/admin/checkins", tags=["admin — check-ins"])

CHECKIN_TABLE = CustomerDailyCheckin.__tablename__


@router.get("", response_model=APIResponse[PaginatedResponse[dict]])
async def list_checkins(
    db: DBDependency, admin: CurrentAdmin,
    page: int = Query(1, ge=1), per_page: int = Query(50, ge=1, le=100),
):
    total = (await db.execute(sa_text(f"SELECT COUNT(*) FROM {CHECKIN_TABLE}"))).scalar() or 0
    rows = (await db.execute(
        sa_text(f"SELECT cd.*, c.display_name as customer_name FROM {CHECKIN_TABLE} cd JOIN customers c ON c.id = cd.customer_id ORDER BY cd.checkin_date DESC, cd.id DESC LIMIT :limit OFFSET :offset"),
        {"limit": per_page, "offset": (page-1)*per_page}
    )).all()
    items = [dict(r._mapping) for r in rows] if rows else []
    for i in items:
        for k in list(i.keys()):
            v = i[k]
            if hasattr(v, 'isoformat'): i[k] = v.isoformat()
    return APIResponse(data=PaginatedResponse(items=items, total=total, page=page, per_page=per_page, total_pages=(total+per_page-1)//per_page if per_page else 0))


@router.get("/stats", response_model=APIResponse[dict])
async def checkin_stats(db: DBDependency, admin: CurrentAdmin):
    total = (await db.execute(sa_text(f"SELECT COUNT(*) FROM {CHECKIN_TABLE}"))).scalar() or 0
    today = (await db.execute(sa_text(f"SELECT COUNT(DISTINCT customer_id) FROM {CHECKIN_TABLE} WHERE checkin_date = CURRENT_DATE"))).scalar() or 0
    week = (await db.execute(sa_text(f"SELECT COUNT(DISTINCT customer_id) FROM {CHECKIN_TABLE} WHERE checkin_date >= CURRENT_DATE - 7"))).scalar() or 0
    return APIResponse(data={"today": today, "this_week": week, "total_checkins": total})
