"""
SEED SCRIPT: verify_seed_14_claim_vouchers.py
Purpose: Customer claims vouchers from promotional banners and surveys
APIs tested:
  - GET /promos/banners (list active promo banners)
  - GET /promos/banners/{id}/status (check if already claimed)
  - POST /promos/banners/{id}/claim (claim voucher from banner)
  - GET /admin/surveys (get available surveys - admin endpoint for seeding)
  - GET /surveys/{id} (get survey details for PWA)
  - POST /surveys/{id}/submit (submit survey answers, auto-grant voucher)
Status: READY FOR VERIFICATION
Dependencies: verify_seed_10_register.py (customers must exist), verify_seed_08_promotions.py (banners and surveys must exist)
Flow:
  Voucher Sources:
  1. Promo Banners - Customer claims directly from promotional banners
  2. Surveys - Customer completes survey, voucher auto-granted
  
  Process:
  - Get active promo banners
  - For each banner with voucher: Claim voucher
  - Get available surveys
  - For each survey: Get questions → Submit answers → Receive voucher
  
  Rules:
  - One voucher per banner per customer (max_uses_per_user enforced)
  - One survey submission per customer (duplicate prevented)
  - Voucher auto-generated with unique code per claim
Usage:
  python3 verify_seed_14_claim_vouchers.py
NO direct DB access — ALL via API calls.
"""

import sys
import os
import random

SEED_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SEED_DIR)

from shared_config import (
    API_BASE, api_post, api_get, save_state, load_state, print_header,
)


def get_active_promo_banners():
    """Get list of active promo banners from API."""
    try:
        resp = api_get("/promos/banners")
        if resp.status_code == 200:
            return resp.json()
        return []
    except Exception as e:
        print(f"    Error fetching banners: {e}")
        return []


def check_banner_status(banner_id, token):
    """Check if customer already claimed voucher from this banner."""
    try:
        resp = api_get(f"/promos/banners/{banner_id}/status", token=token)
        if resp.status_code == 200:
            data = resp.json()
            return data.get("already_claimed", False)
        return False
    except Exception:
        return False


def claim_voucher_from_banner(banner_id, token):
    """Claim voucher from a promo banner."""
    try:
        resp = api_post(f"/promos/banners/{banner_id}/claim", token=token)
        if resp.status_code in (200, 201):
            data = resp.json()
            if data.get("success"):
                return True, data.get("voucher_code"), None
            else:
                return False, None, data.get("message", "Claim failed")
        return False, None, f"HTTP {resp.status_code}"
    except Exception as e:
        return False, None, str(e)


def get_available_surveys(admin_token):
    """Get list of available surveys from admin API (for seed script)."""
    try:
        # Try to get surveys from admin endpoint
        resp = api_get("/admin/surveys", token=admin_token)
        if resp.status_code == 200:
            data = resp.json()
            surveys = data.get("surveys", [])
            # Filter active surveys with rewards (check reward_voucher_id is not None)
            result = []
            for s in surveys:
                if s.get("is_active"):
                    rv_id = s.get("reward_voucher_id")
                    if rv_id is not None and rv_id != "":
                        result.append(s)
            return result
        return []
    except Exception as e:
        print(f"    Error fetching surveys: {e}")
        return []


def get_survey_details(survey_id):
    """Get survey questions for submission."""
    try:
        resp = api_get(f"/surveys/{survey_id}")
        if resp.status_code == 200:
            return resp.json()
        return None
    except Exception:
        return None


def submit_survey(survey_id, answers, token):
    """Submit survey answers. Returns (success, voucher_code, message)."""
    try:
        resp = api_post(
            f"/surveys/{survey_id}/submit",
            token=token,
            json={"answers": answers}
        )
        if resp.status_code == 200:
            data = resp.json()
            if data.get("success"):
                voucher_code = data.get("voucher_code")
                if voucher_code:
                    return True, voucher_code, "Voucher granted!"
                else:
                    return True, None, "Submitted (no voucher)"
            elif data.get("already_submitted"):
                return False, None, "Already submitted"
            else:
                return False, None, data.get("message", "Submission failed")
        return False, None, f"HTTP {resp.status_code}"
    except Exception as e:
        return False, None, str(e)


def generate_survey_answers(survey_details):
    """Generate random answers for survey questions."""
    answers = []
    for q in survey_details.get("questions", []):
        q_type = q.get("question_type", "text")
        q_id = q.get("id")
        
        if q_type == "text":
            answer = "Great experience!"
        elif q_type == "rating":
            answer = str(random.randint(4, 5))
        elif q_type == "single_choice" or q_type == "dropdown":
            options = q.get("options", ["Option 1", "Option 2"])
            answer = random.choice(options) if options else "Option 1"
        else:
            answer = "Good"
        
        answers.append({"question_id": q_id, "answer_text": answer})
    
    return answers


def run():
    print_header("STEP 14: Claim Vouchers from Promos and Surveys")
    print("Flow: Promo Banners → Surveys → Vouchers added to wallet")
    print("Note: Survey-type banners link to surveys. Complete survey to get voucher.")
    print()
    
    customers = load_state("customers")
    if not customers:
        print("[ERROR] No customers. Run verify_seed_10_register.py first.")
        return []
    
    # Get admin token for admin-only endpoints
    from shared_config import admin_token
    admin_tok = admin_token()
    
    results = []
    total_claimed = 0
    total_failed = 0
    
    # PART 1: Handle Promo Banners (detail type only)
    print("[*] Part 1: Claiming vouchers from Promo Banners (detail type)...")
    print()
    
    banners = get_active_promo_banners()
    detail_banners = [b for b in banners if b.get("action_type") == "detail" and b.get("voucher_id")]
    
    if detail_banners:
        print(f"    Found {len(detail_banners)} detail-type banners with vouchers")
        
        for c in customers:
            user_id = c["user_id"]
            token = c.get("token")
            name = c.get("name", f"User {user_id}")
            if not token:
                continue
            
            user_vouchers = []
            
            # Try to claim from 1-2 random detail banners
            num_to_try = min(random.randint(1, 2), len(detail_banners))
            selected_banners = random.sample(detail_banners, num_to_try)
            
            for banner in selected_banners:
                banner_id = banner.get("id")
                banner_title = banner.get("title", "Unknown")
                
                # Check if already claimed
                already_claimed = check_banner_status(banner_id, token)
                if already_claimed:
                    print(f"    {name}: Already claimed from '{banner_title}'")
                    continue
                
                # Claim voucher
                success, voucher_code, err = claim_voucher_from_banner(banner_id, token)
                
                if success and voucher_code:
                    total_claimed += 1
                    user_vouchers.append({
                        "source": "banner",
                        "source_name": banner_title,
                        "voucher_code": voucher_code,
                    })
                    print(f"    ✓ {name} claimed {voucher_code} from '{banner_title}'")
                else:
                    total_failed += 1
                    print(f"    ✗ {name} failed to claim from '{banner_title}': {err}")
            
            if user_vouchers:
                results.append({
                    "user_id": user_id,
                    "name": name,
                    "vouchers": user_vouchers,
                })
    else:
        print("    [INFO] No detail-type promo banners with vouchers found")
        print("           (Survey-type banners handled in Part 2)")
    
    # PART 2: Complete surveys to get vouchers
    print("[*] Part 2: Completing Surveys for Vouchers...")
    print()
    
    surveys = get_available_surveys(admin_tok)
    if surveys:
        print(f"    Found {len(surveys)} surveys with voucher rewards")
        
        for c in customers:
            user_id = c["user_id"]
            token = c.get("token")
            name = c.get("name", f"User {user_id}")
            if not token:
                continue
            
            # Find user's existing entry or create new
            user_entry = next((r for r in results if r["user_id"] == user_id), None)
            if not user_entry:
                user_entry = {"user_id": user_id, "name": name, "vouchers": []}
                results.append(user_entry)
            
            # Try to complete 1 random survey
            if surveys:
                survey = random.choice(surveys)
                survey_id = survey.get("id")
                survey_title = survey.get("title", "Unknown Survey")
                
                # Get survey details with questions
                survey_details = get_survey_details(survey_id)
                if survey_details:
                    # Generate answers
                    answers = generate_survey_answers(survey_details)
                    
                    # Submit survey
                    success, voucher_code, message = submit_survey(survey_id, answers, token)
                    
                    if success and voucher_code:
                        total_claimed += 1
                        user_entry["vouchers"].append({
                            "source": "survey",
                            "source_name": survey_title,
                            "voucher_code": voucher_code,
                        })
                        print(f"    ✓ {name} completed survey '{survey_title}' → {voucher_code}")
                    elif "Already submitted" in message:
                        print(f"    - {name}: Already completed survey '{survey_title}'")
                    else:
                        print(f"    ✗ {name} failed survey '{survey_title}': {message}")
                else:
                    print(f"    ✗ Could not get survey {survey_id} details")
    else:
        print("    [WARN] No surveys with voucher rewards found")
    
    print()
    print(f"[SUMMARY]")
    print(f"  Total vouchers claimed: {total_claimed}")
    print(f"  Failed attempts: {total_failed}")
    print(f"  Customers with vouchers: {len([r for r in results if r['vouchers']])}")
    
    # Save claimed vouchers to state
    save_state("claimed_vouchers", results)
    
    return results


if __name__ == "__main__":
    try:
        run()
        print("\n[SUCCESS] verify_seed_14_claim_vouchers.py")
    except Exception as e:
        print(f"\n[FAILED] {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
