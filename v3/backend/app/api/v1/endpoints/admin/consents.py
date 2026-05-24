"""Customer consent endpoints (admin read-only + customer self-service)."""

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, select

from app.api.v1.deps import ActiveCustomer, CurrentAdmin, DBDependency
from app.models.customer import CustomerConsent
from app.schemas.base import APIResponse, PaginatedResponse
from app.schemas.customer import CustomerConsentOut

# ---------------------------------------------------------------------------
# Admin router
# ---------------------------------------------------------------------------

admin_router = APIRouter(prefix="/admin/customers", tags=["admin — customers"])


@admin_router.get("/consents", response_model=APIResponse[PaginatedResponse[CustomerConsentOut]])
async def list_consents(
    db: DBDependency,
    admin: CurrentAdmin,
    customer_id: int | None = Query(None),
    consent_type: str | None = Query(None),
    status: str | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=500),
):
    """List customer consents with filters."""
    base_stmt = select(CustomerConsent)
    count_stmt = select(func.count(CustomerConsent.id))

    if customer_id is not None:
        base_stmt = base_stmt.where(CustomerConsent.customer_id == customer_id)
        count_stmt = count_stmt.where(CustomerConsent.customer_id == customer_id)
    if consent_type is not None:
        base_stmt = base_stmt.where(CustomerConsent.consent_type == consent_type)
        count_stmt = count_stmt.where(CustomerConsent.consent_type == consent_type)
    if status is not None:
        base_stmt = base_stmt.where(CustomerConsent.status == status)
        count_stmt = count_stmt.where(CustomerConsent.status == status)

    total_result = await db.execute(count_stmt)
    total = total_result.scalar() or 0

    stmt = (
        base_stmt.order_by(CustomerConsent.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    result = await db.execute(stmt)
    items = [CustomerConsentOut.model_validate(r) for r in result.scalars().all()]

    return APIResponse(
        data=PaginatedResponse(
            items=items,
            total=total,
            page=page,
            per_page=per_page,
            total_pages=(total + per_page - 1) // per_page,
        )
    )


# ---------------------------------------------------------------------------
# Customer self-service router
# ---------------------------------------------------------------------------

public_router = APIRouter(prefix="/me", tags=["customer"])


class ConsentGrant(BaseModel):
    consent_type: str
    consent_version: str = "1.0"
    ip_address: str | None = None
    user_agent: str | None = None


@public_router.get("/consents", response_model=APIResponse[list[CustomerConsentOut]])
async def get_my_consents(
    customer: ActiveCustomer,
    db: DBDependency,
):
    """Get current customer's consents."""
    result = await db.execute(
        select(CustomerConsent).where(CustomerConsent.customer_id == customer.id)
    )
    consents = [CustomerConsentOut.model_validate(c) for c in result.scalars().all()]
    return APIResponse(data=consents)


@public_router.post("/consents", response_model=APIResponse[CustomerConsentOut])
async def grant_consent(
    customer: ActiveCustomer,
    db: DBDependency,
    data: ConsentGrant,
):
    """Grant or update a consent."""
    # Check for existing consent of same type
    result = await db.execute(
        select(CustomerConsent).where(
            CustomerConsent.customer_id == customer.id,
            CustomerConsent.consent_type == data.consent_type,
        )
    )
    existing = result.scalar_one_or_none()

    now = datetime.now(timezone.utc)

    if existing is not None:
        existing.status = "granted"
        existing.granted_at = now
        existing.withdrawn_at = None
        existing.consent_version = data.consent_version
        if data.ip_address is not None:
            existing.ip_address = data.ip_address
        if data.user_agent is not None:
            existing.user_agent = data.user_agent
        await db.commit()
        await db.refresh(existing)
        return APIResponse(data=CustomerConsentOut.model_validate(existing))

    consent = CustomerConsent(
        customer_id=customer.id,
        consent_type=data.consent_type,
        status="granted",
        granted_at=now,
        consent_version=data.consent_version,
        ip_address=data.ip_address,
        user_agent=data.user_agent,
    )
    db.add(consent)
    await db.commit()
    await db.refresh(consent)
    return APIResponse(data=CustomerConsentOut.model_validate(consent))


@public_router.delete("/consents/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def withdraw_consent(
    customer: ActiveCustomer,
    db: DBDependency,
    id: int,
):
    """Withdraw a consent."""
    result = await db.execute(
        select(CustomerConsent).where(
            CustomerConsent.id == id,
            CustomerConsent.customer_id == customer.id,
        )
    )
    consent = result.scalar_one_or_none()
    if consent is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Consent not found")

    consent.status = "withdrawn"
    consent.withdrawn_at = datetime.now(timezone.utc)
    await db.commit()
    return None
