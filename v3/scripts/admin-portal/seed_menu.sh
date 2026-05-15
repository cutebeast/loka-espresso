#!/bin/bash
# =============================================================================
# Menu Seeder — 3 categories × 3 items with allergens, dietary tags, tax, add-ons
# =============================================================================
set -e

BASE="http://localhost:13800/api/v1"
TOKEN=$(curl -s -X POST "$BASE/admin/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@loyaltysystem.uk","password":"admin123"}' \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["tokens"]["access_token"])')

api_post() { curl -s --max-time 90 -X POST "$1" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "$2"; }
api_patch() { curl -s --max-time 90 -X PATCH "$1" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "$2"; }
get_id() { echo "$1" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['id'])" 2>/dev/null; }

echo "========================================="
echo " STEP 1: Clear existing menu data"
echo "========================================="
docker exec fnb-v3-postgres psql -U fnb_user -d fnb_enterprise_v3 -c "
DELETE FROM translations WHERE table_name LIKE 'menu_%' OR table_name IN ('allergens','dietary_tags','tax_categories');
DELETE FROM menu_item_dietary_tags;
DELETE FROM menu_item_allergens;
DELETE FROM menu_modifier_options;
DELETE FROM menu_modifier_groups;
DELETE FROM menu_variants;
DELETE FROM menu_items;
DELETE FROM menu_categories;
DELETE FROM dietary_tags;
DELETE FROM allergens;
DELETE FROM tax_categories;
" 2>&1 | tail -3
echo "  ✅ Menu cleared"

echo ""
echo "========================================="
echo " STEP 2: Create tax, dietary tags, allergens"
echo "========================================="

# Tax Category
TAX_ID=$(get_id "$(api_post "$BASE/admin/menu/tax-categories" '{"category_name":"SST 6%","rate":0.06}')")
echo "  Tax: SST 6% (id=$TAX_ID)"

# Dietary Tags (4)
VEGAN_ID=$(get_id "$(api_post "$BASE/admin/dietary-tags" '{"tag_key":"vegan","display_name":"Vegan"}')")
HALAL_ID=$(get_id "$(api_post "$BASE/admin/dietary-tags" '{"tag_key":"halal","display_name":"Halal"}')")
GF_ID=$(get_id "$(api_post "$BASE/admin/dietary-tags" '{"tag_key":"gluten_free","display_name":"Gluten-Free"}')")
SF_ID=$(get_id "$(api_post "$BASE/admin/dietary-tags" '{"tag_key":"sugar_free","display_name":"Sugar-Free"}')")
echo "  Dietary: Vegan=$VEGAN_ID Halal=$HALAL_ID GF=$GF_ID SF=$SF_ID"

# Allergens (4)
DAIRY_ID=$(get_id "$(api_post "$BASE/admin/menu/allergens" '{"allergen_key":"dairy","display_name":"Dairy","severity":"high"}')")
NUTS_ID=$(get_id "$(api_post "$BASE/admin/menu/allergens" '{"allergen_key":"nuts","display_name":"Nuts","severity":"critical"}')")
GLUTEN_ID=$(get_id "$(api_post "$BASE/admin/menu/allergens" '{"allergen_key":"gluten","display_name":"Gluten","severity":"high"}')")
SOY_ID=$(get_id "$(api_post "$BASE/admin/menu/allergens" '{"allergen_key":"soy","display_name":"Soy","severity":"medium"}')")
echo "  Allergens: Dairy=$DAIRY_ID Nuts=$NUTS_ID Gluten=$GLUTEN_ID Soy=$SOY_ID"

echo ""
echo "========================================="
echo " STEP 3: Create 3 categories + 3 items each (9 items)"
echo "========================================="

# ── Category 1: Hot Coffee ──
CAT1=$(get_id "$(api_post "$BASE/admin/menu/categories" '{"category_name":"Hot Coffee","slug":"hot-coffee"}')")
echo ""
echo "── Category 1: Hot Coffee (id=$CAT1) ──"
for item in \
  '{"item_name":"Americano","item_code":"HC001","base_price":10.00,"category_id":'$CAT1',"description":"Rich espresso with hot water","dietary_tag_ids":['$VEGAN_ID','$HALAL_ID'],"allergen_ids":[],"tax_category_id":'$TAX_ID'}' \
  '{"item_name":"Cappuccino","item_code":"HC002","base_price":12.00,"category_id":'$CAT1',"description":"Espresso with steamed milk foam","dietary_tag_ids":['$HALAL_ID'],"allergen_ids":['$DAIRY_ID'],"tax_category_id":'$TAX_ID'}' \
  '{"item_name":"Mocha","item_code":"HC003","base_price":14.00,"category_id":'$CAT1',"description":"Espresso with chocolate and steamed milk","dietary_tag_ids":['$HALAL_ID'],"allergen_ids":['$DAIRY_ID','$SOY_ID'],"tax_category_id":'$TAX_ID'}'; do
  ITEM_ID=$(get_id "$(api_post "$BASE/admin/menu/items" "$item")")
  NAME=$(echo "$item" | python3 -c "import sys,json; print(json.load(sys.stdin)['item_name'])")
  echo "  ✅ $NAME (id=$ITEM_ID)"
  sleep 1
done

# ── Category 2: Iced Blends ──
CAT2=$(get_id "$(api_post "$BASE/admin/menu/categories" '{"category_name":"Iced Blends","slug":"iced-blends"}')")
echo ""
echo "── Category 2: Iced Blends (id=$CAT2) ──"
for item in \
  '{"item_name":"Iced Latte","item_code":"IB001","base_price":13.00,"category_id":'$CAT2',"description":"Chilled espresso with cold milk over ice","dietary_tag_ids":['$HALAL_ID','$GF_ID'],"allergen_ids":['$DAIRY_ID'],"tax_category_id":'$TAX_ID'}' \
  '{"item_name":"Iced Matcha Latte","item_code":"IB002","base_price":15.00,"category_id":'$CAT2',"description":"Japanese matcha with cold milk and ice","dietary_tag_ids":['$VEGAN_ID','$GF_ID'],"allergen_ids":['$SOY_ID'],"tax_category_id":'$TAX_ID'}' \
  '{"item_name":"Iced Chocolate","item_code":"IB003","base_price":14.00,"category_id":'$CAT2',"description":"Rich chocolate syrup with cold milk","dietary_tag_ids":['$HALAL_ID'],"allergen_ids":['$DAIRY_ID','$SOY_ID'],"tax_category_id":'$TAX_ID'}'; do
  ITEM_ID=$(get_id "$(api_post "$BASE/admin/menu/items" "$item")")
  NAME=$(echo "$item" | python3 -c "import sys,json; print(json.load(sys.stdin)['item_name'])")
  echo "  ✅ $NAME (id=$ITEM_ID)"
  sleep 1
done

# ── Category 3: Specialty Tea ──
CAT3=$(get_id "$(api_post "$BASE/admin/menu/categories" '{"category_name":"Specialty Tea","slug":"specialty-tea"}')")
echo ""
echo "── Category 3: Specialty Tea (id=$CAT3) ──"
for item in \
  '{"item_name":"Earl Grey Tea","item_code":"ST001","base_price":9.00,"category_id":'$CAT3',"description":"Classic bergamot black tea served hot","dietary_tag_ids":['$VEGAN_ID','$HALAL_ID','$SF_ID'],"allergen_ids":[],"tax_category_id":'$TAX_ID'}' \
  '{"item_name":"Chamomile Honey Tea","item_code":"ST002","base_price":11.00,"category_id":'$CAT3',"description":"Calming chamomile with a touch of honey","dietary_tag_ids":['$HALAL_ID','$GF_ID'],"allergen_ids":[],"tax_category_id":'$TAX_ID'}' \
  '{"item_name":"Jasmine Green Tea","item_code":"ST003","base_price":10.00,"category_id":'$CAT3',"description":"Fragrant jasmine-scented green tea","dietary_tag_ids":['$VEGAN_ID','$HALAL_ID','$SF_ID','$GF_ID'],"allergen_ids":[],"tax_category_id":'$TAX_ID'}'; do
  ITEM_ID=$(get_id "$(api_post "$BASE/admin/menu/items" "$item")")
  NAME=$(echo "$item" | python3 -c "import sys,json; print(json.load(sys.stdin)['item_name'])")
  echo "  ✅ $NAME (id=$ITEM_ID)"
  sleep 1
done

echo ""
echo "========================================="
echo " RESULTS: Translation Summary"
echo "========================================="
sleep 3
docker exec fnb-v3-postgres psql -U fnb_user -d fnb_enterprise_v3 -c "
SELECT table_name, COUNT(*) as translations, COUNT(DISTINCT record_id) as records
FROM translations 
WHERE table_name IN ('menu_categories','menu_items','allergens','dietary_tags','tax_categories')
GROUP BY table_name ORDER BY table_name;
" 2>&1

echo ""
echo "========================================="
echo " SAMPLE: Menu Item Translations (all locales)"
echo "========================================="
docker exec fnb-v3-postgres psql -U fnb_user -d fnb_enterprise_v3 -c "
SELECT mi.item_code, t.locale, t.column_name, t.translated_text 
FROM translations t JOIN menu_items mi ON mi.id = t.record_id AND t.table_name = 'menu_items'
ORDER BY mi.item_code, t.locale, t.column_name;
" 2>&1

echo ""
echo "========================================="
echo " CATEGORY + ALLERGEN + DIETARY Translations"
echo "========================================="
docker exec fnb-v3-postgres psql -U fnb_user -d fnb_enterprise_v3 -c "
SELECT t.table_name, t.record_id, 
  CASE t.table_name
    WHEN 'menu_categories' THEN (SELECT category_name FROM menu_categories WHERE id=t.record_id)
    WHEN 'allergens' THEN (SELECT display_name FROM allergens WHERE id=t.record_id)
    WHEN 'dietary_tags' THEN (SELECT display_name FROM dietary_tags WHERE id=t.record_id)
    WHEN 'tax_categories' THEN (SELECT category_name FROM tax_categories WHERE id=t.record_id)
  END as en_name,
  t.locale, t.column_name, t.translated_text
FROM translations t
WHERE t.table_name IN ('menu_categories','allergens','dietary_tags','tax_categories')
ORDER BY t.table_name, t.record_id, t.locale;
" 2>&1

echo ""
echo "✅ DONE — Check translations for accuracy"
