"""
API-based idempotency helpers for seed scripts.
These functions use APIs instead of direct DB queries.
"""
from shared_config import api_get


def get_store_by_slug(slug, token):
    """Get store ID by slug using GET /admin/stores API."""
    resp = api_get("/admin/stores", token=token)
    if resp.status_code != 200:
        return None
    data = resp.json()
    stores = data if isinstance(data, list) else data.get("stores", [])
    for s in stores:
        if s.get("slug") == slug:
            return s.get("id")
    return None


def get_menu_category_by_slug(slug, token):
    """Get menu category ID by slug using GET /stores/0/categories API."""
    resp = api_get("/stores/0/categories", token=token)
    if resp.status_code != 200:
        return None
    categories = resp.json()
    for c in categories:
        if c.get("slug") == slug:
            return c.get("id")
    return None


def get_menu_item_by_name(name, token):
    """Get menu item ID by name using GET /stores/0/items API."""
    resp = api_get("/stores/0/items", token=token, params={"available_only": "false"})
    if resp.status_code != 200:
        return None
    for item in resp.json():
        if item.get("name", "").lower() == name.lower():
            return item.get("id")
    return None


def get_inventory_category_by_slug(store_id, slug, token):
    """Get inventory category ID by slug using GET /stores/{id}/inventory API."""
    resp = api_get(f"/stores/{store_id}/inventory", token=token)
    if resp.status_code != 200:
        return None
    data = resp.json()
    categories = data.get("categories", [])
    for c in categories:
        if c.get("slug") == slug:
            return c.get("id")
    return None


def get_staff_by_email(email, token):
    """Get staff user ID by email using GET /admin/hq-staff or /admin/stores/{id}/staff APIs."""
    # Try HQ staff first
    resp = api_get("/admin/hq-staff", token=token)
    if resp.status_code == 200:
        data = resp.json()
        staff_list = data if isinstance(data, list) else data.get("staff", [])
        for s in staff_list:
            if s.get("email") == email:
                return s.get("id")
    
    # Try all stores
    resp = api_get("/admin/stores", token=token)
    if resp.status_code != 200:
        return None
    data = resp.json()
    stores = data if isinstance(data, list) else data.get("stores", [])
    
    for store in stores:
        store_id = store.get("id")
        resp = api_get(f"/admin/stores/{store_id}/staff", token=token)
        if resp.status_code == 200:
            data = resp.json()
            staff_list = data if isinstance(data, list) else data.get("staff", [])
            for s in staff_list:
                if s.get("email") == email:
                    return s.get("id")
    return None


def get_loyalty_tier_by_name(name, token):
    """Get loyalty tier ID by name using GET /admin/loyalty-tiers API."""
    resp = api_get("/admin/loyalty-tiers", token=token)
    if resp.status_code != 200:
        return None
    data = resp.json()
    tiers = data if isinstance(data, list) else data.get("tiers", [])
    for t in tiers:
        if t.get("name") == name:
            return t.get("id")
    return None


def get_config_value(key, token):
    """Get public config value by key using GET /config API."""
    resp = api_get("/config", token=token)
    if resp.status_code != 200:
        return None
    data = resp.json()
    return data.get(key)


def get_voucher_by_code(code, token):
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


def get_reward_by_code(code, token):
    """Get reward ID by code using GET /admin/rewards API."""
    resp = api_get("/admin/rewards", token=token)
    if resp.status_code != 200:
        return None
    data = resp.json()
    rewards = data if isinstance(data, list) else data.get("rewards", [])
    for r in rewards:
        if r.get("code") == code:
            return r.get("id")
    return None


def get_survey_by_title(title, token):
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
    """Get banner by title using GET /admin/banners API.
    Returns (id, survey_id, voucher_id) or (None, None, None).
    """
    resp = api_get("/admin/banners", token=token)
    if resp.status_code != 200:
        return None, None, None
    data = resp.json()
    banners = data if isinstance(data, list) else data.get("banners", [])
    for b in banners:
        if b.get("title") == title:
            return b.get("id"), b.get("survey_id"), b.get("voucher_id")
    return None, None, None
