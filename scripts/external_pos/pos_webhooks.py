"""
POS WEBHOOKS: pos_webhooks.py
Purpose: Webhook receiver for POS callbacks to update FNB order status
Status: Receives POS callbacks and updates FNB app via API

This is run as a separate service that listens for POS webhooks and updates
the FNB order status accordingly. For seed script testing, this runs inline.

POS Integration Flow:
  1. POS receives order from FNB (dine-in)
  2. POS simulates kitchen workflow
  3. POS calls webhook to FNB: status=preparing
  4. POS calls webhook: status=ready
  5. POS calls webhook: status=completed → FNB updates order, frees table
"""

import sys
import os
import requests
from fastapi import FastAPI, Request, HTTPException
from pydantic import BaseModel
from typing import Optional
import uvicorn

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "seed"))
from shared_config import api_patch, admin_token

FNB_API_BASE = os.environ.get("FNB_API_BASE", "https://admin.loyaltysystem.uk/api/v1")

app = FastAPI(title="POS Webhook Receiver")

pos_webhook_logs = []


class POSWebhookPayload(BaseModel):
    pos_order_id: str
    order_id: str
    status: str
    timestamp: str
    table_id: Optional[int] = None
    notes: Optional[str] = None


@app.post("/api/v1/pos/webhook")
async def receive_pos_webhook(payload: POSWebhookPayload):
    print(f"[POS WEBHOOK] Received: pos_order_id={payload.pos_order_id}, order_id={payload.order_id}, status={payload.status}")
    
    webhook_entry = {
        "pos_order_id": payload.pos_order_id,
        "order_id": payload.order_id,
        "status": payload.status,
        "timestamp": payload.timestamp,
        "table_id": payload.table_id,
        "received_at": __import__("datetime").datetime.now().isoformat(),
    }
    pos_webhook_logs.append(webhook_entry)
    
    admin_tok = admin_token()
    
    status_mapping = {
        "preparing": "preparing",
        "ready": "ready",
        "completed": "completed",
    }
    
    if payload.status in status_mapping:
        new_status = status_mapping[payload.status]
        status_payload = {"status": new_status}
        
        if new_status == "completed":
            from datetime import datetime, timezone
            status_payload["completed_at"] = datetime.now(timezone.utc).isoformat()
        
        resp = api_patch(f"/orders/{payload.order_id}/status", token=admin_tok, json=status_payload)
        
        if resp.status_code == 200:
            print(f"  [OK] Updated FNB order {payload.order_id} to status={new_status}")
            return {"success": True, "message": f"Order {payload.order_id} updated to {new_status}"}
        else:
            print(f"  [ERROR] Failed to update order {payload.order_id}: {resp.status_code} {resp.text[:100]}")
            return {"success": False, "message": f"Failed to update order: {resp.status_code}"}
    
    return {"success": True, "message": "Webhook processed"}


@app.get("/api/v1/pos/webhook/logs")
def get_webhook_logs():
    return {"logs": pos_webhook_logs, "total": len(pos_webhook_logs)}


@app.get("/health")
def health():
    return {"status": "ok", "service": "pos_webhook_receiver"}


if __name__ == "__main__":
    print("Starting POS Webhook Receiver on http://localhost:8001")
    print("  Endpoint: POST /api/v1/pos/webhook")
    print("  Logs: GET /api/v1/pos/webhook/logs")
    uvicorn.run(app, host="0.0.0.0", port=8001)