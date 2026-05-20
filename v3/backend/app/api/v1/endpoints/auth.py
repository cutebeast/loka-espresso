"""Authentication endpoints."""

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.api.v1.deps import DBDependency
from app.models.customer import Customer
from app.schemas.auth import (
    AuthResponse,
    CustomerLoginRequest,
    CustomerRegisterRequest,
    RefreshTokenRequest,
    TokenPair,
)
from app.schemas.customer import CustomerProfileOut
from app.services.auth import (
    AuthError,
    create_customer_tokens,
    refresh_customer_tokens,
    register_customer,
)

router = APIRouter(prefix="/auth", tags=["authentication"])


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def customer_register(db: DBDependency, data: CustomerRegisterRequest):
    """Register a new customer account (passwordless / OTP)."""
    try:
        customer = await register_customer(db, data)
    except AuthError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    
    tokens = await create_customer_tokens(customer)
    return AuthResponse(
        user_type="customer",
        user_id=customer.id,
        tokens=tokens,
        profile=CustomerProfileOut.model_validate(customer).model_dump(),
    )


@router.post("/login", response_model=AuthResponse)
async def customer_login(db: DBDependency, data: CustomerLoginRequest):
    """Login with email or phone (OTP-based / passwordless).
    
    For development: directly returns tokens if customer exists.
    In production, this should trigger OTP verification.
    """
    if data.email_address:
        result = await db.execute(
            select(Customer).where(
                Customer.email_address == data.email_address,
                Customer.deleted_at.is_(None),
            )
        )
    elif data.phone_number:
        result = await db.execute(
            select(Customer).where(
                Customer.phone_number == data.phone_number,
                Customer.deleted_at.is_(None),
            )
        )
    else:
        raise HTTPException(status_code=400, detail="Email or phone required")
    
    customer = result.scalar_one_or_none()
    if customer is None:
        raise HTTPException(status_code=404, detail="Account not found. Please register.")
    
    if not customer.is_active:
        raise HTTPException(status_code=403, detail="Account is inactive")
    
    tokens = await create_customer_tokens(customer)
    return AuthResponse(
        user_type="customer",
        user_id=customer.id,
        tokens=tokens,
        profile=CustomerProfileOut.model_validate(customer).model_dump(),
    )


@router.post("/refresh", response_model=TokenPair)
async def customer_refresh(db: DBDependency, data: RefreshTokenRequest):
    """Refresh access token."""
    try:
        tokens = await refresh_customer_tokens(db, data)
    except AuthError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    return tokens


@router.post("/logout")
async def customer_logout():
    """Logout endpoint — client-side token invalidation.
    
    In a stateless JWT setup, logout is handled entirely on the client
    by discarding tokens. Server-side token blacklisting can be added
    here for production (Redis/DB token revocation list).
    """
    # Future: add refresh_token to a revocation list
    return {"success": True, "message": "Logged out successfully"}
