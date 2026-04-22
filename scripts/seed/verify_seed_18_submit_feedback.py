"""
SEED SCRIPT: verify_seed_18_submit_feedback.py
Purpose: Submit customer feedback via the public PWA feedback API to test the endpoint.
APIs tested:
  - POST /feedback (customer submits feedback with rating, comment, store_id)
Status: CERTIFIED-2026-04-19 | Tests customer feedback submission from PWA
Dependencies: verify_seed_01_stores.py, verify_seed_10_register.py
Usage:
  python3 verify_seed_18_submit_feedback.py
NO direct DB access — ALL via API calls.
"""

import sys
import os
import json
import random

SEED_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SEED_DIR)

from shared_config import (
    API_BASE, admin_token, api_get, api_post,
    save_state, load_state, print_header,
    get_customer_token_for_user
)

FEEDBACK_TEMPLATES = [
    {"rating": 5, "comment": "Excellent service! The staff was very friendly and the food was delicious."},
    {"rating": 4, "comment": "Great experience overall. Coffee was perfect, will definitely come back."},
    {"rating": 5, "comment": "Love the ambiance! Perfect spot for a quick coffee break."},
    {"rating": 3, "comment": "Food was good but the wait time was a bit long during peak hours."},
    {"rating": 4, "comment": "Nice place. The pastries are amazing. Would recommend the croissants."},
    {"rating": 5, "comment": "Best coffee in town! The baristas really know their craft."},
    {"rating": 2, "comment": "The order was wrong and had to wait for a replacement. Disappointing."},
    {"rating": 4, "comment": "Clean and cozy environment. Good WiFi for remote work."},
    {"rating": 5, "comment": "Outstanding! The loyalty rewards program is a great touch."},
    {"rating": 3, "comment": "Decent food. Prices are a bit high but the quality matches."},
    {"rating": 4, "comment": "The mobile ordering feature is very convenient. Saves a lot of time."},
    {"rating": 5, "comment": "My go-to coffee spot. Consistent quality every time."},
    {"rating": 1, "comment": "Very disappointed. The drink was cold and the service was rude."},
    {"rating": 4, "comment": "Good variety of menu items. The seasonal specials are always interesting."},
    {"rating": 5, "comment": "Fantastic! The staff remembered my usual order. Great personal touch."},
]

STORE_IDS = [2, 3, 4, 5, 6]


def submit_feedback(customer_token, store_id, rating, comment):
    """Submit feedback via the public PWA API."""
    try:
        resp = api_post(
            "/feedback",
            token=customer_token,
            json={
                "store_id": store_id,
                "rating": rating,
                "comment": comment,
            }
        )
        if resp.status_code in (200, 201):
            data = resp.json()
            return True, data, None
        return False, None, f"POST /feedback failed: {resp.status_code} - {resp.text[:100]}"
    except Exception as e:
        return False, None, str(e)


def run():
    """Submit feedback from registered customers."""
    print_header("STEP 18: Customer Feedback Submission (PWA API Test)")

    # Get admin token to list customers
    print("Authenticating as admin...")
    tok = admin_token()
    if not tok:
        print("✗ Failed to get admin token")
        sys.exit(1)

    # Load customers from state
    customers = load_state("customers")
    if not customers:
        print("✗ No customers found in state. Run verify_seed_10_register.py first.")
        sys.exit(1)

    print(f"✓ Admin authenticated. Found {len(customers)} customers in state.")

    # Filter customers that have valid tokens
    customers_with_tokens = [c for c in customers if c.get("token")]
    if not customers_with_tokens:
        print("✗ No customers with valid tokens. Run verify_seed_10_register.py first.")
        sys.exit(1)

    print(f"✓ {len(customers_with_tokens)} customers have valid tokens.")

    # Submit feedback from each customer (1-3 feedbacks per customer)
    results = []
    total_submitted = 0
    total_failed = 0

    for customer in customers_with_tokens:
        user_id = customer.get("user_id")
        customer_token = customer.get("token")
        customer_name = customer.get("name", f"User {user_id}")

        # Each customer submits 1-3 feedbacks
        num_feedbacks = random.randint(1, 3)
        for i in range(num_feedbacks):
            store_id = random.choice(STORE_IDS)
            template = random.choice(FEEDBACK_TEMPLATES)
            rating = template["rating"]
            comment = template["comment"]

            print(f"\n  Submitting feedback for {customer_name} (user_id={user_id})...")
            print(f"    Store ID: {store_id}, Rating: {rating}/5")
            print(f"    Comment: {comment[:60]}...")

            success, data, err = submit_feedback(customer_token, store_id, rating, comment)
            if success:
                feedback_id = data.get("id", "?")
                print(f"    ✓ Feedback submitted (ID={feedback_id})")
                results.append({
                    "customer_id": user_id,
                    "customer_name": customer_name,
                    "store_id": store_id,
                    "rating": rating,
                    "feedback_id": feedback_id,
                })
                total_submitted += 1
            else:
                print(f"    ✗ Failed: {err}")
                total_failed += 1

    # Summary
    print(f"\n{'='*60}")
    print("  SUMMARY")
    print(f"{'='*60}")
    print(f"  Total feedbacks submitted: {total_submitted}")
    print(f"  Failed: {total_failed}")

    # Save results to state
    save_state("feedback_submissions", results)
    print(f"\n  Results saved to seed_state.json")

    # Verify via admin API
    print("\n  Verifying via admin API...")
    try:
        resp = api_get("/admin/feedback?page_size=5", token=tok)
        if resp.status_code == 200:
            data = resp.json()
            feedbacks = data.get("items", []) if isinstance(data, dict) else data
            print(f"  ✓ Admin API returned {len(feedbacks)} feedback entries")
            if feedbacks:
                avg_rating = sum(f.get("rating", 0) for f in feedbacks) / len(feedbacks)
                print(f"  ✓ Average rating: {avg_rating:.1f}/5")
    except Exception as e:
        print(f"  ⚠ Could not verify via admin API: {e}")

    if total_failed > 0:
        sys.exit(1)
    sys.exit(0)


if __name__ == "__main__":
    run()
