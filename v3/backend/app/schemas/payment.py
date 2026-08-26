"""Payment domain schemas."""
from decimal import Decimal
from app.schemas.base import Money
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.base import BaseSchema


class PaymentMethodBase(BaseSchema):
    method_type: Literal["credit_card", "debit_card", "e_wallet", "bank_transfer", "cash", "crypto", "buy_now_pay_later", "qr_pay"]
    provider: Literal["stripe", "adyen", "braintree", "paypal", "cash", "store_credit", "internal_wallet", "gcash", "alipay", "wechat_pay", "hitpay", "eghl"] = "internal_wallet"
    display_label: str | None = Field(None, max_length=100)
    card_brand: str | None = Field(None, max_length=20)
    card_last_four: str | None = Field(None, max_length=4)
    card_expiry_month: str | None = Field(None, max_length=2)
    card_expiry_year: str | None = Field(None, max_length=4)
    is_default: bool = False
    is_active: bool = True
    billing_address_snapshot: dict | None = None


class PaymentMethodOut(PaymentMethodBase):
    id: int
    customer_id: int
    verified_at: datetime | None
    created_at: datetime
    updated_at: datetime


class PaymentLineAllocationOut(BaseSchema):
    order_line_item_id: int
    item_name: str | None
    quantity: str


class PaymentOut(BaseSchema):
    id: int
    order_id: int
    payment_method_id: int | None
    provider: str
    provider_transaction_id: str | None
    payment_method_type: str | None
    amount: Money
    currency_code: str
    status: Literal[
        "initiated", "pending_authorization", "authorized", "captured",
        "failed", "refunded", "partially_refunded", "chargeback", "voided", "settled",
    ]
    captured_amount: Money
    refunded_amount: Money
    refund_count: int
    fee_amount: Money
    net_amount: Money
    failure_code: str | None
    failure_message: str | None
    settled_at: datetime | None
    settlement_batch_id: str | None
    metadata: dict | None
    created_at: datetime
    updated_at: datetime
    # Split-bill coverage: which line items this payment paid for (empty when
    # the payment covers the whole bill / an even-share amount).
    allocations: list[PaymentLineAllocationOut] | None = None


class RefundOut(BaseSchema):
    id: int
    payment_id: int
    order_id: int
    amount: Money
    reason: str
    status: Literal["pending", "processing", "completed", "failed"]
    approved_by: int | None
    processed_at: datetime | None
    created_at: datetime


class PaymentIntentRequest(BaseSchema):
    order_id: int
    provider: str
    payment_method_type: str
    payment_method_id: int | None = None
    return_url: str | None = Field(None, max_length=500)
    idempotency_key: str | None = Field(None, max_length=255)


class RefundCreate(BaseSchema):
    amount: Money = Field(..., gt=0)
    reason: str = Field(..., min_length=1)
    reason_category: Literal["customer_request", "item_unavailable", "quality_issue", "wrong_order", "late_delivery", "other"] = "other"


class PaymentIntentResponse(BaseSchema):
    payment_id: int
    client_secret: str | None
    redirect_url: str | None
    status: str
    amount: Money
    currency_code: str


class CheckoutSessionRequest(BaseSchema):
    order_id: int
    return_url: str | None = Field(None, max_length=500)


class CheckoutSessionResponse(BaseSchema):
    payment_id: int
    checkout_url: str
    status: str
    amount: Money
    currency_code: str


class PaymentWebhookPayload(BaseSchema):
    event_type: str
    provider: str
    payload: dict
    signature: str | None
