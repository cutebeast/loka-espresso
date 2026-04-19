"""
DELIVERY CLIENT: delivery_client.py
Purpose: Client library for seed scripts to interact with mock delivery server
Status: CERTIFIED-2026-04-18 | Client for mock 3rd party delivery API
Dependencies: requests library
Functions:
  - get_delivery_quote(store_id, address, lat, lng)
  - create_delivery(order_id, store_id, address, lat, lng, items)
  - track_delivery(delivery_id)
  - simulate_delivery_completion(delivery_id)
  - update_delivery_status(delivery_id, status, ...)
  - get_random_address()
  - create_delivery_for_order(order_id, store_id)
NO direct DB inserts — ALL via API calls to mock server.
"""

import requests
import json
import os
import random

MOCK_API_BASE = os.environ.get("DELIVERY_API_BASE", "http://localhost:8888")

DIR = os.path.dirname(os.path.abspath(__file__))
ADDRESSES_FILE = os.path.join(DIR, "sample_addresses.json")

_addresses_cache = None


def get_sample_addresses():
    """Load sample addresses from JSON file."""
    global _addresses_cache
    if _addresses_cache is None:
        with open(ADDRESSES_FILE) as f:
            _addresses_cache = json.load(f)
    return _addresses_cache


def get_delivery_quote(store_id: int, address: str, lat: float = None, lng: float = None):
    """Get delivery quote from mock provider."""
    resp = requests.post(f"{MOCK_API_BASE}/delivery/quote", json={
        "store_id": store_id,
        "address": address,
        "lat": lat,
        "lng": lng,
    }, timeout=10)
    if resp.status_code == 200:
        return resp.json()
    return None


def create_delivery(order_id: str, store_id: int, address: str, lat: float = None, lng: float = None, items: list = None, webhook_url: str = None):
    """Create a delivery job with mock provider."""
    payload = {
        "order_id": order_id,
        "store_id": store_id,
        "address": address,
        "lat": lat,
        "lng": lng,
        "items": items or [],
    }
    if webhook_url:
        payload["webhook_url"] = webhook_url
    
    resp = requests.post(f"{MOCK_API_BASE}/delivery/create", json=payload, timeout=10)
    if resp.status_code == 200:
        return resp.json()
    return None


def track_delivery(delivery_id: str):
    """Get current status of a delivery."""
    resp = requests.get(f"{MOCK_API_BASE}/delivery/{delivery_id}/status", timeout=10)
    if resp.status_code == 200:
        return resp.json()
    return None


def simulate_delivery_completion(delivery_id: str):
    """Manually trigger fast simulation to completion."""
    resp = requests.post(f"{MOCK_API_BASE}/delivery/{delivery_id}/simulate-complete", timeout=30)
    if resp.status_code == 200:
        return resp.json()
    return None


def update_delivery_status(delivery_id: str, status: str, driver_id: str = None, driver_name: str = None, eta_minutes: int = None, notes: str = None):
    """Manually update delivery status (callback simulation)."""
    resp = requests.post(f"{MOCK_API_BASE}/delivery/{delivery_id}/callback", json={
        "status": status,
        "driver_id": driver_id,
        "driver_name": driver_name,
        "eta_minutes": eta_minutes,
        "notes": notes,
    }, timeout=10)
    if resp.status_code == 200:
        return resp.json()
    return None


def register_webhook(delivery_id: str, callback_url: str):
    """Register webhook for delivery status updates."""
    resp = requests.post(f"{MOCK_API_BASE}/webhook/register", json={
        "delivery_id": delivery_id,
        "callback_url": callback_url,
    }, timeout=10)
    if resp.status_code == 200:
        return resp.json()
    return None


def get_random_address():
    """Get a random sample address for testing."""
    addresses = get_sample_addresses()
    return random.choice(addresses)


def create_delivery_for_order(order_id: str, store_id: int, address: str = None, lat: float = None, lng: float = None, webhook_url: str = None):
    """
    Convenience function: Get quote + create delivery with random address if not provided.
    Returns delivery data or None on failure.
    """
    if address is None:
        addr_data = get_random_address()
        address = addr_data["address"]
        lat = addr_data.get("lat")
        lng = addr_data.get("lng")
    
    quote = get_delivery_quote(store_id, address, lat, lng)
    if not quote:
        return None
    
    delivery = create_delivery(order_id, store_id, address, lat, lng, webhook_url=webhook_url)
    return delivery


def wait_for_delivery_status(delivery_id: str, target_status: str = "delivered", timeout: int = 30, poll_interval: float = 0.5):
    """
    Poll delivery status until target status is reached or timeout.
    
    Args:
        delivery_id: The delivery ID to check
        target_status: Status to wait for (default: "delivered")
        timeout: Maximum seconds to wait
        poll_interval: Seconds between polls
    
    Returns:
        dict with delivery status or None if timeout
    """
    import time
    elapsed = 0
    while elapsed < timeout:
        status_data = track_delivery(delivery_id)
        if status_data and status_data.get("status") == target_status:
            return status_data
        time.sleep(poll_interval)
        elapsed += poll_interval
    return None


if __name__ == "__main__":
    print("Mock Delivery Client - Testing connectivity...")
    print("="*60)
    
    try:
        resp = requests.get(f"{MOCK_API_BASE}/health", timeout=5)
        print(f"✓ Server health: {resp.json()}")
    except Exception as e:
        print(f"✗ Server not reachable: {e}")
        print(f"  Start server with: python3 mock_delivery_server.py")
        exit(1)
    
    print("\n  Available functions:")
    print("    get_delivery_quote(store_id, address, lat, lng)")
    print("    create_delivery(order_id, store_id, address, lat, lng, items, webhook_url)")
    print("    track_delivery(delivery_id)")
    print("    simulate_delivery_completion(delivery_id)")
    print("    update_delivery_status(delivery_id, status, ...)")
    print("    register_webhook(delivery_id, callback_url)")
    print("    get_random_address()")
    print("    create_delivery_for_order(order_id, store_id)")
    print("    wait_for_delivery_status(delivery_id, target_status)")
    print("\n✓ Delivery client ready")
