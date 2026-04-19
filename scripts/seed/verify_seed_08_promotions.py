"""
SEED SCRIPT: verify_seed_08_promotions.py
Purpose: Create 3 surveys + 5 promo banners (with survey reward vouchers as FK dependencies)
APIs tested: POST /admin/vouchers, POST /admin/surveys, POST /admin/banners, GET /admin/surveys, GET /admin/banners, PUT /admin/banners/{id}
Status: CERTIFIED-2026-04-19 | API-only implementation (except Step 00 which uses SQL for reset)
Dependencies: verify_seed_07_vouchers.py (for voucher IDs used in banners), verify_seed_05_config.py
Flow: Voucher (survey reward) → Survey (with reward_voucher_id) → Banner (with survey_id)
Note: Must create survey reward vouchers FIRST to capture IDs before creating surveys
Idempotency: Surveys checked by title before create. Banners checked by title; if exists with WRONG
  survey_id/voucher_id, an UPDATE is issued to fix the FK linkage. This ensures re-runs fix any
  misconfigured banners rather than silently skipping them.
"""

import sys, os
from datetime import datetime, timezone
SEED_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SEED_DIR)
from shared_config import api_post, api_get, api_put, admin_token, print_header
import db_validate


SURVEY_REWARD_VOUCHERS = [
    {
        "code": "SURVEY-REWARD-5",
        "title": "Survey RM5 Off",
        "discount_type": "fixed",
        "discount_value": 5.00,
        "min_spend": 0,
        "max_uses": 1000,
        "max_uses_per_user": 1,
        "valid_until": "2028-12-31T23:59:59Z",
        "short_description": "RM5 off after completing our survey",
        "description": "Survey completion reward",
        "terms": ["Valid for survey completion reward only"],
        "how_to_redeem": "Reward applied automatically after survey completion",
    },
    {
        "code": "SURVEY-REWARD-10PCT",
        "title": "Survey 10% Off",
        "discount_type": "percent",
        "discount_value": 10,
        "min_spend": 0,
        "max_uses": 1000,
        "max_uses_per_user": 1,
        "valid_until": "2028-12-31T23:59:59Z",
        "short_description": "10% off after completing our survey",
        "description": "Survey completion reward",
        "terms": ["Valid for survey completion reward only"],
        "how_to_redeem": "Reward applied automatically after survey completion",
    },
    {
        "code": "SURVEY-REWARD-COFFEE",
        "title": "Survey Free Coffee",
        "discount_type": "free_item",
        "discount_value": 15.00,
        "min_spend": 0,
        "max_uses": 1000,
        "max_uses_per_user": 1,
        "valid_until": "2028-12-31T23:59:59Z",
        "short_description": "Free coffee after completing our survey",
        "description": "Survey completion reward - free coffee",
        "terms": ["Valid for survey completion reward only", "Free coffee up to RM15"],
        "how_to_redeem": "Reward applied automatically after survey completion",
    },
]


SURVEYS = [
    {
        "title": "Customer Satisfaction Survey",
        "description": "Help us improve your experience",
        "reward_voucher_id": None,
        "is_active": True,
        "questions": [
            {"question_text": "How would you rate your overall experience?", "question_type": "rating", "is_required": True, "sort_order": 0},
            {"question_text": "What did you like most?", "question_type": "single_choice", "options": ["Coffee Quality", "Service Speed", "Ambiance", "Value for Money"], "is_required": True, "sort_order": 1},
            {"question_text": "Any suggestions for improvement?", "question_type": "text", "is_required": False, "sort_order": 2},
            {"question_text": "How likely are you to recommend us?", "question_type": "rating", "is_required": True, "sort_order": 3},
        ],
    },
    {
        "title": "New Menu Feedback",
        "description": "Tell us what you think of our new menu",
        "reward_voucher_id": None,
        "is_active": True,
        "questions": [
            {"question_text": "Rate the new menu items you've tried", "question_type": "rating", "is_required": True, "sort_order": 0},
            {"question_text": "Which new item is your favorite?", "question_type": "single_choice", "options": ["Durian Cappuccino", "Gula Melaka Latte", "Affogato", "Tiramisu"], "is_required": True, "sort_order": 1},
            {"question_text": "How often do you try new items?", "question_type": "dropdown", "options": ["Every visit", "Weekly", "Monthly", "Rarely"], "is_required": True, "sort_order": 2},
        ],
    },
    {
        "title": "Store Experience Review",
        "description": "Share your store visit experience",
        "reward_voucher_id": None,
        "is_active": True,
        "questions": [
            {"question_text": "Rate the store cleanliness", "question_type": "rating", "is_required": True, "sort_order": 0},
            {"question_text": "What can we improve?", "question_type": "text", "is_required": False, "sort_order": 1},
            {"question_text": "Preferred visit time?", "question_type": "single_choice", "options": ["Morning (7-10am)", "Midday (10am-2pm)", "Afternoon (2-5pm)", "Evening (5-9pm)"], "is_required": True, "sort_order": 2},
        ],
    },
]


BANNERS = [
    {
        "title": "Take Our Survey & Get RM5 Off",
        "short_description": "Complete a short survey and get RM5 off your next order",
        "position": 0,
        "start_date": "2026-01-01T00:00:00Z",
        "end_date": "2027-06-30T23:59:59Z",
        "is_active": True,
        "action_type": "survey",
        "survey_id": None,
        "voucher_id": None,
    },
    {
        "title": "New Menu — Vote & Save 10%",
        "short_description": "Share your feedback on new menu items and get 10% off",
        "position": 1,
        "start_date": "2026-01-01T00:00:00Z",
        "end_date": "2027-06-30T23:59:59Z",
        "is_active": True,
        "action_type": "survey",
        "survey_id": None,
        "voucher_id": None,
    },
    {
        "title": "Store Review — Free Coffee!",
        "short_description": "Review your store experience and get a free coffee",
        "position": 2,
        "start_date": "2026-01-01T00:00:00Z",
        "end_date": "2027-06-30T23:59:59Z",
        "is_active": True,
        "action_type": "survey",
        "survey_id": None,
        "voucher_id": None,
    },
    {
        "title": "Summer Promo (Expired)",
        "short_description": "Summer promotion - now expired",
        "position": 3,
        "start_date": "2024-06-01T00:00:00Z",
        "end_date": "2025-01-01T23:59:59Z",
        "is_active": True,
        "action_type": "detail",
        "survey_id": None,
        "voucher_id": None,
    },
    {
        "title": "Holiday Deal (Expired)",
        "short_description": "Holiday promotion - now expired",
        "position": 4,
        "start_date": "2024-11-01T00:00:00Z",
        "end_date": "2025-06-01T23:59:59Z",
        "is_active": True,
        "action_type": "detail",
        "survey_id": None,
        "voucher_id": None,
    },
]


def get_voucher_id_by_code(code, token):
    """Get voucher ID by code using GET /admin/vouchers API."""
    resp = api_get("/admin/vouchers", token=token)
    if resp.status_code != 200:
        return None
    data = resp.json()
    vouchers = data if isinstance(data, list) else data.get("vouchers", [])
    for v in vouchers:
        if v.get("code") == code:
            return v.get("id")
    return None


def get_survey_id_by_title(title, token):
    """Get survey ID by title using GET /admin/surveys API."""
    resp = api_get("/admin/surveys", token=token)
    if resp.status_code != 200:
        return None
    data = resp.json()
    surveys = data if isinstance(data, list) else data.get("surveys", [])
    for s in surveys:
        if s.get("title") == title:
            return s.get("id")
    return None


def get_banner_by_title(title, token):
    """Returns (id, survey_id, voucher_id) or (None, None, None) if not found."""
    resp = api_get("/admin/banners", token=token)
    if resp.status_code != 200:
        return None, None, None
    data = resp.json()
    banners = data if isinstance(data, list) else data.get("banners", [])
    for b in banners:
        if b.get("title") == title:
            return b.get("id"), b.get("survey_id"), b.get("voucher_id")
    return None, None, None


def get_banner_id_by_title(title, token):
    banner_id, _, _ = get_banner_by_title(title, token)
    return banner_id


def run():
    print_header("STEP 08: Create Surveys + Promo Banners")

    token = admin_token()
    if not token:
        raise RuntimeError("Could not get admin token")

    voucher_id_map = {}
    print(f"\n[*] Phase 1: Creating {len(SURVEY_REWARD_VOUCHERS)} survey reward vouchers...")
    for v in SURVEY_REWARD_VOUCHERS:
        resp = api_post("/admin/vouchers", token=token, json=v)
        if resp.status_code == 201:
            voucher = resp.json()
            voucher_id_map[v["code"]] = voucher["id"]
            print(f"  ✓ Created: {v['code']} (id={voucher['id']})")
        elif resp.status_code in (400, 409, 500):
            vid = get_voucher_id_by_code(v["code"], token)
            if vid:
                voucher_id_map[v["code"]] = vid
                print(f"  - Already exists: {v['code']} (id={vid})")
            else:
                raise RuntimeError(f"Create voucher '{v['code']}' failed: {resp.status_code} {resp.text}")
        else:
            raise RuntimeError(f"Create voucher '{v['code']}' failed: {resp.status_code} {resp.text}")

    survey_id_map = {}
    print(f"\n[*] Phase 2: Creating {len(SURVEYS)} surveys with questions...")
    for i, s in enumerate(SURVEYS):
        # Idempotent: check API first before creating
        existing_sid = get_survey_id_by_title(s["title"], token)
        if existing_sid is not None:
            survey_id_map[s["title"]] = existing_sid
            print(f"  - Already exists: {s['title']} (id={existing_sid})")
            continue

        voucher_code = ["SURVEY-REWARD-5", "SURVEY-REWARD-10PCT", "SURVEY-REWARD-COFFEE"][i]
        s["reward_voucher_id"] = voucher_id_map.get(voucher_code)

        resp = api_post("/admin/surveys", token=token, json=s)
        if resp.status_code == 201:
            survey = resp.json()
            survey_id_map[s["title"]] = survey["id"]
            print(f"  ✓ Created: {s['title']} (id={survey['id']}, reward_voucher_id={survey['reward_voucher_id']})")
        else:
            raise RuntimeError(f"Create survey '{s['title']}' failed: {resp.status_code} {resp.text}")

    print(f"\n[*] Phase 3: Creating {len(BANNERS)} promo banners...")
    banner_voucher_ids = {
        "Summer Promo (Expired)": get_voucher_id_by_code("FREECOFFEE", token),
        "Holiday Deal (Expired)": get_voucher_id_by_code("SAVE5RM", token),
    }

    for b in BANNERS:
        # Idempotent: check API first before creating
        existing_id, existing_survey_id, existing_voucher_id = get_banner_by_title(b["title"], token)
        if existing_id is not None:
            # Banner exists — compute expected FK values
            expected_survey_id = None
            expected_voucher_id = None
            if b["action_type"] == "survey":
                survey_titles = ["Customer Satisfaction Survey", "New Menu Feedback", "Store Experience Review"]
                expected_survey_id = survey_id_map.get(survey_titles[b["position"]])
            elif b["title"] in banner_voucher_ids:
                expected_voucher_id = banner_voucher_ids[b["title"]]

            # Fix FK if needed
            if existing_survey_id != expected_survey_id or existing_voucher_id != expected_voucher_id:
                update_payload = {"survey_id": expected_survey_id, "voucher_id": expected_voucher_id}
                upd = api_put(f"/admin/banners/{existing_id}", token=token, json=update_payload)
                if upd.status_code == 200:
                    print(f"  ✓ Fixed FK: {b['title']} (id={existing_id}) — survey_id={expected_survey_id}, voucher_id={expected_voucher_id}")
                else:
                    raise RuntimeError(f"Update banner '{b['title']}' (id={existing_id}) failed: {upd.status_code} {upd.text}")
            else:
                print(f"  - Already exists (correct): {b['title']} (id={existing_id})")
            continue

        # New banner — build payload
        if b["action_type"] == "survey":
            survey_titles = ["Customer Satisfaction Survey", "New Menu Feedback", "Store Experience Review"]
            b["survey_id"] = survey_id_map.get(survey_titles[b["position"]])
        elif b["title"] in banner_voucher_ids:
            b["voucher_id"] = banner_voucher_ids[b["title"]]

        resp = api_post("/admin/banners", token=token, json=b)
        if resp.status_code in (200, 201):
            banner = resp.json()
            print(f"  ✓ Created: {b['title']} (id={banner['id']}, survey_id={banner.get('survey_id')}, voucher_id={banner.get('voucher_id')})")
        else:
            raise RuntimeError(f"Create banner '{b['title']}' failed: {resp.status_code} {resp.text}")

    print(f"\n[*] DB Validation: surveys...")
    ok, count, msg = db_validate.validate_surveys(len(SURVEYS))
    if not ok:
        raise RuntimeError(f"Surveys validation: {msg}")
    print(f"  ✓ {msg}")

    expected_questions = sum(len(s["questions"]) for s in SURVEYS)
    ok2, count2, msg2 = db_validate.validate_survey_questions(expected_questions)
    if not ok2:
        raise RuntimeError(f"Survey questions validation: {msg2}")
    print(f"  ✓ {msg2}")

    print(f"\n[*] DB Validation: promo banners...")
    ok3, count3, msg3 = db_validate.validate_promo_banners(len(BANNERS))
    if not ok3:
        raise RuntimeError(f"Promo banners validation: {msg3}")
    print(f"  ✓ {msg3}")

    print(f"\n[*] Verifying via GET /admin/surveys...")
    resp = api_get("/admin/surveys", token=token)
    if resp.status_code != 200:
        raise RuntimeError(f"GET /admin/surveys failed: {resp.status_code}")
    sdata = resp.json()
    surveys = sdata if isinstance(sdata, list) else sdata.get("surveys", [])
    print(f"  ✓ API returned {len(surveys)} surveys")

    print(f"\n[*] Verifying via GET /admin/banners...")
    resp = api_get("/admin/banners", token=token)
    if resp.status_code != 200:
        raise RuntimeError(f"GET /admin/banners failed: {resp.status_code}")
    bdata = resp.json()
    banners = bdata if isinstance(bdata, list) else bdata.get("banners", [])
    print(f"  ✓ API returned {len(banners)} banners")

    print(f"\n[✓] STEP 08 complete — {len(surveys)} surveys, {len(banners)} banners")


if __name__ == "__main__":
    try:
        run()
        print("\n[SUCCESS] seed_08_promotions.py")
    except RuntimeError as e:
        print(f"\n[FAILED] {e}")
        sys.exit(1)