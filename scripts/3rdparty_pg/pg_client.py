"""
PAYMENT GATEWAY CLIENT: pg_client.py
Purpose: Client library for seed scripts to interact with mock PG
Status: CERTIFIED-2026-04-19 | Client for mock Payment Gateway API
Dependencies: requests library
Functions:
  - create_charge(amount, user_id, user_email, description, callback_url)
  - confirm_payment(charge_id, simulate_success=True)
  - get_charge_status(charge_id)
  - register_webhook(charge_id, callback_url)
  - wait_for_payment_completion(charge_id, timeout=30)
  - process_topup_with_pg(amount, user_id, user_email, user_name, callback_url)
NO direct DB inserts — ALL via API calls to mock PG server.
"""

import os
import time
import requests

# Mock PG server endpoint
PG_API_BASE = os.environ.get("PG_API_BASE", "http://localhost:8889")


def create_charge(
    amount: float,
    user_id: int,
    user_email: str,
    user_name: str,
    description: str = "Wallet Topup",
    callback_url: str = None,
    payment_method: dict = None
) -> dict:
    """
    Create a payment charge with the mock PG.
    
    Returns:
        dict with charge_id, status, checkout_url
    """
    payload = {
        "amount": amount,
        "currency": "MYR",
        "description": description,
        "user_id": user_id,
        "user_email": user_email,
        "user_name": user_name,
        "callback_url": callback_url,
    }
    
    if payment_method:
        payload["payment_method"] = payment_method
    
    resp = requests.post(f"{PG_API_BASE}/pg/charge", json=payload, timeout=10)
    if resp.status_code == 200:
        return resp.json()
    else:
        raise Exception(f"Create charge failed: {resp.status_code} {resp.text}")


def confirm_payment(charge_id: str, simulate_success: bool = True) -> dict:
    """
    Confirm/simulate payment completion.
    
    Args:
        charge_id: The charge ID to confirm
        simulate_success: True for success, False for failure testing
    
    Returns:
        dict with charge_id, status, message
    """
    payload = {
        "charge_id": charge_id,
        "simulate_success": simulate_success
    }
    
    resp = requests.post(f"{PG_API_BASE}/pg/confirm", json=payload, timeout=10)
    if resp.status_code == 200:
        return resp.json()
    else:
        raise Exception(f"Confirm payment failed: {resp.status_code} {resp.text}")


def get_charge_status(charge_id: str) -> dict:
    """Get current status of a payment charge."""
    resp = requests.get(f"{PG_API_BASE}/pg/charge/{charge_id}/status", timeout=10)
    if resp.status_code == 200:
        return resp.json()
    else:
        raise Exception(f"Get charge status failed: {resp.status_code} {resp.text}")


def register_webhook(charge_id: str, callback_url: str) -> dict:
    """Register webhook for payment status updates."""
    payload = {
        "charge_id": charge_id,
        "callback_url": callback_url
    }
    
    resp = requests.post(f"{PG_API_BASE}/pg/webhook/register", json=payload, timeout=10)
    if resp.status_code == 200:
        return resp.json()
    else:
        raise Exception(f"Register webhook failed: {resp.status_code} {resp.text}")


def wait_for_payment_completion(charge_id: str, timeout: int = 30, poll_interval: float = 0.5) -> dict:
    """
    Poll charge status until completed/failed or timeout.
    
    Args:
        charge_id: The charge ID to check
        timeout: Maximum seconds to wait
        poll_interval: Seconds between polls
    
    Returns:
        dict with final charge status
    """
    elapsed = 0
    while elapsed < timeout:
        status_data = get_charge_status(charge_id)
        status = status_data.get("status")
        
        if status in ["completed", "failed"]:
            return status_data
        
        time.sleep(poll_interval)
        elapsed += poll_interval
    
    raise TimeoutError(f"Payment {charge_id} did not complete within {timeout}s")


def process_topup_with_pg(
    amount: float,
    user_id: int,
    user_email: str,
    user_name: str,
    callback_url: str = None,
    wait_for_completion: bool = True
) -> dict:
    """
    Complete flow: Create charge → Confirm → Wait for completion.
    
    Args:
        amount: Amount to charge (RM)
        user_id: User ID
        user_email: User email
        user_name: User name
        callback_url: Optional webhook URL
        wait_for_completion: If True, waits for payment to complete
    
    Returns:
        dict with charge_id, status, amount, and final status details
    """
    # Step 1: Create charge
    charge = create_charge(
        amount=amount,
        user_id=user_id,
        user_email=user_email,
        user_name=user_name,
        description="Wallet Topup via PG",
        callback_url=callback_url
    )
    
    charge_id = charge["charge_id"]
    
    # Step 2: Confirm payment (simulate user completing payment)
    confirm_result = confirm_payment(charge_id, simulate_success=True)
    
    if not wait_for_completion:
        return {
            "charge_id": charge_id,
            "status": "processing",
            "amount": amount,
            "message": "Payment processing started"
        }
    
    # Step 3: Wait for completion
    final_status = wait_for_payment_completion(charge_id)
    
    return {
        "charge_id": charge_id,
        "status": final_status.get("status"),
        "amount": amount,
        "paid_at": final_status.get("paid_at"),
        "receipt_url": final_status.get("receipt_url"),
    }


def check_pg_health() -> bool:
    """Check if mock PG server is healthy."""
    try:
        resp = requests.get(f"{PG_API_BASE}/health", timeout=5)
        return resp.status_code == 200
    except Exception:
        return False


if __name__ == "__main__":
    print("Mock Payment Gateway Client - Testing connectivity...")
    print("="*50)
    
    if check_pg_health():
        print(f"✓ PG server is healthy at {PG_API_BASE}")
    else:
        print(f"✗ PG server not reachable at {PG_API_BASE}")
        print("  Start server with: python3 mock_pg_server.py")
        exit(1)
    
    print("\nAvailable functions:")
    print("  create_charge(amount, user_id, user_email, user_name, ...)")
    print("  confirm_payment(charge_id, simulate_success=True)")
    print("  get_charge_status(charge_id)")
    print("  register_webhook(charge_id, callback_url)")
    print("  wait_for_payment_completion(charge_id, timeout=30)")
    print("  process_topup_with_pg(amount, user_id, user_email, user_name, ...)")
    print("  check_pg_health()")
    print("\n✓ PG client ready")
