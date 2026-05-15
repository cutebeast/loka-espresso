#!/bin/bash
# =============================================================================
# V3 Admin Portal — Full Audit: Dashboard through Marketing
# Checks: Page health, API health, Translation wiring, Translation data
# =============================================================================
set -e

BASE="http://localhost:13800/api/v1"
FRONT="http://localhost:3010"

TOKEN=$(curl -s -X POST "$BASE/admin/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@loyaltysystem.uk","password":"admin123"}' \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["tokens"]["access_token"])')

api_code() { curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN" "$1" 2>/dev/null; }
page_code() { curl -s -o /dev/null -w "%{http_code}" "$FRONT$1" 2>/dev/null; }
has_translations() {
  CT=$(docker exec fnb-v3-postgres psql -U fnb_user -d fnb_enterprise_v3 -t -c \
    "SELECT COUNT(*) FROM translations WHERE table_name='$1';" 2>/dev/null | tr -d ' ')
  [ "$CT" -gt 0 ] && echo "✅ $CT entries" || echo "❌ none"
}
api_get() { curl -s -H "Authorization: Bearer $TOKEN" "$1" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('total','?'))" 2>/dev/null; }

echo "======================================================================"
echo " V3 ADMIN PORTAL — FULL AUDIT"
echo " Dashboard → Marketing"
echo "======================================================================"

# ── DASHBOARD ──────────────────────────────────────────────────────────
echo ""
echo "── DASHBOARD ──"
P=$(page_code "/"); A=$(api_code "$BASE/admin/dashboard/metrics")
echo "  Page: $P | API: $A | Data: $(api_get "$BASE/admin/dashboard/metrics") records"

# ── STORES ─────────────────────────────────────────────────────────────
echo ""
echo "── STORES ──"
P=$(page_code "/stores"); A=$(api_code "$BASE/admin/stores?per_page=5")
echo "  Locations Page: $P | API: $A | Data: $(api_get "$BASE/admin/stores?per_page=5") stores"
echo "  Translations: $(has_translations "stores")"
P=$(page_code "/stores/settings"); A=$(api_code "$BASE/admin/config")
echo "  Settings Page: $P | Config API: $A"

# ── MENU ───────────────────────────────────────────────────────────────
echo ""
echo "── MENU ──"

# Categories
P=$(page_code "/menu/categories"); A=$(api_code "$BASE/admin/menu/categories?per_page=5")
echo "  Categories Page: $P | API: $A | Data: $(api_get "$BASE/admin/menu/categories?per_page=5") cats"
echo "  Translations: $(has_translations "menu_categories")"

# Items
P=$(page_code "/menu/items"); A=$(api_code "$BASE/admin/menu/items?per_page=5")
echo "  Items Page: $P | API: $A | Data: $(api_get "$BASE/admin/menu/items?per_page=5") items"
echo "  Translations: $(has_translations "menu_items")"

# Allergens
P=$(page_code "/menu/allergens"); A=$(api_code "$BASE/admin/menu/allergens")
echo "  Allergens Page: $P | API: $A"
echo "  Translations: $(has_translations "allergens")"

# Dietary Tags
P=$(page_code "/menu/dietary-tags"); A=$(api_code "$BASE/admin/dietary-tags?per_page=10")
echo "  Dietary Tags Page: $P | API: $A | Data: $(api_get "$BASE/admin/dietary-tags?per_page=10") tags"
echo "  Translations: $(has_translations "dietary_tags")"

# Tax Categories
P=$(page_code "/menu/tax-categories"); A=$(api_code "$BASE/admin/menu/tax-categories")
echo "  Tax Categories Page: $P | API: $A"
echo "  Translations: $(has_translations "tax_categories")"

# ── LOYALTY ────────────────────────────────────────────────────────────
echo ""
echo "── LOYALTY ──"

P=$(page_code "/loyalty/tiers"); A=$(api_code "$BASE/admin/loyalty/tiers?per_page=10")
echo "  Tiers Page: $P | API: $A | Data: $(api_get "$BASE/admin/loyalty/tiers?per_page=10") tiers"
echo "  Translations: $(has_translations "loyalty_tiers")"

P=$(page_code "/loyalty/accounts"); A=$(api_code "$BASE/admin/loyalty/accounts?per_page=10")
echo "  Accounts Page: $P | API: $A | Data: $(api_get "$BASE/admin/loyalty/accounts?per_page=10") accounts"

P=$(page_code "/loyalty/ledger"); A=$(api_code "$BASE/admin/loyalty/ledger?per_page=10")
echo "  Ledger Page: $P | API: $A | Data: $(api_get "$BASE/admin/loyalty/ledger?per_page=10") entries"

P=$(page_code "/loyalty/settings")
echo "  Settings Page: $P"

# ── MARKETING ──────────────────────────────────────────────────────────
echo ""
echo "── MARKETING ──"

P=$(page_code "/rewards"); A=$(api_code "$BASE/admin/rewards?per_page=5")
echo "  Rewards Page: $P | API: $A | Data: $(api_get "$BASE/admin/rewards?per_page=5") rewards"
echo "  Translations: $(has_translations "reward_catalog")"

P=$(page_code "/promotions"); A=$(api_code "$BASE/admin/promo-banners?per_page=5")
echo "  Promotions Page: $P | API: $A | Data: $(api_get "$BASE/admin/promo-banners?per_page=5") banners"

P=$(page_code "/vouchers"); A=$(api_code "$BASE/admin/vouchers?per_page=5")
echo "  Vouchers Page: $P | API: $A | Data: $(api_get "$BASE/admin/vouchers?per_page=5") vouchers"
echo "  Translations: $(has_translations "voucher_definitions")"

P=$(page_code "/surveys"); A=$(api_code "$BASE/admin/surveys?per_page=5")
echo "  Surveys Page: $P | API: $A | Data: $(api_get "$BASE/admin/surveys?per_page=5") surveys"

P=$(page_code "/surveys/report"); A=$(api_code "$BASE/admin/surveys/1/responses")
echo "  Survey Report Page: $P | Responses API: $A"

P=$(page_code "/referrals"); A=$(api_code "$BASE/admin/referrals?per_page=5")
echo "  Referrals Page: $P | API: $A | Data: $(api_get "$BASE/admin/referrals?per_page=5") referrals"

P=$(page_code "/referrals/settings")
echo "  Referral Settings Page: $P"

P=$(page_code "/checkins"); A=$(api_code "$BASE/admin/checkins?per_page=5")
echo "  Check-ins Page: $P | API: $A | Data: $(api_get "$BASE/admin/checkins?per_page=5") checkins"

P=$(page_code "/checkins/settings")
echo "  Check-in Settings Page: $P"

P=$(page_code "/marketing/campaigns"); A=$(api_code "$BASE/admin/marketing/campaigns?per_page=5")
echo "  Campaigns Page: $P | API: $A | Data: $(api_get "$BASE/admin/marketing/campaigns?per_page=5") campaigns"

P=$(page_code "/marketing/campaigns/settings")
echo "  Campaign Settings Page: $P"

# ── CONTENT ────────────────────────────────────────────────────────────
echo ""
echo "── CONTENT ──"

P=$(page_code "/content/info-cards"); A=$(api_code "$BASE/admin/info-cards?per_page=5")
echo "  Info Cards Page: $P | API: $A | Data: $(api_get "$BASE/admin/info-cards?per_page=5") cards"
echo "  Translations: $(has_translations "info_cards")"

P=$(page_code "/content/products"); A=$(api_code "$BASE/admin/product-cards?per_page=5")
echo "  Products Page: $P | API: $A | Data: $(api_get "$BASE/admin/product-cards?per_page=5") products"
echo "  Translations: $(has_translations "product_cards")"

P=$(page_code "/content/events"); A=$(api_code "$BASE/admin/event-cards?per_page=5")
echo "  Events Page: $P | API: $A | Data: $(api_get "$BASE/admin/event-cards?per_page=5") events"
echo "  Translations: $(has_translations "event_cards")"

P=$(page_code "/content/system"); A=$(api_code "$BASE/admin/system-pages?per_page=5")
echo "  System Pages Page: $P | API: $A | Data: $(api_get "$BASE/admin/system-pages?per_page=5") pages"

P=$(page_code "/content/splash-screens"); A=$(api_code "$BASE/admin/content/splash-screens?per_page=5" 2>/dev/null || echo "N/A")
echo "  Splash Screens Page: $P"

# ── REMAINING COMPANY ITEMS ────────────────────────────────────────────
echo ""
echo "── NOTIFICATIONS / FEEDBACK / REPORTS / AUDIT / SETTINGS / TRANSLATIONS ──"

P=$(page_code "/notifications"); A=$(api_code "$BASE/admin/notifications?per_page=5")
echo "  Notifications Page: $P | API: $A | Data: $(api_get "$BASE/admin/notifications?per_page=5") notifs"
echo "  Templates API: $(api_code "$BASE/admin/notifications/templates/list")"

P=$(page_code "/feedback"); A=$(api_code "$BASE/admin/feedback?per_page=5")
echo "  Feedback Page: $P | API: $A | Stats: $(api_code "$BASE/admin/feedback/stats")"

P=$(page_code "/reports")
echo "  Reports Page: $P"

P=$(page_code "/audit-log"); A=$(api_code "$BASE/admin/audit-log?per_page=5")
echo "  Audit Log Page: $P | API: $A | Data: $(api_get "$BASE/admin/audit-log?per_page=5") entries"

P=$(page_code "/settings")
echo "  Settings Page: $P"

P=$(page_code "/translations")
echo "  Translations Page: $P"
A=$(api_code "$BASE/translations?namespace=menu&locale=ms&per_page=5")
echo "  Translations API: $A | Data: $(api_get "$BASE/translations?namespace=menu&locale=ms&per_page=5") entries"

echo ""
echo "======================================================================"
echo " AUDIT COMPLETE"
echo "======================================================================"
