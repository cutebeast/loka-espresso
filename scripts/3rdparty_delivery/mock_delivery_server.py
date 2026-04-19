"""
MOCK DELIVERY SERVER: mock_delivery_server.py
Purpose: Simulate 3rd party delivery provider API for testing delivery orders
APIs exposed: 
  - POST /delivery/quote - Get delivery quote
  - POST /delivery/create - Create delivery job
  - GET /delivery/{id}/status - Check delivery status
  - POST /webhook/register - Register webhook for callbacks
Status: CERTIFIED-2026-04-18 | Stateless, fast simulation (seconds)
Dependencies: None (standalone FastAPI server)
Flow: 
  1. FNB app requests quote
  2. FNB app creates delivery job
  3. Mock server auto-advances status every 2 seconds
  4. Mock server calls webhook when delivered
Simulation: pending → driver_assigned → picked_up → in_transit → delivered (0.2 sec each)
NO persistent storage — in-memory only (resets on restart).
"""

import uuid
import random
import time
import asyncio
import httpx
from datetime import datetime, timezone
from fastapi import FastAPI, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Optional, List
import uvicorn

app = FastAPI(title="Mock 3rd Party Delivery API", version="1.0.0")

# In-memory storage (stateless - resets on restart)
deliveries = {}
webhooks = {}  # delivery_id -> callback_url

DELIVERY_STATES = ["pending", "driver_assigned", "picked_up", "in_transit", "delivered"]
DRIVER_NAMES = ["Ahmad R.", "Lee K.", "Siti N.", "Raj M.", "Fatimah A.", "Wei L.", "Ahmed Z.", "Michelle T."]
VEHICLE_TYPES = ["motorcycle", "car", "bicycle"]


class QuoteRequest(BaseModel):
    store_id: int
    address: str
    lat: Optional[float] = None
    lng: Optional[float] = None


class CreateDeliveryRequest(BaseModel):
    order_id: str
    store_id: int
    address: str
    lat: Optional[float] = None
    lng: Optional[float] = None
    items: Optional[list] = []
    webhook_url: Optional[str] = None


class CallbackRequest(BaseModel):
    status: str
    driver_id: Optional[str] = None
    driver_name: Optional[str] = None
    eta_minutes: Optional[int] = None
    notes: Optional[str] = None


class WebhookRegisterRequest(BaseModel):
    delivery_id: str
    callback_url: str


async def auto_advance_delivery(delivery_id: str):
    """
    Auto-advance delivery status with fast simulation.
    Status flow: pending → driver_assigned → picked_up → in_transit → delivered
    Each transition takes 0.2 seconds (fast simulation).
    """
    states_sequence = [
        ("driver_assigned", {"driver_id": f"DRV-{random.randint(100,999)}", "driver_name": random.choice(DRIVER_NAMES), "eta_minutes": random.randint(5, 15)}),
        ("picked_up", {"eta_minutes": random.randint(20, 40)}),
        ("in_transit", {"eta_minutes": random.randint(10, 25)}),
        ("delivered", {}),
    ]
    
    for new_status, extras in states_sequence:
        await asyncio.sleep(0.2)  # Fast simulation
        
        if delivery_id not in deliveries:
            return
        
        d = deliveries[delivery_id]
        d["status"] = new_status
        d["updated_at"] = datetime.now(timezone.utc).isoformat()
        
        if "driver_id" in extras:
            d["driver_id"] = extras["driver_id"]
        if "driver_name" in extras:
            d["driver_name"] = extras["driver_name"]
        if "eta_minutes" in extras:
            d["eta_minutes"] = extras["eta_minutes"]
        
        d["events"].append({
            "status": new_status,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "notes": f"Auto-simulated transition to {new_status}",
        })
        
        # Call webhook if registered
        if delivery_id in webhooks:
            callback_url = webhooks[delivery_id]
            try:
                async with httpx.AsyncClient() as client:
                    await client.post(callback_url, json={
                        "delivery_id": delivery_id,
                        "order_id": d["order_id"],
                        "status": new_status,
                        "driver_name": d.get("driver_name"),
                        "eta_minutes": d.get("eta_minutes"),
                        "timestamp": datetime.now(timezone.utc).isoformat()
                    }, timeout=5.0)
            except Exception as e:
                print(f"[MOCK DELIVERY] Webhook call failed for {delivery_id}: {e}")


@app.get("/health")
def health():
    """Health check endpoint."""
    return {"status": "healthy", "service": "mock_delivery_provider", "active_deliveries": len(deliveries)}


@app.post("/delivery/quote")
def get_quote(req: QuoteRequest):
    """Get delivery quote based on store and distance."""
    base_fee = 8.00
    distance_factor = random.uniform(0.5, 2.0)
    fee = round(base_fee * distance_factor, 2)
    eta_min = random.randint(25, 55)
    
    return {
        "quote_id": str(uuid.uuid4()),
        "fee": fee,
        "currency": "MYR",
        "eta_minutes": eta_min,
        "distance_km": round(random.uniform(2.0, 15.0), 1),
        "valid_for_seconds": 900,
    }


@app.post("/delivery/create")
def create_delivery(req: CreateDeliveryRequest, background_tasks: BackgroundTasks):
    """Create a new delivery job. Auto-starts delivery simulation."""
    delivery_id = f"DEL-{uuid.uuid4().hex[:12].upper()}"
    
    delivery = {
        "delivery_id": delivery_id,
        "order_id": req.order_id,
        "store_id": req.store_id,
        "address": req.address,
        "lat": req.lat,
        "lng": req.lng,
        "status": "pending",
        "driver_id": None,
        "driver_name": None,
        "vehicle_type": random.choice(VEHICLE_TYPES),
        "eta_minutes": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "events": [{"status": "pending", "timestamp": datetime.now(timezone.utc).isoformat(), "notes": "Delivery job created"}],
    }
    deliveries[delivery_id] = delivery
    
    # Register webhook if provided
    if req.webhook_url:
        webhooks[delivery_id] = req.webhook_url
    
    # Start auto-advance simulation
    background_tasks.add_task(auto_advance_delivery, delivery_id)
    
    return {
        "delivery_id": delivery_id,
        "status": "pending",
        "fee": round(random.uniform(6.0, 15.0), 2),
        "currency": "MYR",
        "eta_minutes": random.randint(25, 55),
        "message": "Delivery job created successfully",
    }


@app.get("/delivery/{delivery_id}/status")
def get_status(delivery_id: str):
    """Get current status of a delivery."""
    if delivery_id not in deliveries:
        raise HTTPException(status_code=404, detail="Delivery not found")
    return deliveries[delivery_id]


@app.post("/delivery/{delivery_id}/callback")
def status_callback(delivery_id: str, cb: CallbackRequest):
    """Receive status callback from driver/app (manual update)."""
    if delivery_id not in deliveries:
        raise HTTPException(status_code=404, detail="Delivery not found")
    
    d = deliveries[delivery_id]
    old_status = d["status"]
    
    if cb.status not in DELIVERY_STATES:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {DELIVERY_STATES}")
    
    d["status"] = cb.status
    d["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    if cb.driver_id:
        d["driver_id"] = cb.driver_id
    if cb.driver_name:
        d["driver_name"] = cb.driver_name
    if cb.eta_minutes is not None:
        d["eta_minutes"] = cb.eta_minutes
    
    event = {
        "status": cb.status,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "notes": cb.notes or f"Status changed from {old_status} to {cb.status}",
    }
    d["events"].append(event)
    
    return {"success": True, "delivery_id": delivery_id, "new_status": cb.status}


@app.post("/webhook/register")
def register_webhook(req: WebhookRegisterRequest):
    """Register a webhook URL for delivery status updates."""
    if req.delivery_id not in deliveries:
        raise HTTPException(status_code=404, detail="Delivery not found")
    
    webhooks[req.delivery_id] = req.callback_url
    return {"message": "Webhook registered", "delivery_id": req.delivery_id}


@app.post("/delivery/{delivery_id}/simulate-complete")
def simulate_complete(delivery_id: str):
    """Manually trigger fast simulation to completion."""
    if delivery_id not in deliveries:
        raise HTTPException(status_code=404, detail="Delivery not found")
    
    d = deliveries[delivery_id]
    
    states_sequence = [
        ("driver_assigned", {"driver_id": f"DRV-{random.randint(100,999)}", "driver_name": random.choice(DRIVER_NAMES), "eta_minutes": random.randint(5, 15)}),
        ("picked_up", {"eta_minutes": random.randint(20, 40)}),
        ("in_transit", {"eta_minutes": random.randint(10, 25)}),
        ("delivered", {}),
    ]
    
    for new_status, extras in states_sequence:
        time.sleep(0.1)  # Very fast for manual trigger
        d["status"] = new_status
        d["updated_at"] = datetime.now(timezone.utc).isoformat()
        if "driver_id" in extras:
            d["driver_id"] = extras["driver_id"]
        if "driver_name" in extras:
            d["driver_name"] = extras["driver_name"]
        if "eta_minutes" in extras:
            d["eta_minutes"] = extras["eta_minutes"]
        d["events"].append({
            "status": new_status,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "notes": f"Manual simulation to {new_status}",
        })
    
    return {
        "delivery_id": delivery_id,
        "status": "delivered",
        "completed_at": datetime.now(timezone.utc).isoformat(),
        "message": "Delivery simulation completed",
    }


@app.get("/deliveries")
def list_deliveries():
    """List all active deliveries (for debugging)."""
    return {"deliveries": list(deliveries.values()), "total": len(deliveries)}


if __name__ == "__main__":
    print("="*60)
    print("  Mock 3rd Party Delivery Server")
    print("  Fast simulation mode (0.2 sec per status)")
    print("="*60)
    print()
    print("Endpoints:")
    print("  POST /delivery/quote              - Get delivery quote")
    print("  POST /delivery/create             - Create delivery job")
    print("  GET  /delivery/{id}/status        - Check delivery status")
    print("  POST /delivery/{id}/callback      - Manual status update")
    print("  POST /delivery/{id}/simulate-complete - Fast simulate to delivered")
    print("  POST /webhook/register            - Register webhook")
    print("  GET  /health                      - Health check")
    print("  GET  /deliveries                  - List all deliveries")
    print()
    uvicorn.run(app, host="0.0.0.0", port=8888)
