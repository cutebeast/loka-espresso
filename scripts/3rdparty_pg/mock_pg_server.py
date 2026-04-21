"""
MOCK PAYMENT GATEWAY SERVER: mock_pg_server.py
Purpose: Simulate 3rd party Payment Gateway for wallet topup testing
APIs exposed:
  - POST /pg/charge - Create a payment charge
  - POST /pg/confirm - Confirm payment (simulate user completing payment)
  - GET /pg/charge/{id}/status - Check payment status
  - POST /pg/webhook/register - Register webhook for callbacks
Status: CERTIFIED-2026-04-19 | Stateless, fast simulation (seconds)
Dependencies: None (standalone FastAPI server)
Flow:
  1. FNB app creates charge via POST /pg/charge
  2. Mock PG returns charge_id and payment URL
  3. FNB app calls POST /pg/confirm to simulate user payment
  4. Mock PG processes payment (fast simulation)
  5. Mock PG calls webhook to notify FNB app
  6. FNB app updates wallet balance
Simulation: pending → processing → completed (1 sec each)
NO persistent storage — in-memory only (resets on restart).
"""

import uuid
import random
import asyncio
import httpx
import os
from datetime import datetime, timezone
from fastapi import FastAPI, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Optional, Literal
import uvicorn

app = FastAPI(title="Mock Payment Gateway API", version="1.0.0")

# In-memory storage (stateless - resets on restart)
charges = {}
webhooks = {}  # charge_id -> callback_url

FNB_API_URL = os.environ.get("FNB_API_URL", "http://localhost:8765/api/v1")
FNB_WEBHOOK_API_KEY = os.environ.get("FNB_WEBHOOK_API_KEY", "fnb-webhook-default-key")


async def _post_fnb_webhook(url: str, payload: dict):
    async with httpx.AsyncClient() as client:
        await client.post(
            url,
            json=payload,
            headers={"X-API-Key": FNB_WEBHOOK_API_KEY},
            timeout=5.0,
        )


class PaymentMethod(BaseModel):
    type: Literal["card", "fpx", "ewallet"] = "card"
    card_number: Optional[str] = None  # Last 4 digits for display
    bank: Optional[str] = None  # For FPX
    ewallet_type: Optional[Literal["touchngo", "grabpay", "boost"]] = None


class ChargeRequest(BaseModel):
    amount: float
    currency: str = "MYR"
    description: str
    user_id: int
    user_email: str
    user_name: str
    callback_url: Optional[str] = None
    payment_method: Optional[PaymentMethod] = None
    order_id: Optional[int] = None  # For order payments (vs wallet topup)


class ConfirmRequest(BaseModel):
    charge_id: str
    simulate_success: bool = True  # Set to False to test failure scenario


class WebhookRegisterRequest(BaseModel):
    charge_id: str
    callback_url: str


async def simulate_payment_processing(charge_id: str):
    """
    Simulate payment processing with fast status transitions.
    Flow: pending → processing → completed (0.1 seconds each)
    Calls webhook after each status change.
    """
    if charge_id not in charges:
        return
    
    states_sequence = [
        ("processing", "Payment is being processed"),
        ("completed", "Payment successful"),
    ]
    
    for new_status, note in states_sequence:
        await asyncio.sleep(0.1)  # Fast simulation: 0.1 second per status
        
        if charge_id not in charges:
            return
        
        charge = charges[charge_id]
        charge["status"] = new_status
        charge["updated_at"] = datetime.now(timezone.utc).isoformat()
        
        if new_status == "completed":
            charge["paid_at"] = datetime.now(timezone.utc).isoformat()
            charge["receipt_url"] = f"/receipts/{charge_id}"
        
        # Call webhook if registered
        if charge_id in webhooks:
            callback_url = webhooks[charge_id]
            try:
                await _post_fnb_webhook(callback_url, {
                        "charge_id": charge_id,
                        "status": new_status,
                        "amount": charge["amount"],
                        "currency": charge["currency"],
                        "user_id": charge["user_id"],
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "note": note,
                    })
            except Exception as e:
                print(f"[MOCK PG] Webhook call failed for {charge_id}: {e}")
        
        # For order payments, also call the order payment webhook on completion
        if new_status == "completed" and charge.get("order_id"):
            try:
                order_webhook_url = f"{FNB_API_URL}/wallet/webhook/order-payment"

                response = await _post_fnb_webhook(order_webhook_url, {
                        "charge_id": charge_id,
                        "order_id": charge["order_id"],
                        "status": new_status,
                        "amount": charge["amount"],
                        "currency": charge["currency"],
                        "user_id": charge["user_id"],
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "note": note,
                    })
                print(f"[MOCK PG] Order payment webhook called for order {charge['order_id']}")
            except Exception as e:
                print(f"[MOCK PG] Order payment webhook call failed for {charge_id}: {e}")
        
        print(f"[MOCK PG] {charge_id} status updated: {new_status}")


@app.get("/health")
def health():
    """Health check endpoint."""
    return {"status": "healthy", "service": "mock_payment_gateway", "active_charges": len(charges)}


@app.post("/pg/charge")
def create_charge(req: ChargeRequest, background_tasks: BackgroundTasks):
    """
    Create a new payment charge.
    Returns charge_id and checkout URL.
    """
    charge_id = f"CHG-{uuid.uuid4().hex[:12].upper()}"
    
    charge = {
        "charge_id": charge_id,
        "amount": req.amount,
        "currency": req.currency,
        "description": req.description,
        "user_id": req.user_id,
        "user_email": req.user_email,
        "user_name": req.user_name,
        "order_id": req.order_id,  # Store order_id for order payments
        "status": "pending",
        "payment_method": req.payment_method.model_dump() if req.payment_method else {"type": "card"},
        "checkout_url": f"/pg/checkout/{charge_id}",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "paid_at": None,
        "receipt_url": None,
    }
    
    charges[charge_id] = charge
    
    # Register webhook if provided
    if req.callback_url:
        webhooks[charge_id] = req.callback_url
    
    print(f"[MOCK PG] Created charge {charge_id} for RM {req.amount} (user_id={req.user_id})")
    
    return {
        "charge_id": charge_id,
        "amount": req.amount,
        "currency": req.currency,
        "status": "pending",
        "checkout_url": charge["checkout_url"],
        "message": "Payment charge created. Call /pg/confirm to simulate payment completion."
    }


@app.post("/pg/confirm")
def confirm_payment(req: ConfirmRequest, background_tasks: BackgroundTasks):
    """
    Confirm/simulate payment completion.
    In real scenario, user would complete payment on PG checkout page.
    """
    if req.charge_id not in charges:
        raise HTTPException(status_code=404, detail="Charge not found")
    
    charge = charges[req.charge_id]
    
    if charge["status"] != "pending":
        raise HTTPException(status_code=400, detail=f"Charge already {charge['status']}")
    
    if not req.simulate_success:
        # Simulate payment failure
        charge["status"] = "failed"
        charge["updated_at"] = datetime.now(timezone.utc).isoformat()
        charge["failure_reason"] = "Card declined by issuer"
        
        # Call webhook with failure
        if req.charge_id in webhooks:
            callback_url = webhooks[req.charge_id]
            try:
                import asyncio
                asyncio.create_task(_send_webhook(callback_url, {
                    "charge_id": req.charge_id,
                    "status": "failed",
                    "amount": charge["amount"],
                    "currency": charge["currency"],
                    "user_id": charge["user_id"],
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "failure_reason": "Card declined by issuer",
                }))
            except Exception as e:
                print(f"[MOCK PG] Webhook call failed: {e}")
        
        return {
            "charge_id": req.charge_id,
            "status": "failed",
            "message": "Payment failed: Card declined by issuer"
        }
    
    # Start payment processing simulation
    background_tasks.add_task(simulate_payment_processing, req.charge_id)
    
    return {
        "charge_id": req.charge_id,
        "status": "processing",
        "message": "Payment processing started"
    }


async def _send_webhook(callback_url: str, data: dict):
    """Helper to send webhook async."""
    try:
        await _post_fnb_webhook(callback_url, data)
    except Exception as e:
        print(f"[MOCK PG] Webhook failed: {e}")


@app.get("/pg/charge/{charge_id}/status")
def get_charge_status(charge_id: str):
    """Get current status of a payment charge."""
    if charge_id not in charges:
        raise HTTPException(status_code=404, detail="Charge not found")
    
    return charges[charge_id]


@app.post("/pg/webhook/register")
def register_webhook(req: WebhookRegisterRequest):
    """Register a webhook URL for payment status updates."""
    if req.charge_id not in charges:
        raise HTTPException(status_code=404, detail="Charge not found")
    
    webhooks[req.charge_id] = req.callback_url
    return {"message": "Webhook registered", "charge_id": req.charge_id}


@app.get("/pg/charges")
def list_charges():
    """List all charges (for debugging)."""
    return {
        "count": len(charges),
        "charges": list(charges.values())
    }


@app.post("/pg/charge/{charge_id}/simulate-fail")
def simulate_failure(charge_id: str):
    """Manually trigger a payment failure (for testing)."""
    if charge_id not in charges:
        raise HTTPException(status_code=404, detail="Charge not found")
    
    charge = charges[charge_id]
    charge["status"] = "failed"
    charge["updated_at"] = datetime.now(timezone.utc).isoformat()
    charge["failure_reason"] = "Simulated failure"
    
    return {
        "charge_id": charge_id,
        "status": "failed",
        "message": "Payment marked as failed (simulated)"
    }


if __name__ == "__main__":
    print("="*60)
    print("  Mock Payment Gateway Server")
    print("  Fast simulation mode (1 sec per status)")
    print("="*60)
    print()
    print("Endpoints:")
    print("  POST /pg/charge                    - Create payment charge")
    print("  POST /pg/confirm                   - Confirm/simulate payment")
    print("  GET  /pg/charge/{id}/status        - Check payment status")
    print("  POST /pg/webhook/register          - Register webhook")
    print("  GET  /pg/charges                   - List all charges")
    print("  POST /pg/charge/{id}/simulate-fail - Simulate failure")
    print("  GET  /health                       - Health check")
    print()
    uvicorn.run(app, host="0.0.0.0", port=8889)
