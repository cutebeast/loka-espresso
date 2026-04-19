"""
POS CLIENT: pos_client.py
Purpose: Client library for FNB app to interact with mock POS system
Status: For dine-in orders only (pickup orders use online payment - no POS)
"""

import requests
import os

MOCK_POS_API_BASE = os.environ.get("POS_API_BASE", "http://localhost:8081")


def send_order_to_pos(order_id: str, store_id: int, table_id: int, items: list, total: float, customer_name: str = None):
    resp = requests.post(
        f"{MOCK_POS_API_BASE}/pos/order/receive",
        json={
            "order_id": order_id,
            "store_id": store_id,
            "table_id": table_id,
            "items": items,
            "total": total,
            "customer_name": customer_name,
            "order_type": "dine_in",
        },
        timeout=10
    )
    if resp.status_code == 200:
        return resp.json()
    return None


def get_pos_order_status(pos_order_id: str):
    resp = requests.get(f"{MOCK_POS_API_BASE}/pos/order/{pos_order_id}/status", timeout=10)
    if resp.status_code == 200:
        return resp.json()
    return None


def update_pos_order_status(pos_order_id: str, status: str, notes: str = None):
    resp = requests.post(
        f"{MOCK_POS_API_BASE}/pos/order/{pos_order_id}/update",
        json={"status": status, "notes": notes},
        timeout=10
    )
    if resp.status_code == 200:
        return resp.json()
    return None


def confirm_pos_payment(pos_order_id: str):
    resp = requests.post(f"{MOCK_POS_API_BASE}/pos/payment/confirm", json={}, timeout=10)
    if resp.status_code == 200:
        return resp.json()
    return None


def complete_pos_order(pos_order_id: str):
    resp = requests.post(f"{MOCK_POS_API_BASE}/pos/order/{pos_order_id}/complete", json={}, timeout=10)
    if resp.status_code == 200:
        return resp.json()
    return None


def register_webhook(callback_url: str, store_id: int = None):
    resp = requests.post(
        f"{MOCK_POS_API_BASE}/pos/webhook/register",
        json={"callback_url": callback_url, "store_id": store_id},
        timeout=10
    )
    if resp.status_code == 200:
        return resp.json()
    return None


def list_pos_orders(store_id: int = None):
    url = f"{MOCK_POS_API_BASE}/pos/orders"
    if store_id is not None:
        url += f"?store_id={store_id}"
    resp = requests.get(url, timeout=10)
    if resp.status_code == 200:
        return resp.json()
    return None


if __name__ == "__main__":
    print("Mock POS Client - Testing connectivity...")
    
    try:
        resp = requests.get(f"{MOCK_POS_API_BASE}/health", timeout=5)
        print(f"  Server health: {resp.json()}")
    except Exception as e:
        print(f"  Server not reachable: {e}")
        print(f"  Start server with: python3 mock_pos_server.py")
    
    print("\n  Available functions:")
    print("    send_order_to_pos(order_id, store_id, table_id, items, total)")
    print("    get_pos_order_status(pos_order_id)")
    print("    update_pos_order_status(pos_order_id, status, notes)")
    print("    confirm_pos_payment(pos_order_id)")
    print("    complete_pos_order(pos_order_id)")
    print("    register_webhook(callback_url, store_id)")
    print("    list_pos_orders(store_id)")