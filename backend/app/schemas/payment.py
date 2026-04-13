from pydantic import BaseModel
from typing import Optional


class PaymentIntentCreate(BaseModel):
    order_id: int
    method: str = "wallet"


class PaymentConfirm(BaseModel):
    payment_id: int
    transaction_id: Optional[str] = None


class PaymentMethodOut(BaseModel):
    id: int
    type: Optional[str] = None
    provider: Optional[str] = None
    last4: Optional[str] = None
    is_default: int = 0

    class Config:
        from_attributes = True


class PaymentMethodCreate(BaseModel):
    type: str
    provider: Optional[str] = None
    last4: Optional[str] = None
    is_default: bool = False
