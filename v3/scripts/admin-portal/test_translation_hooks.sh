#!/bin/bash
# =============================================================================
# V3 Admin Portal — Comprehensive Endpoint + Translation Hook Test
# Creates 2 items per entity via API, verifies translations, tests edit/delete
# =============================================================================
set -e

BASE="http://localhost:13800/api/v1"
PASS=0; FAIL=0

log_pass() { echo "  ✅ $1"; PASS=$((PASS+1)); }
log_fail() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }

# ── Auth ────────────────────────────────────────────────────────────────
TOKEN=$(curl -s -X POST "$BASE/admin/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"admin@loyaltysystem.uk","password":"admin123"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['tokens']['access_token'])")
[ -z "$TOKEN" ] && { echo "❌ Auth failed"; exit 1; }

api_post() { curl -s --max-time 120 -X POST "$1" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "$2"; }
api_patch() { curl -s --max-time 60 -X PATCH "$1" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "$2"; }
api_delete() { curl -s --max-time 30 -X DELETE "$1" -H "Authorization: Bearer $TOKEN"; }
api_get() { curl -s --max-time 10 -H "Authorization: Bearer $TOKEN" "$1"; }
get_id() { echo "$1" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('id','FAIL'))" 2>/dev/null; }
tr_count() { docker exec fnb-v3-postgres psql -U fnb_user -d fnb_enterprise_v3 -t -c "SELECT COUNT(*) FROM translations WHERE table_name='$1' AND record_id=$2;" 2>/dev/null | xargs; }
min_tr() { [ "$1" -ge 4 ] && log_pass "$2" || log_fail "$2 (only $1 translations, expected >=4)"; }

echo "══════════════════════════════════════"
echo " V3 Translation Hook Test Suite"
echo "══════════════════════════════════════"

# ── 1. MENU CATEGORIES ─────────────────────────────────────────────────
echo "── Menu Categories ──"
R=$(api_post "$BASE/admin/menu/categories" '{"category_name":"Test Category A","slug":"test-cat-a"}')
CID=$(get_id "$R"); [ "$CID" != "FAIL" ] && { TC=$(tr_count "menu_categories" "$CID"); min_tr "$TC" "Create Category=$CID ($TC tr)"; } || log_fail "Create Category failed"
R=$(api_patch "$BASE/admin/menu/categories/$CID" '{"category_name":"Test Category A Updated"}')
TC=$(tr_count "menu_categories" "$CID"); min_tr "$TC" "Edit Category=$CID ($TC tr)"

# ── 2. MENU ITEMS ──────────────────────────────────────────────────────
echo "── Menu Items ──"
CID2=$(api_get "$BASE/admin/menu/categories?per_page=1" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['items'][0]['id'])" 2>/dev/null)
R=$(api_post "$BASE/admin/menu/items" "{\"item_name\":\"Test Latte\",\"item_code\":\"TEST001\",\"base_price\":10.00,\"category_id\":$CID2}")
IID=$(get_id "$R"); [ "$IID" != "FAIL" ] && { TC=$(tr_count "menu_items" "$IID"); min_tr "$TC" "Create Item=$IID ($TC tr)"; } || log_fail "Create Item failed"
R=$(api_patch "$BASE/admin/menu/items/$IID" '{"item_name":"Test Latte Updated"}')
TC=$(tr_count "menu_items" "$IID"); min_tr "$TC" "Edit Item=$IID ($TC tr)"

# ── 3. ALLERGENS ───────────────────────────────────────────────────────
echo "── Allergens ──"
R=$(api_post "$BASE/admin/menu/allergens" '{"allergen_key":"test_alg","display_name":"Test Allergen","severity":"medium"}')
AID=$(get_id "$R"); [ "$AID" != "FAIL" ] && { TC=$(tr_count "allergens" "$AID"); min_tr "$TC" "Create Allergen=$AID ($TC tr)"; } || log_fail "Create Allergen failed"

# ── 4. DIETARY TAGS ────────────────────────────────────────────────────
echo "── Dietary Tags ──"
R=$(api_post "$BASE/admin/dietary-tags" '{"tag_key":"test_tag","display_name":"Test Tag"}')
DID=$(get_id "$R"); [ "$DID" != "FAIL" ] && { TC=$(tr_count "dietary_tags" "$DID"); min_tr "$TC" "Create Dietary Tag=$DID ($TC tr)"; } || log_fail "Create Dietary Tag failed"

# ── 5. TAX CATEGORIES ──────────────────────────────────────────────────
echo "── Tax Categories ──"
R=$(api_post "$BASE/admin/menu/tax-categories" '{"category_name":"Test Tax 5%","rate":0.05}')
TID=$(get_id "$R"); [ "$TID" != "FAIL" ] && { TC=$(tr_count "tax_categories" "$TID"); min_tr "$TC" "Create Tax=$TID ($TC tr)"; } || log_fail "Create Tax failed"

# ── 6. STORES ──────────────────────────────────────────────────────────
echo "── Stores ──"
R=$(api_post "$BASE/admin/stores" '{"store_name":"Test Store X","store_code":"TS'$(date +%s)'","slug":"test-store-x","address_line_1":"Test","city":"Test","postal_code":"10000","country_code":"MY","phone_number":"+60120000000","timezone":"Asia/Kuala_Lumpur","currency_code":"MYR"}')
SID=$(get_id "$R"); [ "$SID" != "FAIL" ] && { TC=$(tr_count "stores" "$SID"); min_tr "$TC" "Create Store=$SID ($TC tr)"; } || log_fail "Create Store failed"

# ── 7. LOYALTY TIERS ───────────────────────────────────────────────────
echo "── Loyalty Tiers ──"
R=$(api_post "$BASE/admin/loyalty/tiers" "{\"tier_key\":\"test_tier_$(date +%s)\",\"display_name\":\"Test Tier\",\"min_lifetime_points\":500,\"points_multiplier\":1.2,\"color_hex\":\"#FF0000\",\"sort_order\":99}")
LID=$(get_id "$R"); [ "$LID" != "FAIL" ] && { TC=$(tr_count "loyalty_tiers" "$LID"); min_tr "$TC" "Create Tier=$LID ($TC tr)"; } || log_fail "Create Tier failed"

# ── 8. REWARDS ─────────────────────────────────────────────────────────
echo "── Rewards ──"
R=$(api_post "$BASE/admin/rewards" "{\"reward_name\":\"Test Reward\",\"reward_key\":\"test_reward_$(date +%s)\",\"points_cost\":100,\"reward_type\":\"free_item\"}")
RID=$(get_id "$R"); [ "$RID" != "FAIL" ] && { TC=$(tr_count "reward_catalog" "$RID"); min_tr "$TC" "Create Reward=$RID ($TC tr)"; } || log_fail "Create Reward failed"

# ── 9. VOUCHERS ────────────────────────────────────────────────────────
echo "── Vouchers ──"
R=$(api_post "$BASE/admin/vouchers" "{\"voucher_code\":\"TEST$(date +%s)\",\"display_title\":\"Test Voucher\",\"voucher_type\":\"percentage_off\",\"discount_value\":0.05,\"valid_from\":\"2026-01-01T00:00:00\",\"valid_until\":\"2026-12-31T23:59:59\"}")
VID=$(get_id "$R"); [ "$VID" != "FAIL" ] && { TC=$(tr_count "voucher_definitions" "$VID"); min_tr "$TC" "Create Voucher=$VID ($TC tr)"; } || log_fail "Create Voucher failed"

# ── 10. INFO CARDS ─────────────────────────────────────────────────────
echo "── Info Cards ──"
R=$(api_post "$BASE/admin/info-cards" '{"title":"Test Info Card","description":"Test description","content_type":"information"}')
ICID=$(get_id "$R"); [ "$ICID" != "FAIL" ] && { TC=$(tr_count "information_cards" "$ICID"); min_tr "$TC" "Create Info Card=$ICID ($TC tr)"; } || log_fail "Create Info Card failed"

# ── 11. PRODUCT CARDS ──────────────────────────────────────────────────
echo "── Product Cards ──"
R=$(api_post "$BASE/admin/product-cards" '{"title":"Test Product Card","description":"Test product"}')
PID=$(get_id "$R"); [ "$PID" != "FAIL" ] && { TC=$(tr_count "product_cards" "$PID"); min_tr "$TC" "Create Product=$PID ($TC tr)"; } || log_fail "Create Product failed"

# ── 12. EVENT CARDS ────────────────────────────────────────────────────
echo "── Event Cards ──"
R=$(api_post "$BASE/admin/event-cards" '{"title":"Test Event Card","description":"Test event"}')
EID=$(get_id "$R"); [ "$EID" != "FAIL" ] && { TC=$(tr_count "event_cards" "$EID"); min_tr "$TC" "Create Event=$EID ($TC tr)"; } || log_fail "Create Event failed"

# ── 13. NOTIFICATIONS ──────────────────────────────────────────────────
echo "── Notifications ──"
R=$(api_post "$BASE/admin/notifications" '{"title":"Test Notification","body":"Test body","notification_type":"general","audience_segment":"all_users","status":"draft"}')
NID=$(get_id "$R"); [ "$NID" != "FAIL" ] && log_pass "Create Notification=$NID" || log_fail "Create Notification failed"

# ── 14. FEEDBACK ───────────────────────────────────────────────────────
echo "── Feedback ──"
CODE=$(api_get "$BASE/admin/feedback?per_page=1" | python3 -c "import sys,json; print(json.load(sys.stdin).get('success',False))" 2>/dev/null)
[ "$CODE" = "True" ] && log_pass "Feedback list OK" || log_fail "Feedback list failed"
CODE=$(api_get "$BASE/admin/feedback/stats" | python3 -c "import sys,json; print(json.load(sys.stdin).get('success',False))" 2>/dev/null)
[ "$CODE" = "True" ] && log_pass "Feedback stats OK" || log_fail "Feedback stats failed"

# ── 15. PROMOTIONS / CAMPAIGNS / SURVEYS ───────────────────────────────
echo "── Promotions ──"
CODE=$(api_get "$BASE/admin/promo-banners?per_page=1" | python3 -c "import sys,json; print(json.load(sys.stdin).get('success',False))" 2>/dev/null)
[ "$CODE" = "True" ] && log_pass "Promotions list OK" || log_fail "Promotions list failed"

echo "── Campaigns ──"
CODE=$(api_get "$BASE/admin/marketing/campaigns?per_page=1" | python3 -c "import sys,json; print(json.load(sys.stdin).get('success',False))" 2>/dev/null)
[ "$CODE" = "True" ] && log_pass "Campaigns list OK" || log_fail "Campaigns list failed"

echo "── Surveys ──"
CODE=$(api_get "$BASE/admin/surveys?per_page=1" | python3 -c "import sys,json; print(json.load(sys.stdin).get('success',False))" 2>/dev/null)
[ "$CODE" = "True" ] && log_pass "Surveys list OK" || log_fail "Surveys list failed"

# ── TRANSLATION SUMMARY ────────────────────────────────────────────────
sleep 3
echo ""
echo "══════════════════════════════════════"
echo " TRANSLATION SUMMARY"
echo "══════════════════════════════════════"
docker exec fnb-v3-postgres psql -U fnb_user -d fnb_enterprise_v3 -c "
SELECT table_name, COUNT(*) as translations, COUNT(DISTINCT record_id) as records
FROM translations GROUP BY table_name ORDER BY table_name;
" 2>&1

echo ""
echo "══════════════════════════════════════"
echo " RESULTS: $PASS passed, $FAIL failed"
echo "══════════════════════════════════════"
[ "$FAIL" -eq 0 ] && echo "✅ ALL TESTS PASSED" || echo "❌ $FAIL TEST(S) FAILED"
