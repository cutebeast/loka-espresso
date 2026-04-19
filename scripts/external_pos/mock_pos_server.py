"""
MOCK POS SERVER: mock_pos_server.py
Purpose: Simulate external POS system API for dine-in order integration
Status: Fast simulation (seconds), in-memory storage
Dine-in orders: Staff takes order at table → sends to POS → POS processes → webhooks update FNB

Flow:
  1. FNB sends order to POS via POST /pos/order/receive
  2. POS stores order, calls webhook: status=preparing
  3. POS fast-simulates kitchen (2 sec)
  4. POS calls webhook: status=ready
  5. POS calls webhook: status=completed
  6. Table automatically freed on completion
"""

import uuid
import random
import time
import threading
from datetime import datetime
from fastapi import FastAPI, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Optional, List
import uvicorn

app = FastAPI(title="Mock External POS System API")

POS_STATES = ["received", "preparing", "ready", "completed", "cancelled"]

pos_orders = {}
registered_webhooks = []
webhook_url = "http://localhost:8000/api/v1/pos/webhook"


class OrderReceiveRequest(BaseModel):
    order_id: str
    store_id: int
    table_id: int
    items: List[dict]
    total: float
    customer_name: Optional[str] = None
    order_type: str = "dine_in"


class WebhookRegisterRequest(BaseModel):
    callback_url: str
    store_id: Optional[int] = None


class StatusUpdateRequest(BaseModel):
    status: str
    notes: Optional[str] = None


def call_webhook(payload: dict):
    import requests
    try:
        requests.post(webhook_url, json=payload, timeout=10)
    except Exception as e:
        print(f"Webhook call failed: {e}")


def simulate_kitchen_workflow(pos_order_id: str):
    time.sleep(2)
    if pos_order_id in pos_orders:
        pos_orders[pos_order_id]["status"] = "preparing"
        pos_orders[pos_order_id]["updated_at"] = datetime.now().isoformat()
        call_webhook({
            "pos_order_id": pos_order_id,
            "order_id": pos_orders[pos_order_id]["fnb_order_id"],
            "status": "preparing",
            "timestamp": datetime.now().isoformat(),
        })
    
    time.sleep(2)
    if pos_order_id in pos_orders:
        pos_orders[pos_order_id]["status"] = "ready"
        pos_orders[pos_order_id]["updated_at"] = datetime.now().isoformat()
        call_webhook({
            "pos_order_id": pos_order_id,
            "order_id": pos_orders[pos_order_id]["fnb_order_id"],
            "status": "ready",
            "timestamp": datetime.now().isoformat(),
        })
    
    time.sleep(1)
    if pos_order_id in pos_orders:
        pos_orders[pos_order_id]["status"] = "completed"
        pos_orders[pos_order_id]["updated_at"] = datetime.now().isoformat()
        call_webhook({
            "pos_order_id": pos_order_id,
            "order_id": pos_orders[pos_order_id]["fnb_order_id"],
            "status": "completed",
            "timestamp": datetime.now().isoformat(),
            "table_id": pos_orders[pos_order_id]["table_id"],
        })


@app.get("/health")
def health():
    return {"status": "ok", "service": "mock_external_pos"}


@app.post("/pos/order/receive")
def receive_order(req: OrderReceiveRequest, background_tasks: BackgroundTasks):
    pos_order_id = f"POS-{uuid.uuid4().hex[:12].upper()}"
    
    order = {
        "pos_order_id": pos_order_id,
        "fnb_order_id": req.order_id,
        "store_id": req.store_id,
        "table_id": req.table_id,
        "items": req.items,
        "total": req.total,
        "customer_name": req.customer_name,
        "order_type": req.order_type,
        "status": "received",
        "created_at": datetime.now().isoformat(),
        "updated_at": datetime.now().isoformat(),
        "events": [{"status": "received", "timestamp": datetime.now().isoformat(), "notes": "Order received from FNB"}],
    }
    pos_orders[pos_order_id] = order
    
    background_tasks.add_task(simulate_kitchen_workflow, pos_order_id)
    
    return {
        "pos_order_id": pos_order_id,
        "status": "received",
        "message": "Order received, kitchen notified",
        "estimated_time_minutes": 5,
    }


@app.get("/pos/order/{pos_order_id}/status")
def get_order_status(pos_order_id: str):
    if pos_order_id not in pos_orders:
        raise HTTPException(status_code=404, detail="POS order not found")
    return pos_orders[pos_order_id]


@app.post("/pos/order/{pos_order_id}/update")
def update_order_status(pos_order_id: str, req: StatusUpdateRequest):
    if pos_order_id not in pos_orders:
        raise HTTPException(status_code=404, detail="POS order not found")
    
    if req.status not in POS_STATES:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {POS_STATES}")
    
    order = pos_orders[pos_order_id]
    old_status = order["status"]
    order["status"] = req.status
    order["updated_at"] = datetime.now().isoformat()
    
    event = {
        "status": req.status,
        "timestamp": datetime.now().isoformat(),
        "notes": req.notes or f"Status changed from {old_status} to {req.status}",
    }
    order["events"].append(event)
    
    return {"success": True, "pos_order_id": pos_order_id, "new_status": req.status}


@app.post("/pos/payment/confirm")
def confirm_payment(pos_order_id: str):
    if pos_order_id not in pos_orders:
        raise HTTPException(status_code=404, detail="POS order not found")
    
    order = pos_orders[pos_order_id]
    order["payment_confirmed"] = True
    order["payment_confirmed_at"] = datetime.now().isoformat()
    order["events"].append({
        "status": "payment_confirmed",
        "timestamp": datetime.now().isoformat(),
        "notes": "Payment confirmed by POS",
    })
    
    return {"success": True, "pos_order_id": pos_order_id, "message": "Payment confirmed"}


@app.post("/pos/order/{pos_order_id}/complete")
def complete_order(pos_order_id: str):
    if pos_order_id not in pos_orders:
        raise HTTPException(status_code=404, detail="POS order not found")
    
    order = pos_orders[pos_order_id]
    order["status"] = "completed"
    order["completed_at"] = datetime.now().isoformat()
    order["updated_at"] = datetime.now().isoformat()
    order["events"].append({
        "status": "completed",
        "timestamp": datetime.now().isoformat(),
        "notes": "Order completed",
    })
    
    return {"success": True, "pos_order_id": pos_order_id, "message": "Order completed"}


@app.post("/pos/webhook/register")
def register_webhook(req: WebhookRegisterRequest):
    webhook_entry = {
        "callback_url": req.callback_url,
        "store_id": req.store_id,
        "registered_at": datetime.now().isoformat(),
    }
    registered_webhooks.append(webhook_entry)
    
    return {"success": True, "webhook_id": len(registered_webhooks), "message": "Webhook registered"}


@app.get("/pos/webhooks")
def list_webhooks():
    return {"webhooks": registered_webhooks, "total": len(registered_webhooks)}


@app.get("/pos/orders")
def list_orders(store_id: Optional[int] = None):
    if store_id is not None:
        filtered = [o for o in pos_orders.values() if o["store_id"] == store_id]
        return {"orders": filtered, "total": len(filtered)}
    return {"orders": list(pos_orders.values()), "total": len(pos_orders)}


if __name__ == "__main__":
    print("Starting Mock External POS Server on http://localhost:8081")
    uvicorn.run(app, host="0.0.0.0", port=8081)