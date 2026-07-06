"""Public marketing self-service endpoints (opt-out, etc.)."""

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select

from app.api.routes.deps import ActiveCustomer, DBDependency
from app.models.customer import Customer, CustomerConsent
from app.schemas.base import APIResponse

router = APIRouter(prefix="/public/marketing", tags=["public — marketing"])


class MarketingOptOutRequest(BaseModel):
    """Unauthenticated opt-out by email or phone."""

    email_address: EmailStr | None = None
    phone_number: str | None = Field(None, pattern=r"^\+?[1-9]\d{7,14}$")


class MarketingOptOutResponse(BaseModel):
    success: bool
    message: str


async def _apply_opt_out(db: DBDependency, customer: Customer | None) -> None:
    """Set the marketing opt-out flag and record a withdrawn consent audit row."""
    if customer is None:
        return

    now = datetime.now(timezone.utc)
    if not customer.marketing_opt_out:
        customer.marketing_opt_out = True
        customer.marketing_opt_out_at = now

    # Idempotent audit row for the major marketing channels.
    for consent_type in ("marketing_email", "marketing_sms", "marketing_push"):
        result = await db.execute(
            select(CustomerConsent).where(
                CustomerConsent.customer_id == customer.id,
                CustomerConsent.consent_type == consent_type,
            )
        )
        existing = result.scalar_one_or_none()
        if existing is None:
            existing = CustomerConsent(
                customer_id=customer.id,
                consent_type=consent_type,
                status="withdrawn",
                withdrawn_at=now,
            )
            db.add(existing)
        elif existing.status != "withdrawn":
            existing.status = "withdrawn"
            existing.withdrawn_at = now


@router.post("/opt-out", response_model=APIResponse[MarketingOptOutResponse])
async def public_marketing_opt_out(db: DBDependency, data: MarketingOptOutRequest):
    """Allow a customer to opt out of marketing messages using email or phone.

    Returns success even if no matching customer is found so the endpoint does not
    leak whether an address is in the database.
    """
    customer: Customer | None = None
    if data.email_address:
        result = await db.execute(
            select(Customer).where(
                Customer.email_address == data.email_address,
                Customer.deleted_at.is_(None),
            )
        )
        customer = result.scalar_one_or_none()
    elif data.phone_number:
        result = await db.execute(
            select(Customer).where(
                Customer.phone_number == data.phone_number,
                Customer.deleted_at.is_(None),
            )
        )
        customer = result.scalar_one_or_none()
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Either email_address or phone_number is required",
        )

    if customer is not None:
        await _apply_opt_out(db, customer)
        await db.commit()

    return APIResponse(
        data=MarketingOptOutResponse(
            success=True,
            message="You have been opted out of marketing messages.",
        )
    )


@router.post("/me/opt-out", response_model=APIResponse[MarketingOptOutResponse])
async def authenticated_marketing_opt_out(
    customer: ActiveCustomer,
    db: DBDependency,
):
    """Authenticated customer opt-out of marketing messages."""
    await _apply_opt_out(db, customer)
    await db.commit()
    return APIResponse(
        data=MarketingOptOutResponse(
            success=True,
            message="You have been opted out of marketing messages.",
        )
    )
