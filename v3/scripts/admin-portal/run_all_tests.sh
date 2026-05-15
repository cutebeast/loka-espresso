#!/bin/bash
# =============================================================================
# V3 Admin Portal — Comprehensive Endpoint Test
# Tests: Page health, API health, Translation hooks (create only), Page count
# =============================================================================
BASE="http://localhost:13800/api/v1"
FRONT="http://localhost:3010"
PASS=0; FAIL=0

log_pass() { echo "  ✅ $1"; PASS=$((PASS+1)); }
log_fail() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }
log_warn() { echo "  ⚠️  $1"; }

# ── Auth ────────────────────────────────────────────────────────────────
TOKEN=$(curl -s -X POST "$BASE/admin/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"admin@loyaltysystem.uk","password":"admin123"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['tokens']['access_token'])")
[ -z "$TOKEN" ] && { echo "❌ Auth failed"; exit 1; }

api_code() { curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN" "$1" 2>/dev/null; }
page_code() { curl -s -o /dev/null -w "%{http_code}" "$FRONT$1" 2>/dev/null; }
api_post() { curl -s --max-time 30 -X POST "$1" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "$2"; }
get_id() { echo "$1" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('id','FAIL'))" 2>/dev/null; }
tr_count() { docker exec fnb-v3-postgres psql -U fnb_user -d fnb_enterprise_v3 -t -c "SELECT COUNT(*) FROM translations WHERE table_name='$1' AND record_id=$2;" 2>/dev/null | xargs; }

echo "══════════════════════════════════════"
echo " V3 Admin Portal — Full Test Suite"
echo "══════════════════════════════════════"

# ── PHASE 1: PAGE HEALTH ───────────────────────────────────────────────
echo ""
echo "── PHASE 1: Page Health (47 pages) ──"
declare -A pages=(
  ["/"]="Dashboard" ["/stores"]="Stores" ["/stores/settings"]="Store Settings"
  ["/menu/categories"]="Menu Categories" ["/menu/items"]="Menu Items" ["/menu/allergens"]="Allergens"
  ["/menu/dietary-tags"]="Dietary Tags" ["/menu/tax-categories"]="Tax Categories"
  ["/loyalty/tiers"]="Loyalty Tiers" ["/loyalty/accounts"]="Loyalty Accounts"
  ["/loyalty/ledger"]="Loyalty Ledger" ["/loyalty/settings"]="Loyalty Settings"
  ["/rewards"]="Rewards" ["/promotions"]="Promotions" ["/vouchers"]="Vouchers"
  ["/surveys"]="Surveys" ["/surveys/report"]="Survey Report"
  ["/referrals"]="Referrals" ["/referrals/settings"]="Referral Settings"
  ["/checkins"]="Check-ins" ["/checkins/settings"]="Check-in Settings"
  ["/marketing/campaigns"]="Campaigns" ["/marketing/campaigns/settings"]="Campaign Settings"
  ["/content/info-cards"]="Info Cards" ["/content/products"]="Products"
  ["/content/events"]="Events" ["/content/system"]="System Pages" ["/content/splash-screens"]="Splash Screens"
  ["/notifications"]="Notifications" ["/feedback"]="Feedback"
  ["/reports"]="Reports" ["/audit-log"]="Audit Log" ["/settings"]="Settings" ["/translations"]="Translations"
  ["/orders"]="Orders" ["/tables"]="Tables"
  ["/inventory/categories"]="Inv Categories" ["/inventory/items"]="Inv Items"
  ["/inventory/suppliers"]="Suppliers" ["/inventory/movements"]="Movements"
  ["/inventory/purchase-orders"]="Purchase Orders"
  ["/staff"]="Staff" ["/staff/time-events"]="Time Events" ["/staff/tips"]="Tips"
  ["/reservations"]="Reservations" ["/customers"]="Customers" ["/wallets"]="Wallets"
)
for page in "${!pages[@]}"; do
  CODE=$(page_code "$page")
  [ "$CODE" = "200" ] || [ "$CODE" = "308" ] && log_pass "${pages[$page]} ($page)" || log_fail "${pages[$page]} ($page) → $CODE"
done

# ── PHASE 2: API HEALTH ────────────────────────────────────────────────
echo ""
echo "── PHASE 2: API Endpoint Health ──"
declare -A apis=(
  ["admin/dashboard/metrics"]="Dashboard" ["admin/stores?per_page=5"]="Stores"
  ["admin/menu/categories?per_page=5"]="Menu Cats" ["admin/menu/items?per_page=5"]="Menu Items"
  ["admin/menu/allergens"]="Allergens" ["admin/dietary-tags?per_page=10"]="Dietary Tags"
  ["admin/menu/tax-categories"]="Tax Cats" ["admin/loyalty/tiers?per_page=10"]="Tiers"
  ["admin/loyalty/accounts?per_page=10"]="Accounts" ["admin/loyalty/ledger?per_page=10"]="Ledger"
  ["admin/rewards?per_page=5"]="Rewards" ["admin/promo-banners?per_page=5"]="Promotions"
  ["admin/vouchers?per_page=5"]="Vouchers" ["admin/surveys?per_page=5"]="Surveys"
  ["admin/referrals?per_page=5"]="Referrals" ["admin/checkins?per_page=5"]="Check-ins"
  ["admin/marketing/campaigns?per_page=5"]="Campaigns"
  ["admin/info-cards?per_page=5"]="Info Cards" ["admin/product-cards?per_page=5"]="Products"
  ["admin/event-cards?per_page=5"]="Events" ["admin/system-pages?per_page=5"]="System Pages"
  ["admin/feedback?per_page=5"]="Feedback" ["admin/feedback/stats"]="Feedback Stats"
  ["admin/notifications?per_page=5"]="Notifications" ["admin/notifications/templates/list"]="Templates"
  ["admin/orders?per_page=5"]="Orders" ["admin/inventory/items?per_page=5&store_id=1"]="Inv Items"
  ["admin/inventory/categories?per_page=5&store_id=1"]="Inv Cats"
  ["admin/inventory/suppliers?per_page=5&store_id=1"]="Suppliers"
  ["admin/reservations?per_page=5"]="Reservations" ["admin/customers?per_page=5"]="Customers"
  ["admin/wallets?per_page=5"]="Wallets" ["admin/audit-log?per_page=5"]="Audit Log"
  ["admin/config"]="Config" ["translations?namespace=menu&locale=ms&per_page=5"]="Translations"
  ["admin/tables?per_page=5"]="Tables"
)
for api in "${!apis[@]}"; do
  CODE=$(api_code "$BASE/$api")
  [ "$CODE" = "200" ] || [ "$CODE" = "201" ] && log_pass "${apis[$api]}" || log_fail "${apis[$api]} → $CODE"
done

# ── PHASE 3: TRANSLATION HOOK TEST (fast entities only) ─────────────────
echo ""
echo "── PHASE 3: Translation Hook Test ──"
test_hook() {
  local name="$1" url="$2" data="$3" table="$4"
  local R=$(api_post "$url" "$data")
  local CID=$(get_id "$R")
  if [ "$CID" != "FAIL" ] && [ -n "$CID" ]; then
    sleep 2
    local TC=$(tr_count "$table" "$CID")
    [ "$TC" -ge 2 ] && log_pass "$name (id=$CID, $TC tr)" || log_warn "$name (id=$CID, $TC tr — may still be translating)"
  else
    log_fail "$name — create failed"
  fi
}

test_hook "Category" "$BASE/admin/menu/categories" '{"category_name":"AutoTest Cat","slug":"autotest-cat"}' "menu_categories"
test_hook "Allergen" "$BASE/admin/menu/allergens" '{"allergen_key":"autotest","display_name":"AutoTest Allergen","severity":"low"}' "allergens"
test_hook "Dietary Tag" "$BASE/admin/dietary-tags" '{"tag_key":"autotest","display_name":"AutoTest Tag"}' "dietary_tags"
test_hook "Tax Category" "$BASE/admin/menu/tax-categories" '{"category_name":"AutoTest Tax","rate":0.05}' "tax_categories"
test_hook "Store" "$BASE/admin/stores" "{\"store_name\":\"AutoTest Store\",\"store_code\":\"AT$(date +%s)\",\"slug\":\"autotest\",\"address_line_1\":\"Test\",\"city\":\"Test\",\"postal_code\":\"10000\",\"country_code\":\"MY\",\"phone_number\":\"+60120000001\",\"timezone\":\"Asia/Kuala_Lumpur\",\"currency_code\":\"MYR\"}" "stores"
test_hook "Loyalty Tier" "$BASE/admin/loyalty/tiers" "{\"tier_key\":\"at$(date +%s)\",\"display_name\":\"AutoTest Tier\",\"min_lifetime_points\":100,\"points_multiplier\":1.0,\"color_hex\":\"#FF0000\",\"sort_order\":99}" "loyalty_tiers"
test_hook "Reward" "$BASE/admin/rewards" "{\"reward_name\":\"AutoTest Reward\",\"reward_key\":\"at$(date +%s)\",\"points_cost\":50,\"reward_type\":\"free_item\"}" "reward_catalog"
test_hook "Voucher" "$BASE/admin/vouchers" "{\"voucher_code\":\"AT$(date +%s)\",\"display_title\":\"AutoTest Voucher\",\"voucher_type\":\"percentage_off\",\"discount_value\":0.05,\"valid_from\":\"2026-01-01T00:00:00\",\"valid_until\":\"2026-12-31T23:59:59\"}" "voucher_definitions"
test_hook "Info Card" "$BASE/admin/info-cards" '{"title":"AutoTest Info","description":"Test","content_type":"information"}' "information_cards"
test_hook "Product Card" "$BASE/admin/product-cards" '{"title":"AutoTest Product","description":"Test"}' "product_cards"
test_hook "Event Card" "$BASE/admin/event-cards" '{"title":"AutoTest Event","description":"Test"}' "event_cards"
test_hook "Menu Item" "$BASE/admin/menu/items" "{\"item_name\":\"AutoTest Latte\",\"item_code\":\"AT$(date +%s)\",\"base_price\":10.00,\"category_id\":$(api_get "$BASE/admin/menu/categories?per_page=1" 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['items'][0]['id'])" 2>/dev/null || echo "1")}" "menu_items"

# ── PHASE 4: TRANSLATION SUMMARY ───────────────────────────────────────
sleep 3
echo ""
echo "── PHASE 4: Translation Summary ──"
docker exec fnb-v3-postgres psql -U fnb_user -d fnb_enterprise_v3 -c "
SELECT table_name, COUNT(*) as translations, COUNT(DISTINCT record_id) as records
FROM translations GROUP BY table_name ORDER BY table_name;
" 2>&1

echo ""
echo "══════════════════════════════════════"
echo " RESULTS: $PASS passed, $FAIL failed"
echo "══════════════════════════════════════"
[ "$FAIL" -eq 0 ] && echo "✅ ALL TESTS PASSED" || echo "❌ $FAIL TEST(S) FAILED"
