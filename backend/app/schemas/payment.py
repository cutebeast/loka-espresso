from pydantic import AliasChoices, BaseModel, Field
from typing import Optional


class PaymentIntentCreate(BaseModel):
    order_id: int = Field(validation_alias=AliasChoices("order_id", "orderId"))
    method: str = "wallet"
    provider: Optional[str] = None
    idempotency_key: Optional[str] = Field(default=None, validation_alias=AliasChoices("idempotency_key", "idempotencyKey"))


class PaymentConfirm(BaseModel):
    payment_id: int = Field(validation_alias=AliasChoices("payment_id", "paymentId", "paymentIntentId"))
    transaction_id: Optional[str] = None
    provider_reference: Optional[str] = Field(default=None, validation_alias=AliasChoices("provider_reference", "providerReference"))


class PaymentMethodOut(BaseModel):
    id: int
    type: Optional[str] = None
    provider: Optional[str] = None
    last4: Optional[str] = None
    is_default: bool = False

    class Config:
        from_attributes = True


class PaymentMethodCreate(BaseModel):
    type: str
    provider: Optional[str] = None
    last4: Optional[str] = None
    is_default: bool = False
